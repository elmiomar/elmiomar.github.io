---
title: "How synchronized Destroyed Our PostgreSQL Migration"
description: I migrated a file distribution service from SQLite to PostgreSQL expecting better concurrency. Instead, throughput dropped from 758 req/s to 49 req/s. The fix was two lines of code and a connection pool.
pubDate: 2026-02-08
tags:
  - Java
  - PostgreSQL
  - Performance
  - Debugging
---

I migrated a file distribution service from SQLite to PostgreSQL expecting better concurrency. Instead, throughput dropped from 758 req/s to 49 req/s, a 15x regression. The fix was two lines of code and a connection pool. Here's how I found it.

---

## The Service

I run a file caching and distribution service. Think of it as a CDN layer in front of deep archival storage. When a user requests a file, the service checks a cache inventory database ("do we have this file cached?") and if so, streams it directly from a local or S3-backed cache volume. If not, it pulls from long-term storage, serves it, and queues it for caching.

The architecture looks like this:

```
HTTP GET /files/{id}/{path}
  → Controller
    → CacheService.getFile(id, path)
      → inventoryDB.findObject(cacheKey)     // "is it cached?"
        → SQL: SELECT ... FROM objects WHERE objid=? AND cached=true
      → cacheVolume.getStream(objectName)    // open file handle
      → stream to response (100KB chunks)
```

The inventory database tracks which files live in which cache volumes: object IDs, sizes, checksums, volume assignments. Every file download starts with a database lookup.

## The SQLite Baseline

The original implementation used SQLite for the inventory database. SQLite lives in-process. No network, no TCP handshake, no connection negotiation. A query takes microseconds.

But there was a catch: every read method was wrapped in `synchronized`:

```java
public List<CacheObject> findObject(String id, int purpose) {
    // Build SQL...

    Object lock = (purpose >= VOL_FOR_GET) ? this : new Object();
    synchronized (lock) {
        return queryForObjects(sql);
    }
}
```

The comment in the code said: *"lock access to the db in case a deletion plan is in progress."*

This meant every concurrent file download had to wait in line to query the database. Thread 1 queries, threads 2-16 wait. Thread 2 queries, threads 3-16 wait. A single-lane bridge for all traffic.

With SQLite, this barely mattered. Each query was so fast (~50 microseconds) that the serialization overhead was invisible. Throughput was dominated by file streaming, not database access.

Baseline numbers at 16 concurrent connections:

```
SQLite: 758 req/s, 21ms avg latency (1MB files)
```

Good enough. Ship it.

## The PostgreSQL Migration

We needed to move to PostgreSQL. The service was being deployed across multiple instances, SQLite doesn't support concurrent writers from different processes, and the ops team wanted centralized inventory management.

The migration was straightforward. PostgreSQL supports the same SQL. I added a JDBC driver, created a factory method, swapped the connection URL. The same `JDBCStorageInventoryDB` base class worked for both backends. It just called `DriverManager.getConnection(url)` with a different URL.

I ran the benchmarks:

```
PostgreSQL: 49 req/s, 321ms avg latency (1MB files)
```

A 15x regression. At 128 concurrent connections, the average latency was **1.4 seconds** with 418 timeout errors. Something was catastrophically wrong.

## Finding the Bottleneck

### Hypothesis 1: "PostgreSQL is just slower than SQLite"

I ruled this out immediately. PostgreSQL handles millions of queries per second in production systems worldwide. A simple `SELECT ... WHERE objid='x' AND cached=true` on a table with 27 rows should take under 1ms. The 321ms latency pointed to something structural, not database performance.

### Hypothesis 2: The `synchronized` Block

I traced the hot path. Every file download calls `inventoryDB.findObject()`, which is `synchronized(this)`. With 16 concurrent Tomcat threads all downloading files, all 16 threads serialize through the same lock, one at a time.

With SQLite, each critical section lasted ~50 microseconds. Even with 16 threads queuing, worst-case wait was 16 × 50µs = 800µs. Invisible.

But PostgreSQL isn't in-process. Each query now requires:
1. `DriverManager.getConnection()`, a TCP connection to PostgreSQL
2. SQL execution
3. Result transfer over TCP
4. Connection close

The `getConnection()` call alone takes ~20ms over localhost Docker. So the critical section went from 50µs (SQLite) to 20+ms (PostgreSQL). With 16 threads serialized:

```
Worst-case wait: 16 × 20ms = 320ms ← matches our observed latency exactly
```

I confirmed by removing `synchronized` from the read path:

```java
public List<CacheObject> findObject(String id, int purpose) {
    // Build SQL...
    return queryForObjects(sql);  // no lock
}
```

```
PostgreSQL (no sync): 68 req/s, 232ms avg latency
```

A 39% improvement. But still terrible. The latency dropped by 90ms but was still 232ms. Something else was going on.

### Hypothesis 3: Connection Overhead

I looked at what `queryForObjects()` does:

```java
public List<CacheObject> queryForObjects(String sql) {
    Connection conn = null;
    Statement stmt = null;
    try {
        conn = connect();           // ← new TCP connection every time
        stmt = conn.createStatement();
        ResultSet rs = stmt.executeQuery(sql);
        // extract results...
        return results;
    } finally {
        stmt.close();
        conn.close();               // ← connection destroyed
    }
}

protected Connection connect() {
    return DriverManager.getConnection(_dburl);  // TCP handshake + auth
}
```

Every single database query, every file download, established a new TCP connection to PostgreSQL, authenticated, executed one SELECT, and tore down the connection. For SQLite, `DriverManager.getConnection("jdbc:sqlite:file.db")` is essentially free (it opens a file handle). For PostgreSQL, it's a full TCP round-trip with authentication.

I measured: ~20ms per `getConnection()` call. With 16 concurrent requests, even without `synchronized`, each thread was still spending 20ms just connecting before it could query.

## The Fix: Connection Pooling

I added HikariCP and configured a pool of 20 connections:

```java
public static InventoryDB createPostgresDB(String jdbcUrl) {
    HikariConfig config = new HikariConfig();
    config.setJdbcUrl(jdbcUrl);
    config.setMaximumPoolSize(20);
    config.setMinimumIdle(5);
    config.setConnectionTimeout(5000);
    HikariDataSource pool = new HikariDataSource(config);

    return new PostgresInventoryDB(jdbcUrl) {
        @Override
        protected Connection connect() {
            return pool.getConnection();  // borrow from pool (~0.01ms)
        }
    };
}
```

The beauty of this approach: I only changed `connect()`. The existing `queryForObjects()` pattern (connect, execute, close) still works. But now `connect()` borrows a pre-established connection from the pool (microseconds), and `close()` returns it to the pool instead of destroying it.

```
PostgreSQL (no sync + pool): 573 req/s, 28ms avg latency
```

## The Full Picture

| Configuration | Req/s (16 conns) | Avg Latency | vs Original PG |
|:---|:---:|:---:|:---:|
| SQLite + synchronized | 758 | 21ms | - |
| **PostgreSQL + synchronized** | **49** | **321ms** | **baseline** |
| PostgreSQL - synchronized | 68 | 232ms | +39% |
| **PostgreSQL + pool** | **573** | **28ms** | **+1,069%** |

At high concurrency (128 connections), the improvement was even more dramatic:

| Configuration | Req/s | Timeouts |
|:---|:---:|:---:|
| PostgreSQL + synchronized | 50 | 418 |
| PostgreSQL + pool | 562 | 0 |

And for large files (10MB), PostgreSQL with pooling actually **beat** SQLite:

| Configuration | Req/s (10MB files) | Transfer/sec |
|:---|:---:|:---:|
| SQLite + synchronized | 65 | 659 MB/s |
| PostgreSQL + pool | 71 | 713 MB/s |

PostgreSQL can handle concurrent reads without contention thanks to MVCC. Once I removed the artificial bottlenecks, it could outperform SQLite on I/O-heavy workloads where the DB query is a tiny fraction of total request time.

## Why the `synchronized` Existed (And Why It Was Wrong)

The original developer added `synchronized` with this comment:

```java
// lock access to the db in case a deletion plan is in progress
```

The reasoning: the cache periodically runs deletion plans to evict old objects and free space. A deletion plan removes objects from both the filesystem and the database. If a read query runs mid-deletion, it might find an object in the database that no longer exists on disk.

This reasoning has two problems:

**Problem 1: The protection was incomplete.** The `synchronized` only covered the DB query. The gap between "DB says object exists" and "open file handle" was always unprotected:

```java
// Inside BasicCache.findObject():
List<CacheObject> results = db.findObject(id);  // synchronized ← lock held here
// lock released
if (volume.exists(obj.name)) {   // ← deletion can happen here
    return obj;                   // ← or here
}
// Caller later calls:
volume.getStream(obj.name);      // ← or definitely here
```

A deletion plan could remove the file at any point after the lock was released. The `synchronized` created a false sense of safety.

**Problem 2: The consequence was harmless anyway.** The service already handled this race correctly in the download handler:

```java
try {
    CacheObject co = cache.findObject(cacheKey);
    if (co != null && co.volume != null)
        return co.volume.getStream(co.name);
} catch (StorageVolumeException ex) {
    log.warn("Falling back to direct extraction due to cache error");
}
// Fallback: serve from long-term storage
return longTermStorage.getFile(id, path);
```

If the file disappears between lookup and stream, the exception is caught and the service falls back to long-term storage. The user gets their file. A warning is logged. No data loss, no corruption, no user-visible error.

## The Lesson: Measure Before You Lock

The original `synchronized` block had essentially zero cost with SQLite. But it carried a hidden assumption: "database queries are instantaneous." When the database backend changed, that assumption broke, and a micro-optimization for thread safety became a macro-bottleneck that destroyed throughput.

Three principles from this experience:

**1. Synchronized blocks are O(n) in disguise.** A `synchronized` block with a 50µs critical section and 16 contending threads adds 800µs of total wait time. Change that critical section to 20ms (a network round-trip) and you've added 320ms. The lock itself didn't change. The work inside it did.

**2. Connection pooling is table stakes for networked databases.** `DriverManager.getConnection()` is a fine API for scripts, CLI tools, and tests. It has no place in a request-handling path for a service that talks to a database over the network. If you're using JDBC with PostgreSQL/MySQL/any networked DB, you need a connection pool. Full stop.

**3. Benchmark the migration, not just the feature.** I tested that PostgreSQL worked correctly (same query results, same behavior). I didn't test that it worked *fast*. A simple load test before deploying would have caught the 15x regression immediately.

## Implementation Checklist

If you're hitting a similar problem, like migrating from an in-process DB to a networked one or finding mysterious latency cliffs under concurrency, here's the diagnostic path:

1. **Establish a baseline.** Run a load test with your current (working) configuration. Record req/s, latency percentiles, and error rates at 1, 16, 64, and 128 concurrent connections.

2. **Check for `synchronized` in the hot path.** Search your codebase for `synchronized` blocks that wrap database calls, HTTP calls, or any I/O that now goes over the network. Each one is a potential serialization bottleneck.

3. **Measure connection overhead.** Time a bare `getConnection()` call. If it's >1ms, you need a pool. For reference: SQLite in-process ~0.01ms, PostgreSQL over localhost ~5ms, PostgreSQL over network ~20ms.

4. **Add connection pooling.** HikariCP for Java, pgBouncer for PostgreSQL-specific, `sqlalchemy.pool` for Python. Configure `maxPoolSize` to match your thread count.

5. **Remove unnecessary synchronization.** If your database supports MVCC (PostgreSQL, MySQL), concurrent reads are inherently safe. Keep `synchronized` on writes if your application logic requires it.

6. **Verify the fallback path.** Make sure your code handles the race condition where a cached object disappears between lookup and access. This race exists regardless of synchronization. It's inherent to any system with concurrent reads and deletes.

7. **Re-benchmark.** Compare against your baseline. You should see the networked DB approach or match the in-process DB for I/O-dominated workloads.

---

*The benchmarks in this post used wrk with 10-second test durations, 1MB and 10MB test files served from a local filesystem cache volume, inventory databases with 27 objects, PostgreSQL 16 running in Docker on localhost, and HikariCP 5.1.0 with a pool size of 20. Your numbers will vary, but the ratios should be similar for any service that serializes networked database access in a concurrent request path.*

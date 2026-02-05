---
layout:     minimal-post
title:      Fixing a Memory Leak by Migrating from AWS SDK v1 to v2
date:       2025-01-15 10:00:00
summary:    How a subtle HTTP connection handling issue in the old AWS SDK caused periodic service crashes, and the migration path to fix it.
categories:
 - Backend
comments: true
tags:
 - Java
 - AWS
 - Debugging
---

A service I work on was crashing periodically with OutOfMemoryError. The logs showed memory exhaustion, but the cause was not immediately obvious. After some investigation, I traced the issue back to the AWS SDK for Java v1 and how it handles HTTP connections.

## The Symptoms

The service would run fine for hours, sometimes days, then suddenly crash. Memory usage would climb steadily until the JVM ran out of heap space. Restarting the service would fix it temporarily, but the pattern would repeat.

The service uploads files to S3, and the crashes seemed to correlate with periods of high upload activity. That pointed me toward the S3 client code.

## The Root Cause

The AWS SDK for Java v1 uses Apache HttpClient under the hood for HTTP connections. To reuse connections efficiently (which is important for performance), the SDK requires that response streams be fully consumed or explicitly closed. If you do not drain the response properly, the connection cannot be returned to the pool and remains allocated.

The problem is subtle. The code might look correct at first glance. You call a method, get a response, and move on. But if the response body is not fully read, that connection leaks. Over time, with enough requests, you exhaust the connection pool and memory.

In our case, the issue was in how we handled S3 responses. The SDK v1 requires careful manual handling:

```java
S3Object s3Object = s3Client.getObject(bucketName, key);
try (S3ObjectInputStream inputStream = s3Object.getObjectContent()) {
    // Process the stream
    // Must fully consume or abort
} catch (Exception e) {
    // Even on error, need to abort to release connection
    s3Object.getObjectContent().abort();
    throw e;
}
```

Missing that abort call on exceptions, or not fully consuming the stream, causes the leak. The connection sits there, holding memory, waiting to be reused but never properly released.

## The Solution

AWS SDK for Java v2 handles this differently. The v2 SDK manages connections more gracefully and does not require the same manual draining logic. It uses a different HTTP client implementation and handles resource cleanup automatically in most cases.

Migrating to v2 meant rewriting the S3 integration code. The API is different, not just renamed methods but a different approach to handling requests and responses.

Here is what the v2 equivalent looks like:

```java
ResponseInputStream<GetObjectResponse> response =
    s3Client.getObject(GetObjectRequest.builder()
        .bucket(bucketName)
        .key(key)
        .build());

try (response) {
    // Process the stream
    // Connection handling is automatic
}
```

The v2 SDK also provides better async support and more intuitive builders, but the main win for us was fixing the memory leak without having to audit every code path for proper connection handling.

## Bonus: Multipart Uploads

While updating the S3 code, I also implemented multipart uploads for large files. S3 has a 5GB limit for single PUT operations, so files larger than that require multipart upload.

The v2 SDK has a high-level transfer manager that handles this automatically:

```java
S3TransferManager transferManager = S3TransferManager.builder()
    .s3Client(s3AsyncClient)
    .build();

Upload upload = transferManager.upload(UploadRequest.builder()
    .putObjectRequest(PutObjectRequest.builder()
        .bucket(bucketName)
        .key(key)
        .build())
    .source(filePath)
    .build());

upload.completionFuture().join();
```

The transfer manager handles splitting the file into parts, uploading them in parallel, and reassembling on the S3 side. It also handles retries for failed parts, which is important for large uploads over unreliable networks.

## Lessons Learned

Memory leaks are not always about forgetting to close resources. Sometimes they are about not knowing the specific requirements of a library. The AWS SDK v1 documentation does mention the connection draining requirement, but it is easy to miss.

When debugging memory issues, correlating the timing of crashes with specific operations can point you in the right direction. In this case, the correlation with S3 activity was the key clue.

Upgrading dependencies is not always just about getting new features. Sometimes the newer version fixes subtle issues that are hard to get right with the old one. The v2 SDK is not just a cosmetic update. It is a fundamentally better design for resource management.

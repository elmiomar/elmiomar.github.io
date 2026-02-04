---
layout:     minimal-post
title:      What Running 500 Trillion Objects Taught Me About Building for Scale
date:       2026-02-03 00:30:00
summary:    Notes and takeaways from AWS's talk on how S3 handles planetary scale storage, and what we can learn from it.
thumbnail:  /images/s3-cloud.jpg
categories:
 - Technology
 - Cloud
comments: true
tags:
 - AWS
 - S3
 - Distributed Systems
 - Architecture
---

I recently watched [a Pragmatic Engineer podcast episode](https://www.youtube.com/watch?v=5vL6aCvgQXU) featuring Mai-Lan Tomsen Bukovec, VP of Data and Analytics at AWS, who has been running Amazon S3 for more than a decade. S3 is one of the largest distributed systems ever built, storing and serving data for a significant portion of the internet. Behind its simple interface hides an enormous amount of engineering work, careful tradeoffs, and long-term thinking. As someone who works with distributed systems daily, I found myself pausing constantly to take notes. Here is what I learned, along with my own thoughts on why these lessons matter.

## The Scale Is Hard to Comprehend

Let us start with the numbers: **500 trillion objects**. That is not a typo. To put this in perspective, if you counted one object per second, it would take you about 15.8 million years to count them all. And S3 handles over **100 million requests per second** at peak.

When I first heard these numbers, my immediate thought was: how do you even begin to design for this? Most of us think about scaling in terms of thousands or maybe millions of users. AWS is operating at a scale where traditional approaches simply do not work anymore.

**My takeaway:** When designing systems, always ask yourself "what happens when this grows 1000x?" You might never reach that scale, but the mental exercise forces you to think about bottlenecks you would otherwise miss.

## 11 Nines of Durability: More Than Marketing

S3 promises 99.999999999% durability. That is eleven nines. In practical terms, if you stored 10 million objects, you would statistically expect to lose one object every 10,000 years.

What fascinated me was how they achieve this. It is not magic; it is redundancy across multiple availability zones, continuous integrity checking, and automated repair processes. They are constantly verifying data and fixing issues before they become problems.

**Personal note:** I have seen teams obsess over availability (uptime) while neglecting durability (data loss). S3's approach reminds me that these are different concerns. You can have 100% uptime and still lose data if you are not careful. In my own work, I now always ask: "What is our durability story?" before worrying about availability.

## The 2020 Strong Consistency Pivot

This was the most interesting part for me. For years, S3 had eventual consistency for overwrite PUTs and DELETEs. You would update an object, and for a brief window, you might read the old version. Developers built workarounds, used version IDs, or just hoped for the best.

Then in December 2020, AWS announced strong read-after-write consistency for all S3 operations. No more eventual consistency caveats. No application changes needed.

What struck me was the engineering courage this required. They essentially rewrote a fundamental behavior of a service that the entire internet depends on. The risk of breaking something was enormous.

**Why this matters to me:** I have been in meetings where we avoided making the right architectural change because "it is too risky" or "customers depend on the current behavior." AWS showed that with enough testing and preparation, you can make major changes to critical systems. The key is investing in the tooling and processes to do it safely.

### A Quick Note on Consistency Models

If you are not familiar with consistency models in distributed systems, here is a quick explanation:

**Eventual consistency** means that after you write data, different parts of the system might temporarily return different values. If you upload a file and immediately try to read it, you might get the old version (or no version) for a brief period. The system "eventually" converges to the correct state, but there is no guarantee of when. This is easier to implement at scale because replicas do not need to coordinate on every operation.

**Strong consistency** (or "read-after-write consistency") guarantees that once a write completes, any subsequent read will return that new value. If you upload a file, you can immediately read it back and get exactly what you wrote. This is what most developers intuitively expect, but it is harder to achieve in distributed systems because all replicas need to agree before confirming a write.

The trade-off is typically between consistency and performance/availability (see the CAP theorem). What made S3's 2020 change impressive is that they achieved strong consistency without sacrificing performance. They did this through clever engineering: they introduced a "witness" component that tracks cache freshness and gets notified every time an object changes. During reads, the system queries this witness to check if the cache has the latest data, only hitting the metadata store if the cache is stale. You can read the full technical details in [Werner Vogels' blog post](https://www.allthingsdistributed.com/2021/04/s3-strong-consistency.html).

## Formal Methods: Not Just for Academia

Here is something that surprised me: AWS uses formal methods extensively to verify S3's correctness. They write mathematical specifications of how components should behave, then use tools like TLA+ to prove properties about the system.

I will admit, I have always seen formal methods as an academic exercise, something you learn in school but never use in practice. AWS changed my mind. When you are operating at this scale, the cost of bugs is so high that investing in formal verification pays off.

**Practical insight:** You do not need to go full formal methods to benefit from this mindset. Even writing down invariants your system should maintain (in plain English) and checking them in tests can catch bugs that regular testing misses. I started doing this for critical paths in my own code, and it has already caught a few edge cases I would have missed.

## S3 Tables and the AI Play

The talk also covered S3 Tables, a newer feature that provides managed Apache Iceberg tables. This is clearly AWS positioning S3 for the AI/ML workload explosion. Training models on petabytes of data requires efficient table formats, and Iceberg's support for time travel and schema evolution makes it ideal.

**My prediction:** We are going to see more "data lake" features baked directly into object storage. The line between storage and database is blurring. Anything that reduces the complexity of working with massive datasets is a win in my book.

## What I am Taking Back to My Work

After watching this talk, I wrote down a few principles I want to apply to my own systems:

1. **Design for the failure case first.** S3 assumes disks will fail, networks will partition, and software will have bugs. The architecture accommodates these realities rather than hoping they will not happen.

2. **Invest in observability early.** You cannot fix what you cannot see. AWS's ability to detect and repair issues automatically comes from deep instrumentation.

3. **Strong consistency is worth the effort.** Eventual consistency seems simpler, but it pushes complexity to application developers. If you can offer strong consistency without sacrificing too much performance, do it.

4. **Testing at scale requires different tools.** Unit tests and integration tests are not enough for distributed systems. Chaos engineering, formal methods, and production testing all have roles to play.

5. **Do not be afraid to make big changes.** With proper preparation and tooling, you can evolve even the most critical systems.

## Final Thoughts

One thing the speaker said really stuck with me: "A lot of engineering is about constraints." Beautifully said. The best engineering is about building the best possible solution given the constraints: time, budget, team size, existing infrastructure, user expectations, performance requirements, regulatory compliance, and so on. S3 is a perfect example of this. Every design decision was shaped by the constraints of operating at planetary scale.

What impresses me most about S3 is not just the technical achievement; it is the operational discipline required to run it. Behind every one of those 500 trillion objects is a team making thousands of decisions about trade-offs, priorities, and risks.

If you work on distributed systems, I highly recommend watching the original talk. Even if you never operate at AWS scale, the principles translate to systems of any size.

What aspects of large-scale system design do you find most challenging? I would love to hear your thoughts in the comments.

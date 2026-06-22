---
title: "Optional and the Billion Dollar Mistake"
description: What java.util.Optional is really for, how to use it well, and the anti-patterns that quietly defeat the point.
pubDate: 2026-06-29
tags:
  - Java Weekly
  - Java
  - Language
difficulty: beginner
series: java-weekly
seriesOrder: 1
draft: false
---

In 2009 Tony Hoare, who introduced the null reference in 1965, called it his
"billion dollar mistake." He meant the decades of crashes, the
NullPointerExceptions, the defensive null checks scattered through every
codebase. Java carried that mistake forward for almost two decades. Then Java 8
added `java.util.Optional`, a small type whose whole job is to make "this value
might be absent" a thing the compiler and the reader can see, instead of a
landmine that goes off at runtime.

This post assumes JDK 21.

## The problem it solves

A method that returns a reference type can always return `null`, and nothing in
the signature warns you. Consider a lookup:

```java
User findByEmail(String email);
```

Does this return `null` when no user is found, or throw, or return some empty
object? You cannot tell from the type. The honest answer lives in the
documentation, if it exists, or in the source. So callers either check for null
every time out of fear, or forget once and ship a crash.

`Optional<User>` changes the signature into a promise:

```java
Optional<User> findByEmail(String email);
```

Now the type itself says: there may or may not be a user here, and you must deal
with both cases before you can touch the value.

## The mental model

Think of `Optional<T>` as a box that holds either exactly one value of type `T`
or nothing at all. You are not allowed to reach inside and grab the value
directly without acknowledging it might be empty. That single constraint is the
entire benefit: absence becomes something you handle on purpose rather than
something that ambushes you.

There are two boxes you can create:

```java
Optional<String> present = Optional.of("hello");
Optional<String> empty = Optional.empty();
```

And one that decides for you based on a possibly-null value:

```java
Optional<String> maybe = Optional.ofNullable(possiblyNull);
```

Use `Optional.of` only when you are certain the value is non-null; it throws if
you pass `null`. Use `ofNullable` when null is a real possibility.

## A minimal example

The point of Optional is what you do with the box, not how you make it. The good
operations let you transform and supply defaults without ever writing an
explicit null check:

```java
Optional<String> name = Optional.of("Ada");

String shouted = name
    .map(String::toUpperCase)
    .orElse("UNKNOWN");

System.out.println(shouted); // ADA
```

If `name` had been empty, `map` would simply do nothing and `orElse` would
return `"UNKNOWN"`. No branching, no null check, no crash.

## A realistic example

Here is a lookup that may not find anything, consumed cleanly by the caller:

```java
public Optional<User> findByEmail(String email) {
    return users.stream()
        .filter(u -> u.email().equals(email))
        .findFirst();
}

public String displayName(String email) {
    return findByEmail(email)
        .map(User::name)
        .orElse("Guest");
}
```

Notice that `Stream.findFirst` already returns an `Optional`. The whole chain
reads as a sentence: find the user, take their name, and if there is no user,
fall back to "Guest." The absence case is handled, and it is impossible to
forget it, because the compiler will not let you call `User::name` on a missing
user.

When the fallback is expensive to compute, use `orElseGet`, which only runs when
the value is absent:

```java
String name = findByEmail(email)
    .map(User::name)
    .orElseGet(() -> loadDefaultName());
```

And when absence is genuinely an error, turn it into one explicitly:

```java
User user = findByEmail(email)
    .orElseThrow(() -> new UserNotFoundException(email));
```

## Pitfalls and anti-patterns

Optional is easy to misuse in ways that bring back the exact problem it was
meant to remove.

**Calling get without checking.** `optional.get()` throws
`NoSuchElementException` when empty, which is just a NullPointerException wearing
a different hat. If you find yourself writing `if (o.isPresent()) return o.get();`
you have reinvented the null check by hand. Use `map`, `orElse`, `orElseGet`, or
`orElseThrow` instead.

```java
// Anti-pattern: a NullPointerException with extra steps
Optional<User> o = findByEmail(email);
if (o.isPresent()) {
    return o.get().name();
}
return "Guest";

// Better: let the box do the unwrapping
return findByEmail(email)
    .map(User::name)
    .orElse("Guest");
```

**Optional fields.** Do not use `Optional` for class fields. It is not
serializable, it adds an allocation per field, and it was never designed for
that. Model an absent field as a nullable field or a separate type, and use
Optional at the boundary where you return it.

```java
// Anti-pattern: Optional as a field
class User {
    private Optional<String> middleName; // not serializable, extra allocation
}

// Better: a plain nullable field, Optional only when you hand it out
class User {
    private String middleName; // may be null

    Optional<String> middleName() {
        return Optional.ofNullable(middleName);
    }
}
```

**Optional parameters.** Do not accept `Optional` as a method parameter. It
forces callers to wrap arguments and still lets them pass `null` for the
Optional itself. Overload the method or accept a nullable argument instead.

```java
// Anti-pattern: callers must wrap, and can still pass null
void register(String name, Optional<String> referrer) { ... }
register("Ada", Optional.empty());
register("Ada", null); // compiles, and defeats the whole point

// Better: overload, or accept a nullable argument
void register(String name) { register(name, null); }
void register(String name, String referrer) { ... }
```

**Optional of a collection.** Never return `Optional<List<T>>`. An empty list
already means "nothing here." Return an empty collection and save everyone the
double check.

```java
// Anti-pattern: two different ways to say "nothing"
Optional<List<Order>> findOrders(String userId); // empty Optional? empty list?

// Better: an empty list already means "nothing here"
List<Order> findOrders(String userId); // returns List.of() when none
```

**Wrapping then immediately unwrapping.** `Optional.ofNullable(x).orElse(y)` is
just a verbose ternary. If you are not chaining a transformation in between,
plain code is clearer.

```java
// Anti-pattern: a verbose ternary
String name = Optional.ofNullable(input).orElse("default");

// Better: just write the ternary
String name = input != null ? input : "default";
```

## Where you see it in the wild

Optional shows up across the standard library and common frameworks once you
start looking. `Stream.findFirst` and `findAny` return it. `Stream.reduce`
without an identity returns it. Several map operations and
`DoubleStream.average` return it. Spring Data repositories return
`Optional<T>` from `findById`. The pattern is consistent: any API that might not
have a value to give you can say so in its return type instead of in a comment.

## Go deeper

- The [Javadoc for `java.util.Optional`](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/Optional.html),
  which states plainly that it is intended as a return type and not as a field
  or parameter.
- [Brian Goetz on the intent behind Optional](https://stackoverflow.com/a/26328555),
  from the Java language architect, explaining that it was designed as a return
  type for "no result" and not as a general purpose Maybe.
- [Tony Hoare's "Null References: The Billion Dollar Mistake"](https://www.infoq.com/presentations/Null-References-The-Billion-Dollar-Mistake-Tony-Hoare/),
  the talk where he apologizes for null, for the history of why it is the way it
  is.

**Takeaway:** Optional is not a null wrapper to sprinkle everywhere. It is a way
to make absence visible at API boundaries and to handle it with transformations
instead of branches. Use it as a return type, lean on `map`, `orElse`,
`orElseGet`, and `orElseThrow`, and never call `get` without a guarantee.

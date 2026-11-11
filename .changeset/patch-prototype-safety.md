---
'neotraverse': patch
---

`neotraverse/safe`: `patch`, `set` and `transform` can no longer reach or change a built-in prototype (GHSA-cg7r-g8r9-c93w). `patch` now refuses a `__proto__`, `constructor` or `prototype` path segment with a TypeError before it applies any op, and `set` only walks through the object's own data, the same data `get` reads.

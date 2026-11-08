---
'neotraverse': patch
---

`forEachAsync` and `mapAsync` no longer copy the path and the ancestor list for every child, so deeply nested input no longer slows them down with the square of the depth.

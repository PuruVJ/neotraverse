---
'neotraverse': patch
---

`diff` no longer copies the path at every key, so it is faster on large and deeply nested input; the ops it returns are the same.

---
'neotraverse': patch
---

`parseJsonPointer` (and `patch`, which uses it) skips the unescape step for segments without a `~`, the usual case.

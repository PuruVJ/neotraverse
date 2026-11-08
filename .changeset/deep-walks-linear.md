---
'neotraverse': patch
---

`forEach`, `map`, `reduce`, `paths`, `nodes` and the other depth-first walks no longer slow down with the square of the depth on deeply nested data: the circular check is a Map lookup past 32 levels instead of a scan of every ancestor.

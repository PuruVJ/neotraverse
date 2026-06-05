---
'neotraverse': minor
---

Add tree-shakeable functional API to `neotraverse/modern`; deprecate the `Traverse` class (JSDoc only). Set `sideEffects: false` on the package. Standalone functions take options as the last argument; the class remains unchanged for 0.7 and will be removed in a later release.

---
'neotraverse': minor
---

### Functional `neotraverse/modern` API

- Tree-shakeable standalone functions (`import * as t` or named imports); options as the **last** argument.
- `sideEffects: false` for bundler dead-code elimination.
- `Traverse` class is **deprecated** (JSDoc only, no runtime warning) and will be **removed in 0.8**.

### New helpers (functions only)

`findPaths`, `filterPaths`, `getPath`, `setPath`, `hasPath`, `parsePath`, `count`, `size`, `getType`, `deleteWhere`, `prune`, `pruneDeep`, `deepEqual`, `toJSON`, `freeze`, `diff`, `patch`, `select`.

### Type handling

- `getType()` tags include `function`, `weakmap`, `weakset`, `arraybuffer`, `dataview`, and the existing built-ins.
- `clone` / `copy` handle `ArrayBuffer`, `DataView`, and weak collections explicitly.
- Docs: [types & traversal](https://neotraverse.puruvj.dev/guide#types-and-traversal) (JSON-like trees, walk vs clone matrix).

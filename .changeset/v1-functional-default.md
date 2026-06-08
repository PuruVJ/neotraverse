---
"neotraverse": major
---

# 1.0 — the functional API is now the default

neotraverse 1.0 makes the tree-shakeable **functional API the main export** and demotes the
class-based API to a thin, deprecated, opt-in import. The functions, their behaviour, the
security hardening, and the performance work from 0.7 are unchanged — the entry points moved.

## ⚠️ Breaking changes

| 0.7 | 1.0 |
| --- | --- |
| `import traverse from 'neotraverse'` (classic default) | `import traverse from 'neotraverse/legacy'` |
| `import { Traverse } from 'neotraverse'` | `import { Traverse } from 'neotraverse/modern'` |
| `import { map, clone, … } from 'neotraverse/modern'` | `import { map, clone, … } from 'neotraverse'` |

- **The root export (`neotraverse`) is now functional-only** — `map`, `clone`, `merge`,
  `diff`, `get`/`set`, `walk`, `sanitize`, and the rest of the helpers, plus the
  `TraverseOptions` / `TraverseContext` / `TraverseNodeType` types. No default export, no
  `Traverse` class.
- **`neotraverse/modern` now exports ONLY the deprecated `Traverse` class** (and the
  `TraverseContext` / `TraverseOptions` types its signatures use). The functional helpers it
  used to re-export move to the root. The class is also trimmed to the **same method set as
  the legacy `Traverse`** (`get`/`has`/`set`/`map`/`forEach`/`reduce`/`paths`/`nodes`/`clone`)
  — a deprecated API should not gain new powers. It will be **removed in v2**.
- **`neotraverse/legacy`** is unchanged: the classic `traverse`-compatible drop-in
  (ES2015, CJS + ESM). `require('neotraverse')` (CommonJS) still resolves here. The legacy
  build intentionally will **not** receive the modern security/performance work — it stays
  byte-for-byte behaviour-compatible with the original `traverse`.
- **No more minified build.** The package ships unminified ESM only; consumers minify in
  their own bundler. The export map is simpler as a result (no `production`/`development`
  conditions, no `dist/min`).

## Internal

- The functional implementation is split across small modules at the package root
  (`utils`/`clone`/`context`/`path`/`ops`) instead of one large file; the legacy build lives
  under `src/legacy/`. `dist/modern.js` reuses the root build's shared chunk instead of
  re-bundling the functional API. No change to what consumers import.

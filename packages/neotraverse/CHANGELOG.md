# Changelog

## 1.0.0

### Major Changes

- 7f7d18a: # 1.0 — the functional API is now the default

  neotraverse 1.0 makes the tree-shakeable **functional API the main export** and demotes the class-based API to a thin, deprecated, opt-in import. The functions, their behaviour, the security hardening, and the performance work from 0.7 are unchanged — the entry points moved.

  ## ⚠️ Breaking changes

  | 0.7                                                    | 1.0                                             |
  | ------------------------------------------------------ | ----------------------------------------------- |
  | `import traverse from 'neotraverse'` (classic default) | `import traverse from 'neotraverse/legacy'`     |
  | `import { Traverse } from 'neotraverse'`               | `import { Traverse } from 'neotraverse/modern'` |
  | `import { map, clone, … } from 'neotraverse/modern'`   | `import { map, clone, … } from 'neotraverse'`   |

  - **The root export (`neotraverse`) is now functional-only** — `map`, `clone`, `merge`, `diff`, `get`/`set`, `walk`, `sanitize`, and the rest of the helpers, plus the `TraverseOptions` / `TraverseContext` / `TraverseNodeType` types. No default export, no `Traverse` class.
  - **`neotraverse/modern` now exports ONLY the deprecated `Traverse` class** (and the `TraverseContext` / `TraverseOptions` types its signatures use). The functional helpers it used to re-export move to the root. The class is also trimmed to the **same method set as the legacy `Traverse`** (`get`/`has`/`set`/`map`/`forEach`/`reduce`/`paths`/`nodes`/`clone`) — a deprecated API should not gain new powers. It will be **removed in v2**.
  - **`neotraverse/legacy`** is unchanged: the classic `traverse`-compatible drop-in (ES2015, CJS + ESM). `require('neotraverse')` (CommonJS) still resolves here. The legacy build intentionally will **not** receive the modern security/performance work — it stays byte-for-byte behaviour-compatible with the original `traverse`.
  - **No more minified build.** The package ships unminified ESM only; consumers minify in their own bundler. The export map is simpler as a result (no `production`/`development` conditions, no `dist/min`).

  ## Internal

  - The functional implementation is split across small modules at the package root (`utils`/`clone`/`context`/`path`/`ops`) instead of one large file; the legacy build lives under `src/legacy/`. `dist/modern.js` reuses the root build's shared chunk instead of re-bundling the functional API. No change to what consumers import.

### Minor Changes

- 7f7d18a: # neotraverse/safe: a stack-safe, memory-bounded traversal core

  A new opt-in entry point, `neotraverse/safe`. It is a companion to the default functional API (not a replacement), for input that is **deep, untrusted, huge, or only partially consumed**.

  The default `neotraverse` walk is recursive, which is why it is fast, but a recursive walker overflows the call stack on deep enough input. `neotraverse/safe` runs on an iterative engine, so it traverses arbitrarily deep trees that crash a recursive walker. Measured: the default overflows past ~2,000 levels; `/safe` handles 200,000+. It is also lazy and copy-on-write.

  ## What it ships (twelve exports)

  - `visit`: a lazy iterator of `Visit` records that composes with native ES2025 iterator helpers (`.filter` / `.map` / `.find` / `.take` / `.toArray`, `Map.groupBy`, `for-of` + `break`), prunes with `v.skip()`, and matches a glob `pattern`.
  - `transform` / `transformAsync`: copy-on-write rewriting. Untouched subtrees are shared with the input, and `transform(x, () => {}) === x`. Edits are branded commands (`replace` / `remove` / `skip` / `stop`) returned from a destructurable `edit` factory, including a pattern-keyed rules record form.
  - `get` / `set` / `has`: one path family (dot string, JSON Pointer, or key array), template-literal typed, with copy-on-write `set`.
  - `clone` / `equal` / `merge` / `diff` / `patch` / `resolveRefs`: structural ops. `merge` adds array strategies (`concat` / `union` / `by`) and per-pattern `at` overrides.

  ## The honest trade-off

  `/safe` is not a universal upgrade. On a full eager scan it runs at roughly 0.8x the default (still about 4x faster than the original `traverse`), and materializing a whole tree costs a little more memory. It wins on stack safety, on early-exit and streaming memory (about 6x less on a `filter` then `take` chain), and on copy-on-write edits.

  Requires Node 22+ or evergreen browsers (it uses native ES2025 iterator helpers). See the guide: https://neotraverse.puruvj.dev/guide/safe

## 0.7.0

### Minor Changes

- 282133b: # Security hardening, a much faster modern build, new modern APIs, and a tsdown build

  This release hardens neotraverse against prototype pollution / injection when processing untrusted data, adds an opt-in DoS guard, makes the functional build ~5× faster on average (up to ~10× on core walks) and ~6× leaner on heap allocation (up to ~11×) than the original `traverse`, adds several modern-only APIs, and modernizes the toolchain. The default/legacy `traverse` API is unchanged — it remains a drop-in replacement.

  ## ⚠️ Breaking change

  The **legacy** build now targets **ES2015** instead of ES5 (it is built with rolldown/oxc, whose minimum target is ES2015). It remains CJS + ESM and a drop-in `traverse` replacement; only environments that required literal ES5 output — e.g. **Internet Explorer 11** — are affected.

  Browser / runtime support by build:

  | Build            | Target | Browsers                                      | Node |
  | ---------------- | ------ | --------------------------------------------- | ---- |
  | default / modern | ES2022 | Chrome/Edge 94+, Firefox 93+, Safari 15+      | 18+  |
  | legacy           | ES2015 | Chrome 51+, Firefox 54+, Safari 10+, Edge 15+ | 6+   |

  ## 🔒 Security — prototype pollution & injection

  When neotraverse runs on attacker-controlled objects or paths, three mutation sinks could be abused. All are now neutralized **silently** (no throw, data is preserved):

  - **`set(path, value)` — prototype pollution.** A path containing `__proto__` / `constructor` / `prototype` could, via the `constructor.prototype` gadget, write onto `Object.prototype` globally (for example when an intermediate node exposed an own, function-valued `constructor`). `set()` now refuses to navigate or write through these keys.
  - **`clone()` / `map()` / `copy()` — prototype injection.** Cloning or mapping an object parsed from untrusted JSON such as `{"__proto__":{"isAdmin":true}}` (where `__proto__` is an _own enumerable_ key) caused the produced object's prototype to carry attacker data, so `result.isAdmin` read `true`. Keys are now assigned without invoking the `__proto__` setter — the value is kept as an inert own data property — so the clone keeps its real prototype.
  - **`update()` write-sink** is likewise routed through the safe assignment.

  Legitimate prototype **preservation** is unchanged (`instanceof` still works after `clone()` / `map()`), and `get()` / `has()` continue to follow only own properties (no prototype-chain disclosure). All of the above are now covered by a dedicated regression suite (`test/security.test.ts`) so the fixes cannot silently regress.

  > This is the prototype-pollution class of vulnerability historically associated with the upstream `traverse` lineage. A GitHub Security Advisory / CVE id will be linked here once assigned.

  ## 🛡️ DoS guard — `maxDepth`

  New `maxDepth` option bounds recursion on deeply-nested untrusted input, throwing a catchable `RangeError` before the native stack overflow:

  ```js
  traverse(untrusted, { maxDepth: 1000 }).clone();
  ```

  Unlimited when omitted, so default behavior is unchanged.

  ## 🧱 Robustness

  - Cloning / mapping inputs that contain **boxed primitives** (`new String()`, …) no longer throws on their read-only index slots.
  - A `Symbol.toStringTag`-spoofed object (e.g. `{ [Symbol.toStringTag]: 'Date' }`) no longer collapses to an `Invalid Date`; it falls through to a faithful copy.

  ## ⚡ Performance

  Across the full benchmark matrix the geometric-mean speedup vs `traverse` is now **modern ≈ 4.8×** and **legacy ≈ 2.3×** — with core traversal ops averaging **~5.6×** (peak **~10×** on `clone · small`) and allocating **~5× less memory** per op.

  The **modern build was re-architected** for this: visiting a node used to allocate a context object **plus a fresh closure for every method** (`update`/`remove`/`before`/…) **plus a `modifiers` object plus a per-node path copy**. The new modern context is a class whose methods live on the prototype (one allocation per node), and `ctx.path` is derived lazily from the parent chain — so `forEach`/`map`/`clone`/`reduce`/`nodes` never pay for a path copy. Shared wins (both builds): `copy()`/`clone()` make 2–3 `toString` tag checks per node instead of 6–9, and child iteration no longer allocates a pairs array.

  Reproduce with `pnpm bench` (results in `bench/results.json`). The default and legacy builds keep the original, battle-tested implementation; only the modern context was rewritten (behaviour is identical — the full test suite passes on both builds).

  > For the `get` / `has` / `set` path helpers, prefer the **modern** build — the **legacy** (ES2015) build is slower there because private `#fields` are downleveled to WeakMaps.

  ## ✨ Modern build (`neotraverse/modern`)

  ### Tree-shakeable functions (recommended)

  Import standalone functions instead of `new Traverse(obj)`:

  ```ts
  import * as t from "neotraverse/modern";

  t.forEach(obj, (ctx, x) => {
    /* … */
  });
  t.map(
    obj,
    (ctx, x) => {
      /* … */
    },
    { maxDepth: 100 }
  );
  ```

  - **`sideEffects: false`** — unused exports drop from bundles.
  - **`Traverse` class deprecated** (JSDoc only); **removed in 0.8**. Options move to the last argument.

  ### Query, iteration, async, Map/Set

  - **Query** — `find`, `filter`, `some`, `every` (class or `t.find(obj, fn)`).
  - **Paths** — `findPaths`, `filterPaths`; string paths via `getPath` / `setPath` / `hasPath` (dot or JSON Pointer).
  - **Lazy iteration** — `entries`, `values` (and deprecated `for…of` on `Traverse`).
  - **Async** — `forEachAsync`, `mapAsync` + `signal` option.
  - **`Map` / `Set`** — `clone()` deep-clones entries; walk treats them as **leaves** (see types guide below).

  ### Structural helpers

  `count`, `size`, `getType`, `deleteWhere`, `prune`, `pruneDeep`, `deepEqual`, `toJSON`, `freeze`, `diff`, `patch`, `select`.

  ### Walk variants & merge

  - **`walk`**, **`breadthFirst`**, **`mapBfs`** — DFS vs level-order; `mapBfs` clones like `map`.
  - **`skipWhere`**, **`groupBy`**, **`merge`**, **`dereference`** (local `#/…` JSON Pointer `$ref` only).
  - **`descendIntoMapSet`** — opt-in descent into `Map` / `Set` entries during walks.
  - **`forEachAsync` / `mapAsync`** — `{ concurrency }` for parallel sibling callbacks (isolated path state).
  - **`ctx.nextSibling()` / `ctx.prevSibling()`** — adjacent sibling snapshots.
  - Deprecated **`Traverse`** class lives in `deprecated.ts` (still re-exported from `neotraverse/modern`).

  `getType()` reports `function`, `arraybuffer`, `dataview`, `weakmap`, `weakset`, and the usual built-ins. `clone` / `copy` handle `ArrayBuffer`, `DataView`, and weak collections explicitly. See [Types & traversal](https://neotraverse.puruvj.dev/guide/types#types-and-traversal) for JSON-like trees vs binary data vs Map walk/clone behaviour.

  ### CI

  - npm publish uses **trusted publishing** (OIDC); see `.github/PUBLISHING.md`.

  Additive for default/legacy `traverse` importers — only `neotraverse/modern` gains the new surface.

  ## 📖 Documentation

  - Split the monolithic guide into grouped pages: getting started (options, security, [**differences from traverse**](https://neotraverse.puruvj.dev/guide/vs-traverse)), concepts (types, context), and API reference (core, paths, structural, walk, query, iteration, async) with **examples colocated** on each API page.
  - Introduction hub at `/guide` — documentation map, example index, bundle-size range, migration pointers.
  - VitePress sidebar groups + [`llms.txt`](https://neotraverse.puruvj.dev/llms.txt) built from the full guide tree.
  - In-repo and JSDoc links updated (`/guide#…` → split routes).

  ## 📦 Bundle size (tree-shaken brotli)

  Documented **~2–6 KB brotli** range (guide, README, homepage, benchmarks): floor ≈ one walk terminal (`forEach`, `map`, …), ceiling ≈ all modern functions except deprecated `Traverse`. Path-only imports (`get` / `has` / `set`) are smaller (~0.3 KB) because they do not run a full-tree walk.

  - `pnpm bundle-size` — esbuild minify + brotli q11; writes `bench/bundle-sizes.json`.
  - Utility-first positioning: `sideEffects: false`, named imports from `neotraverse/modern`.

  ## 🔧 Tooling / build

  - Build migrated from **tsup → tsdown** (rolldown / oxc).
  - The **legacy** build now targets **ES2015** (rolldown's floor) instead of ES5. It is still CJS + ESM and a drop-in `traverse` replacement; only environments that required literal ES5 output are affected.
  - Dev dependencies updated to latest (Vitest 4, Vite 8, TypeScript 6); the unused `@swc/core` and `terser` were removed.

## 0.6.18

### Patch Changes

- 07e5f02: fix: CI build

## 0.6.17

### Patch Changes

- c73840d: fix: Actually add provenance

## 0.6.16

### Patch Changes

- af2405a: patch: Add changesets, provenance

## 0.6.15

PINNED: traverse@0.6.9

### Patch Changes

Pin `engines` field to `>= 10`

## 0.6.14

PINNED: traverse@0.6.9

### Patch Changes

Fix regression in legacy.mjs introduced in 0.6.13.

## 0.6.13

PINNED: traverse@0.6.9

### Patch Changes

Fix types for neotraverse/legacy for pre-TypeScript 4.5(when export maps were not supported).

## 0.6.12

PINNED: traverse@0.6.9

### Patch Changes

Earlier, neotraverse/legacy did not work with WebPack 4, as it does not support export maps. Now this package provides direct fallback for CJS.

## 0.6.11

PINNED: traverse@0.6.9

### Patch Changes

Fix types for neotraverse/legacy. I am sacrificing types for CJS in favor of ESM.

Use the following to get type-safety

```ts
const traverse = require("neotraverse/legacy");
//    ^ It isn't typed

const neoTraverse = traverse as traverse["default"];
//    ^ It is typed
```

## 0.6.10

PINNED: traverse@0.6.9

### Patch Changes

Fix types for neotraverse/legacy. Now both CJS and ESM are properly typed. CAVEAT: ESM import in typescript doesn't provide `TraverseContext` and `TraverseOptions` types. Import that from `neotraverse` instead.

Fresh start. Check out the [CHANGELOG](https://github.com/ljharb/js-traverse/blob/main/CHANGELOG.md#v069---2024-04-08) 0.6.9 for a list of changes prior to this release.

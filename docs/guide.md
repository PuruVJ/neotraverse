---
title: Introduction
outline: [2, 3]
---

# neotraverse

Traverse and transform objects by visiting every node on a recursive walk. A TypeScript rewrite of
[`traverse`](https://github.com/ljharb/js-traverse) with **0 dependencies**, **prototype-pollution hardening**,
and **~5× the throughput** with the functional API (up to **~10×** on core walks) and **~6× less allocation** per op.

::: tip Utility-first, tree-shakeable API
Import **only what you use** from `neotraverse` (`sideEffects: false`). Named imports like
`import { forEach } from 'neotraverse'` pull in one walk; importing every function is the upper bound.
See [Bundle size (brotli)](#bundle-size-brotli) below.

**Coming from `traverse`?** See [**Differences from traverse**](/guide/vs-traverse) (drop-in vs functional) or the
[**Legacy / Classic API**](/legacy) for the `this`-bound reference.
:::

- 🤌 **~2 to 6 KB brotli** (tree-shaken functional API; see [bundle range](#bundle-size-brotli))
- 🚥 Zero dependencies, no polyfills
- 🎹 Types included: drop `@types/traverse`
- 🛡️ Safe on untrusted input (see [Security](/guide/security))
- ⚡ ~5× faster and ~6× leaner than `traverse` with the functional API, up to ~10× / ~11× (see [benchmarks](/benchmarks))
- 🧰 Query helpers, lazy iteration, async traversal, `Map`/`Set` clone

## Install

```sh
npm install neotraverse
# or: pnpm add neotraverse / bun add neotraverse / yarn add neotraverse
```

## Quick start

```ts
import * as t from 'neotraverse';

const obj = { a: 1, b: 2, c: [3, 4] };

t.forEach(obj, (ctx, x) => {
  if (typeof x === 'number') ctx.update(x * 10);
});
// → { a: 10, b: 20, c: [30, 40] }
```

Named imports work too (`import { forEach, clone } from 'neotraverse'`) when you only need a few ops.

## Functional API

Each `t` method call is a **terminal** operation: one walk per invocation. There is no `pipe()` helper;
tree-to-tree ops such as `t.map` and `t.clone` compose as plain nested calls (`t.clone(t.map(obj, cb))`).

`t.reduce(obj, cb)` is **seedless**: the accumulator starts at the root and the root node is skipped. Pass an
explicit initial value as the third argument for a seeded fold: `t.reduce(obj, cb, 0)`. Seedless calls cannot
also pass options positionally; pass an explicit seed (for example `undefined`) if you need options.

## Bundle size (brotli) {#bundle-size-brotli}

Sizes are **brotli** after your bundler minifies and tree-shakes `neotraverse` (measured with esbuild;
see [`bench/bundle-sizes.json`](https://github.com/PuruVJ/neotraverse/blob/main/packages/neotraverse/bench/bundle-sizes.json)).
Reproduce with `pnpm bundle-size` in `packages/neotraverse`.

| What you import | Brotli (approx.) | Notes |
|-----------------|------------------|--------|
| **One walk terminal** (`forEach`, `map`, `find`, `size`, …) | **~2 KB** | Same ballpark for any single DFS callback op |
| **Path helpers only** (`get` / `has` / `set`, or `getPath`) | **~0.3 to 0.5 KB** | No full-tree walk, keyed access / parse only |
| **`clone` only** | **~0.9 KB** | Deep copy without installing the walk callback surface |
| **All functions** | **~5.8 KB** | Upper bound when you use the full toolkit |

**Range: ~2 to 6 KB brotli**, floor is one traversal (`forEach`-class import), ceiling is the full function surface.

::: tip Always use named imports
Pulling in every function without tree-shaking is ~5.8 KB brotli, same as “all functions”.
Use **named imports** so dead code drops out.
:::

## Documentation map

**Getting started**

- [Differences from traverse](/guide/vs-traverse): drop-in vs functional, what's new
- [Options](/guide/options): `immutable`, `maxDepth`, `signal`, `descendIntoMapSet`, `concurrency`
- [Security](/guide/security): prototype pollution, injection, DoS guard

**Concepts**

- [Types & traversal](/guide/types): `getType()` matrix, JSON-like trees, Map/Set behaviour
- [Context](/guide/context): `ctx` reference, `block`, siblings

**API reference** (reference + examples on each page)

- [Core](/guide/api/core): `map`, `forEach`, `reduce`, `paths`, `nodes`, `clone`, `get` / `set` / `has`
- [Paths & metrics](/guide/api/paths): string paths, `findPaths`, `select`, `count`, `getType`
- [Structural](/guide/api/structural): `deleteWhere`, `prune`, `deepEqual`, `toJSON`, `freeze`, `diff`, `patch`
- [Walk variants](/guide/api/walk): `walk`, BFS, `skipWhere`, `groupBy`, `merge`, `dereference`
- [Query](/guide/api/query): `find`, `filter`, `some`, `every`
- [Iteration](/guide/api/iteration): `entries`, `values`, Map/Set leaves
- [Async](/guide/api/async): `forEachAsync`, `mapAsync`, concurrency, `AbortSignal`

**More**

- [Legacy / Classic API](/legacy)
- [Migrating from traverse](/migration)
- [Benchmarks](/benchmarks)

## Example index {#example-index}

Runnable snippets live next to each API on the pages above:

| Recipe | Page |
|--------|------|
| In-place `forEach` (negatives → offset) | [Core → forEach](/guide/api/core#forEach) |
| Immutable `map` | [Core → map](/guide/api/core#map) |
| Scrub circular refs | [Core → map](/guide/api/core#map) |
| Dot / JSON Pointer paths | [Paths → getPath](/guide/api/paths#getPath) |
| Find / filter paths | [Paths → findPaths](/guide/api/paths#findPaths) |
| Redact secrets | [Structural → deleteWhere](/guide/api/structural#prune) |
| Freeze snapshot | [Structural → freeze](/guide/api/structural#freeze) |
| Cycle-safe JSON | [Structural → toJSON](/guide/api/structural#toJSON) |
| Diff / patch | [Structural → diff](/guide/api/structural#diff) |
| Leaf `filter` / `reduce` sum | [Query](/guide/api/query) |
| `block` / skip subtree | [Context](/guide/context) |
| `getType` branching | [Walk](/guide/api/walk) |
| Async translate | [Async](/guide/api/async) |

## Builds & browser support

The default `neotraverse` (functional) build is **ES2022** (Chrome/Edge 94+, Firefox 93+, Safari 15+, Node 18+, Deno, Bun).
For the classic `this`-bound API and an ES2015 build for older targets, see the [**Legacy / Classic API**](/legacy).

## Migrating from `traverse`

Start with [**Differences from traverse**](/guide/vs-traverse), then the [**Migration guide**](/migration) for
install steps, side-by-side diffs, and the class→function table.

## License

[MIT](https://github.com/PuruVJ/neotraverse/blob/main/packages/neotraverse/LICENSE), [Puru Vijay](https://puruvj.dev).

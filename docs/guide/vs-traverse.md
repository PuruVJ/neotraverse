---
title: Differences from traverse
outline: [2, 3]
---

# Differences from `traverse`

[`traverse`](https://github.com/ljharb/js-traverse) is the classic `this`-bound walker. **neotraverse** keeps that API as a drop-in (now at `neotraverse/legacy`), ships a **utility-first functional** API as the default `neotraverse` export, and hardens the engine for real-world JSON and config trees.

::: tip Pick your path
**Stay on `traverse` syntax?** `import traverse from 'neotraverse/legacy'`, one-line swap.

**Starting fresh or want tree-shaking?** `import { forEach } from 'neotraverse'`.

**Step-by-step upgrade?** See [Migrating from traverse](/migration).
:::

## At a glance

|                          | `traverse`                  | **neotraverse**                                                                                                                          |
| ------------------------ | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Dependencies**         | Ships with runtime deps     | **Zero**, no polyfills                                                                                                                   |
| **Types**                | `@types/traverse`           | **Built in**                                                                                                                             |
| **Untrusted JSON**       | Classic behaviour           | **Hardened**, pollution & injection safe ([Security](/guide/security))                                                                   |
| **Throughput**           | Baseline                    | **~3×** drop-in (`neotraverse/legacy`) · **~5×** functional API (`neotraverse`, up to **~10×** on core walks, [Benchmarks](/benchmarks)) |
| **Memory / walk**        | Baseline                    | **~2×** less allocation (drop-in) · **~6×** less (functional, up to **~11×** on wide `forEach`, [Benchmarks](/benchmarks))               |
| **Bundle (functional)**  | Monolithic import           | **Tree-shakeable** (`sideEffects: false`), [~2 to 6 KB brotli](/guide#bundle-size-brotli) for typical apps                               |
| **Default API**          | `traverse(obj).forEach(fn)` | **Functional** on `neotraverse`; classic drop-in on `neotraverse/legacy`                                                                 |
| **Recommended new code** | -                           | `neotraverse`, `forEach(obj, (ctx, x) => …)`                                                                                             |

## What stays the same

On the **legacy** build, the mental model is unchanged:

- `traverse(obj)` returns an instance with `.forEach`, `.map`, `.reduce`, `.paths`, `.nodes`, `.clone`, `.get`, `.set`, `.has`
- Callbacks use **`this`** as the traversal context (`this.update`, `this.path`, `this.isLeaf`, …)
- Options and return shapes match what you already know from `traverse`

```ts
import traverse from 'neotraverse/legacy';

traverse({ a: 1, b: 2 }).forEach(function (x) {
  if (typeof x === 'number') this.update(x * 10);
});
```

## What changes (even as a drop-in)

You get these wins **without** rewriting callbacks:

| Change                         | Why it matters                                                                                                                           |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **No `@types/traverse`**       | Types ship with the package                                                                                                              |
| **Prototype-pollution safety** | `clone` / `map` / `set` refuse hostile `__proto__` keys ([details](/guide/security))                                                     |
| **Faster, leaner walks**       | Same call shape, higher ops/sec and ~2× less heap per op ([benchmarks](/benchmarks))                                                     |
| **Drop-in lives at `/legacy`** | `import traverse from 'neotraverse/legacy'` (ES2015, CJS + ESM); the classic `this`-bound API stays behaviour-compatible with `traverse` |

## The functional API (default `neotraverse` export)

This is the biggest _optional_ difference, not required to migrate, but what most new projects should use. It is the recommended entry point.

### Callback shape: `this` → `ctx`

|         | `traverse` / `neotraverse/legacy` | `neotraverse` (functional)          |
| ------- | --------------------------------- | ----------------------------------- |
| Style   | `function (x) { this.update(…) }` | `(ctx, x) => { ctx.update(…) }`     |
| Context | `this`                            | First argument `ctx`                |
| Imports | Default export, chained methods   | **Named** functions, tree-shakeable |

```ts
import { forEach } from 'neotraverse';

forEach({ a: 1, b: 2 }, (ctx, x) => {
  if (typeof x === 'number') ctx.update(x * 10);
});
```

Every `this.*` field has the same name on `ctx` ([Context reference](/guide/context)).

### Options move to the last argument

```ts
// traverse
traverse(obj, { immutable: true }).map(fn);

// functional
import { map } from 'neotraverse';
map(obj, fn, { immutable: true });
```

### Class API is deprecated

`new Traverse(obj)` still works in **1.0** but is removed in **v2**. It lives at `neotraverse/modern` and is trimmed to the legacy method set only. Prefer the named functions from the default `neotraverse` export.

## Only on the functional API (no `traverse` equivalent)

These are **additive**, your old code keeps working; you opt in when you need them.

| Area               | Examples                                                                              |
| ------------------ | ------------------------------------------------------------------------------------- |
| **String paths**   | `getPath`, `setPath`, `hasPath`, `parseDotPath`, `parseJsonPointer`                   |
| **Path search**    | `findPaths`, `filterPaths`, `select` (glob), `count`, `size`                          |
| **Structural**     | `deleteWhere`, `prune`, `pruneDeep`, `deepEqual`, `toJSON`, `freeze`, `diff`, `patch` |
| **Walk control**   | `walk`, `breadthFirst`, `mapBfs`, `skipWhere`, `groupBy`, `merge`, `dereference`      |
| **Typing**         | `getType`, explicit node kinds (object, array, Map, Set, …)                           |
| **Lazy iteration** | `entries`, `values` generators                                                        |
| **Async**          | `forEachAsync`, `mapAsync` with `concurrency` and `AbortSignal`                       |
| **Map / Set**      | `descendIntoMapSet`, traverse collection entries, not just object keys                |

Full reference: [API docs](/guide/api/core) · [Example index](/guide#example-index).

## Three ways to adopt

::: code-group

```sh [1. Swap the package]
npm install neotraverse
npm uninstall traverse @types/traverse
```

```diff [2. Change the import]
-import traverse from 'traverse';
+import traverse from 'neotraverse/legacy';
```

```js [3. Or alias in the bundler: zero source edits]
// vite.config.js
export default {
  resolve: { alias: { traverse: 'neotraverse/legacy' } }
};
```

:::

Then optionally move hot paths to the **functional `neotraverse`** API for tree-shaking and arrow-friendly `ctx` callbacks.

## Which build should I use?

| Build                    | Import               | Use when                                                                                               |
| ------------------------ | -------------------- | ------------------------------------------------------------------------------------------------------ |
| **Default (functional)** | `neotraverse`        | New apps, TypeScript, tree-shaking, extra helpers, fastest `get`/`set`; the recommended entry          |
| **Deprecated class**     | `neotraverse/modern` | Only for existing `Traverse` class users; deprecated, removed in v2                                    |
| **Legacy**               | `neotraverse/legacy` | Drop-in replacement; `this`-bound API; older bundlers / CommonJS; still `traverse`-compatible (ES2015) |

## What you keep from `traverse`

- Deep walks, in-place updates, immutable `map`, `reduce`, path helpers on the instance
- The same context vocabulary (`update`, `delete`, `remove`, `block`, `skip`, keys, parents, circular handling)
- Familiar ergonomics on the legacy build, [Legacy / Classic API](/legacy)

## Next steps

- [**Migrating from traverse**](/migration): install, diff, class→function table, removal timeline
- [**Introduction**](/guide): quick start, bundle range, documentation map
- [**Security**](/guide/security): untrusted JSON, `maxDepth`
- [**Benchmarks**](/benchmarks): interactive charts vs `traverse`

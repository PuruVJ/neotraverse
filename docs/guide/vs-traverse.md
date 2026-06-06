---
title: Differences from traverse
outline: [2, 3]
---

# Differences from `traverse`

[`traverse`](https://github.com/ljharb/js-traverse) is the classic `this`-bound walker. **neotraverse** keeps that API as a
drop-in, adds a **utility-first modern** build, and hardens the engine for real-world JSON and config trees.

::: tip Pick your path
**Stay on `traverse` syntax?** `import traverse from 'neotraverse'`, one-line swap.  
**Starting fresh or want tree-shaking?** `import { forEach } from 'neotraverse/modern'`.  
**Step-by-step upgrade?** See [Migrating from traverse](/migration).
:::

## At a glance

| | `traverse` | **neotraverse** |
|---|-------------|-----------------|
| **Dependencies** | Ships with runtime deps | **Zero**, no polyfills |
| **Types** | `@types/traverse` | **Built in** |
| **Untrusted JSON** | Classic behaviour | **Hardened**, pollution & injection safe ([Security](/guide/security)) |
| **Throughput** | Baseline | **~2.3×** drop-in (`neotraverse` / legacy) · **~5×** functional API (`neotraverse/modern`, up to **~10×** on core walks, [Benchmarks](/benchmarks)) |
| **Memory / walk** | Baseline | **~2×** less allocation (drop-in) · **~6×** less (functional, up to **~11×** on wide `forEach`, [Benchmarks](/benchmarks)) |
| **Bundle (modern)** | Monolithic import | **Tree-shakeable** (`sideEffects: false`), [~2–6 KB brotli](/guide#bundle-size-brotli) for typical apps |
| **Default API** | `traverse(obj).forEach(fn)` | **Same** on `neotraverse` |
| **Recommended new code** | - | `neotraverse/modern`, `forEach(obj, (ctx, x) => …)` |

## What stays the same

On the **default** and **legacy** builds, the mental model is unchanged:

- `traverse(obj)` returns an instance with `.forEach`, `.map`, `.reduce`, `.paths`, `.nodes`, `.clone`, `.get`, `.set`, `.has`
- Callbacks use **`this`** as the traversal context (`this.update`, `this.path`, `this.isLeaf`, …)
- Options and return shapes match what you already know from `traverse`

```ts
import traverse from 'neotraverse';

traverse({ a: 1, b: 2 }).forEach(function (x) {
  if (typeof x === 'number') this.update(x * 10);
});
```

## What changes (even as a drop-in)

You get these wins **without** rewriting callbacks:

| Change | Why it matters |
|--------|----------------|
| **No `@types/traverse`** | Types ship with the package |
| **Prototype-pollution safety** | `clone` / `map` / `set` refuse hostile `__proto__` keys ([details](/guide/security)) |
| **Faster, leaner walks** | Same call shape, higher ops/sec and ~2× less heap per op ([benchmarks](/benchmarks)) |
| **ESM-first default** | `import traverse from 'neotraverse'` (ES2022); use `neotraverse/legacy` for ES2015 + CJS |

## The modern build (`neotraverse/modern`)

This is the biggest *optional* difference, not required to migrate, but what most new projects should use.

### Callback shape: `this` → `ctx`

| | `traverse` / default `neotraverse` | `neotraverse/modern` |
|---|-----------------------------------|----------------------|
| Style | `function (x) { this.update(…) }` | `(ctx, x) => { ctx.update(…) }` |
| Context | `this` | First argument `ctx` |
| Imports | Default export, chained methods | **Named** functions, tree-shakeable |

```ts
import { forEach } from 'neotraverse/modern';

forEach({ a: 1, b: 2 }, (ctx, x) => {
  if (typeof x === 'number') ctx.update(x * 10);
});
```

Every `this.*` field has the same name on `ctx` ([Context reference](/guide/context)).

### Options move to the last argument

```ts
// traverse
traverse(obj, { immutable: true }).map(fn);

// modern
import { map } from 'neotraverse/modern';
map(obj, fn, { immutable: true });
```

### Class API is deprecated

`new Traverse(obj)` still works in **0.7** but is removed in **0.8**. Prefer `import * as t from 'neotraverse/modern'` or named imports.

## Only on modern (no `traverse` equivalent)

These are **additive**, your old code keeps working; you opt in when you need them.

| Area | Examples |
|------|----------|
| **String paths** | `getPath`, `setPath`, `hasPath`, `parseDotPath`, `parseJsonPointer` |
| **Path search** | `findPaths`, `filterPaths`, `select` (glob), `count`, `size` |
| **Structural** | `deleteWhere`, `prune`, `pruneDeep`, `deepEqual`, `toJSON`, `freeze`, `diff`, `patch` |
| **Walk control** | `walk`, `breadthFirst`, `mapBfs`, `skipWhere`, `groupBy`, `merge`, `dereference` |
| **Typing** | `getType`, explicit node kinds (object, array, Map, Set, …) |
| **Lazy iteration** | `entries`, `values` generators |
| **Async** | `forEachAsync`, `mapAsync` with `concurrency` and `AbortSignal` |
| **Map / Set** | `descendIntoMapSet`, traverse collection entries, not just object keys |

Full reference: [API docs](/guide/api/core) · [Example index](/guide#example-index).

## Three ways to adopt

::: code-group

```sh [1. Swap the package]
npm install neotraverse
npm uninstall traverse @types/traverse
```

```diff [2. Change the import]
-import traverse from 'traverse';
+import traverse from 'neotraverse';
```

```js [3. Or alias in the bundler: zero source edits]
// vite.config.js
export default {
  resolve: { alias: { traverse: 'neotraverse' } },
};
```

:::

Then optionally move hot paths to **`neotraverse/modern`** for tree-shaking and arrow-friendly `ctx` callbacks.

## Which build should I use?

| Build | Import | Use when |
|-------|--------|----------|
| **Default** | `neotraverse` | Drop-in replacement; `this`-bound API; ES2022 ESM |
| **Modern** | `neotraverse/modern` | New apps, TypeScript, tree-shaking, extra helpers, fastest `get`/`set` |
| **Legacy** | `neotraverse/legacy` | Older bundlers / CommonJS; still `traverse`-compatible (ES2015) |

## What you keep from `traverse`

- Deep walks, in-place updates, immutable `map`, `reduce`, path helpers on the instance
- The same context vocabulary (`update`, `delete`, `remove`, `block`, `skip`, keys, parents, circular handling)
- Familiar ergonomics on the default build, [Legacy / Classic API](/legacy)

## Next steps

- [**Migrating from traverse**](/migration): install, diff, class→function table, removal timeline
- [**Introduction**](/guide): quick start, bundle range, documentation map
- [**Security**](/guide/security): untrusted JSON, `maxDepth`
- [**Benchmarks**](/benchmarks): interactive charts vs `traverse`

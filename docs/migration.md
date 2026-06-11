---
title: Migrating from traverse
outline: deep
---

# Migrating from `traverse`

neotraverse is a **drop-in replacement** for [`traverse`](https://github.com/ljharb/js-traverse). You can adopt it in two steps and stop there, or take one more step to the faster, ergonomic **functional API** (the default `neotraverse` export).

::: info Overview first?
For a scannable comparison (same vs different, functional-only helpers, which entry to pick), read [**Differences from traverse**](/guide/vs-traverse) in Getting started.
:::

## Step 1: install

```sh
npm install neotraverse
npm uninstall traverse @types/traverse   # types are built in now
```

## Step 2: swap the import (zero code changes)

The legacy build keeps the exact `traverse` API (`this`-bound callbacks):

```diff
-import traverse from 'traverse';
+import traverse from 'neotraverse/legacy';

 traverse(obj).forEach(function (x) {
   if (x < 0) this.update(x + 128);
 });
```

That's it. Same behaviour and zero-dependency. Full reference for this classic `this`-bound API: [**Legacy / Classic API**](/legacy).

## Step 3 (optional): go functional

The functional API (the default `neotraverse` export) replaces the `this`-bound context with explicit helpers and arguments, nicer with arrow functions and TypeScript, tree-shakeable, and the fastest entry for path operations.

### The same task, three ways

::: code-group

```js [traverse (before)]
import traverse from 'traverse';

traverse(obj).forEach(function (x) {
  if (typeof x === 'number') this.update(x * 10);
});
```

```js [neotraverse/legacy (drop-in)]
import traverse from 'neotraverse/legacy';

// identical to `traverse`, `this` is the context
traverse(obj).forEach(function (x) {
  if (typeof x === 'number') this.update(x * 10);
});
```

```js [neotraverse (functional)]
import { map } from 'neotraverse';

// explicit ctx argument (great with arrow functions)
const result = map(obj, (value, ctx) => {
  if (typeof value === 'number') ctx.update(value * 10);
});
```

:::

The only change between the drop-in and functional styles is **how you reach the context**:

| Concept       | `traverse` / `neotraverse/legacy` | `neotraverse` (functional) |
| ------------- | --------------------------------- | -------------------------- |
| Callback      | `function (x) { … }`              | `(value, ctx) => { … }`    |
| Current value | `x` (and `this.node`)             | `value` (and `ctx.node`)   |
| Update a node | `this.update(v)`                  | `ctx.update(v)`            |
| Is a leaf?    | `this.isLeaf`                     | `ctx.isLeaf`               |
| Path          | `this.path`                       | `ctx.path`                 |

Every context member is identical; only the way you reach it changes. See the [context reference](/guide/context).

::: warning Deprecated `Traverse` class
The `Traverse` class at `neotraverse/modern` is **deprecated and will be removed in v2**. It now exposes only the legacy method set (`get`/`has`/`set`/`map`/`forEach`/`reduce`/`paths`/`nodes`/`clone`). Reach for the functional API (the default `neotraverse` export) instead.
:::

## Old browsers / runtimes: `neotraverse/legacy`

For ES2015 / CommonJS environments, import the legacy build (also a drop-in for `traverse`):

```js
const traverse = require('neotraverse/legacy');
```

## Bundle-time aliasing (no code changes at all)

Point `traverse` at `neotraverse/legacy` in your bundler and leave imports untouched, e.g. Vite:

```js
// vite.config.js
export default {
  resolve: {
    alias: { traverse: 'neotraverse/legacy' }
  }
};
```

## New helpers (functional API)

These ship from the default `neotraverse` export, e.g. `import * as t from 'neotraverse'`, no `traverse` equivalent. See the [example index](/guide#example-index) and [types & traversal](/guide/types#types-and-traversal).

## What you gain

- 🛡️ [Prototype-pollution & injection safety](/guide/security) on untrusted input.
- ⚡ [~5× the throughput](/benchmarks) and **~6× less allocation** with the functional API (up to ~10× / ~11×); ~3× speed and ~2× memory on the drop-in build.
- 🤌 Zero dependencies, types included, ESM-first.

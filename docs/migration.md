---
title: Migrating from traverse
outline: deep
---

# Migrating from `traverse`

neotraverse is a **drop-in replacement** for [`traverse`](https://github.com/ljharb/js-traverse). You can adopt
it in two steps and stop there, or take one more step to the faster, ergonomic **modern** build.

::: info Overview first?
For a scannable comparison (same vs different, modern-only helpers, which build to pick), read
[**Differences from traverse**](/guide/vs-traverse) in Getting started.
:::

## Step 1: install

```sh
npm install neotraverse
npm uninstall traverse @types/traverse   # types are built in now
```

## Step 2: swap the import (zero code changes)

The default build keeps the exact `traverse` API (`this`-bound callbacks):

```diff
-import traverse from 'traverse';
+import traverse from 'neotraverse';

 traverse(obj).forEach(function (x) {
   if (x < 0) this.update(x + 128);
 });
```

That's it. Same behaviour, now zero-dependency, prototype-pollution-safe, and faster. Full reference for this
classic `this`-bound API: [**Legacy / Classic API**](/legacy).

## Step 3 (optional): go modern

The **modern** build (`neotraverse/modern`) replaces the `this`-bound context with an explicit `ctx` argument, nicer with arrow functions and TypeScript, and the fastest build for path operations.

### The same task, three ways

::: code-group

```js [traverse (before)]
import traverse from 'traverse';

traverse(obj).forEach(function (x) {
  if (typeof x === 'number') this.update(x * 10);
});
```

```js [neotraverse (drop-in)]
import traverse from 'neotraverse';

// identical to `traverse`, `this` is the context
traverse(obj).forEach(function (x) {
  if (typeof x === 'number') this.update(x * 10);
});
```

```js [neotraverse/modern]
import { Traverse } from 'neotraverse/modern';

// `ctx` is the context (great with arrow functions)
new Traverse(obj).forEach((ctx, x) => {
  if (typeof x === 'number') ctx.update(x * 10);
});
```

:::

The only change between the drop-in and modern styles is **how you reach the context**:

| Concept       | `traverse` / `neotraverse` | `neotraverse/modern`   |
| ------------- | -------------------------- | ---------------------- |
| Callback      | `function (x) { … }`       | `(ctx, x) => { … }`    |
| Current value | `x` (and `this.node`)      | `x` (and `ctx.node`)   |
| Update a node | `this.update(v)`           | `ctx.update(v)`        |
| Is a leaf?    | `this.isLeaf`              | `ctx.isLeaf`           |
| Path          | `this.path`                | `ctx.path`             |

Every context member is identical; only `this` → `ctx`. See the [context reference](/guide/context).

## Old browsers / runtimes: `neotraverse/legacy`

For ES2015 / CommonJS environments, import the legacy build (also a drop-in for `traverse`):

```js
const traverse = require('neotraverse/legacy');
```

## Bundle-time aliasing (no code changes at all)

Point `traverse` at `neotraverse` in your bundler and leave imports untouched, e.g. Vite:

```js
// vite.config.js
export default {
  resolve: {
    alias: { traverse: 'neotraverse' }, // or 'neotraverse/legacy'
  },
};
```

## New helpers (modern only)

These ship as `import * as t from 'neotraverse/modern'`, no `traverse` equivalent. See
the [example index](/guide#example-index) and [types & traversal](/guide/types#types-and-traversal).

## What you gain

- 🛡️ [Prototype-pollution & injection safety](/guide/security) on untrusted input.
- ⚡ [~5× the throughput](/benchmarks) and **~6× less allocation** with the functional API (up to ~10× / ~11×); ~2.3× speed and ~2× memory on the drop-in build.
- 🤌 Zero dependencies, types included, ESM-first.

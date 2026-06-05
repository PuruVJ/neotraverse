---
title: Migrating from traverse
outline: deep
---

# Migrating from `traverse`

neotraverse is a **drop-in replacement** for [`traverse`](https://github.com/ljharb/js-traverse). You can adopt
it in two steps and stop there — or take one more step to the faster, ergonomic **modern** build.

## Step 1 — install

```sh
npm install neotraverse
npm uninstall traverse @types/traverse   # types are built in now
```

## Step 2 — swap the import (zero code changes)

The default build keeps the exact `traverse` API (`this`-bound callbacks):

```diff
-import traverse from 'traverse';
+import traverse from 'neotraverse';

 traverse(obj).forEach(function (x) {
   if (x < 0) this.update(x + 128);
 });
```

That's it — same behaviour, now zero-dependency, prototype-pollution-safe, and faster. Full reference for this
classic `this`-bound API: [**Legacy / Classic API**](/legacy).

## Step 3 (optional) — go modern

The **modern** build (`neotraverse/modern`) replaces the `this`-bound context with an explicit `ctx` argument —
nicer with arrow functions and TypeScript, and the fastest build for path operations.

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

// identical to `traverse` — `this` is the context
traverse(obj).forEach(function (x) {
  if (typeof x === 'number') this.update(x * 10);
});
```

```js [neotraverse/modern (recommended)]
import { forEach } from 'neotraverse/modern';

forEach(obj, (ctx, x) => {
  if (typeof x === 'number') ctx.update(x * 10);
});
```

```js [neotraverse/modern (class, deprecated)]
import { Traverse } from 'neotraverse/modern';

new Traverse(obj).forEach((ctx, x) => {
  if (typeof x === 'number') ctx.update(x * 10);
});
```

:::

### Class to function mapping

| Class (`new Traverse(obj, opts)`) | Functional (`neotraverse/modern`) |
| --------------------------------- | --------------------------------- |
| `.forEach(cb)` | `forEach(obj, cb, opts?)` |
| `.map(cb)` | `map(obj, cb, opts?)` |
| `.reduce(cb, init?)` | `reduce(obj, cb, init?, opts?)` |
| `.find(fn)` | `find(obj, fn, opts?)` |
| `.filter(fn)` | `filter(obj, fn, opts?)` |
| `.some(fn)` / `.every(fn)` | `some(obj, fn, opts?)` / `every(obj, fn, opts?)` |
| `.paths()` / `.nodes()` | `paths(obj, opts?)` / `nodes(obj, opts?)` |
| `.clone()` | `clone(obj, opts?)` |
| `.get(path)` / `.has(path)` / `.set(path, val)` | `get(obj, path, opts?)` / `has` / `set` |
| `.entries()` / `for…of` | `entries(obj, opts?)` / `values(obj, opts?)` |
| `.forEachAsync(cb)` / `.mapAsync(cb)` | `forEachAsync(obj, cb, opts?)` / `mapAsync` |

Options move to the **last** argument. There is no `pipe()` helper.

### `Traverse` removal timeline

- **0.7.0:** standalone functions ship; class is **deprecated** (JSDoc only).
- **0.8.0 (planned):** class methods throw with a migration message.
- **0.9.0 / 1.0 (planned):** class removed from `neotraverse/modern`.

The only change between the drop-in and modern styles is **how you reach the context**:

| Concept       | `traverse` / `neotraverse` | `neotraverse/modern`   |
| ------------- | -------------------------- | ---------------------- |
| Callback      | `function (x) { … }`       | `(ctx, x) => { … }`    |
| Current value | `x` (and `this.node`)      | `x` (and `ctx.node`)   |
| Update a node | `this.update(v)`           | `ctx.update(v)`        |
| Is a leaf?    | `this.isLeaf`              | `ctx.isLeaf`           |
| Path          | `this.path`                | `ctx.path`             |

Every context member is identical — only `this` → `ctx`. See the [context reference](/guide#context).

## Old browsers / runtimes — `neotraverse/legacy`

For ES2015 / CommonJS environments, import the legacy build (also a drop-in for `traverse`):

```js
const traverse = require('neotraverse/legacy');
```

## Bundle-time aliasing (no code changes at all)

Point `traverse` at `neotraverse` in your bundler and leave imports untouched — e.g. Vite:

```js
// vite.config.js
export default {
  resolve: {
    alias: { traverse: 'neotraverse' }, // or 'neotraverse/legacy'
  },
};
```

## New helpers (modern only)

These ship as `import * as t from 'neotraverse/modern'` — no `traverse` equivalent:

`t.findPaths` / `t.filterPaths`, `t.getPath` / `t.setPath` / `t.hasPath`, `t.count` / `t.size`, `t.getType`,
`t.deleteWhere` / `t.prune`, `t.pruneDeep`, `t.deepEqual`, `t.toJSON`, `t.freeze`, `t.diff` / `t.patch`,
`t.select`. See the [guide examples](/guide#examples).

## What you gain

- 🛡️ [Prototype-pollution & injection safety](/guide#security) on untrusted input.
- ⚡ [~4.5× the throughput](/benchmarks) of `traverse` (modern build; up to ~7×).
- 🤌 Zero dependencies, types included, ESM-first.

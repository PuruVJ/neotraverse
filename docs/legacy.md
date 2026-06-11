---
title: Legacy / Classic API
outline: deep
---

# Legacy / Classic API

This is the original `traverse`-compatible API, a **drop-in replacement** for [`traverse`](https://github.com/ljharb/js-traverse). The traversal context is the callback's `this` binding (rather than a `ctx` argument). It ships as one build:

- **`neotraverse/legacy`:** a CJS + ESM build targeting **ES2015**, the one-line swap for users of the original `traverse`.

::: tip Building something new?
See [**Differences from traverse**](/guide/vs-traverse) for a full comparison. For new code, prefer the [**functional API**](/guide) (the default `neotraverse` export), the same engine, but tree-shakeable, with a `ctx` argument, query / iteration / async helpers, `Map`/`Set` clone, and the fastest path operations. This page documents the stable classic API, which stays a faithful `traverse` drop-in.
:::

## Install

```sh
npm install neotraverse
npm uninstall traverse @types/traverse   # types are built in now
```

## Quick start

The callback's `this` is the [context](#context):

```ts
import traverse from 'neotraverse/legacy';

const obj = { a: 1, b: 2, c: [3, 4] };

traverse(obj).forEach(function (x) {
  if (typeof x === 'number') this.update(x * 10);
});
// → { a: 10, b: 20, c: [30, 40] }
```

For CommonJS / older runtimes, require the same build (identical API):

```js
const traverse = require('neotraverse/legacy');
```

## Build & browser support

| Build      | Import               | Module    | Target | Browsers                                      |
| ---------- | -------------------- | --------- | ------ | --------------------------------------------- |
| **legacy** | `neotraverse/legacy` | CJS + ESM | ES2015 | Chrome 51+, Firefox 54+, Safari 10+, Edge 15+ |

::: warning Breaking change in 1.0
The legacy build now targets **ES2015** instead of ES5 (it is built with rolldown/oxc, whose floor is ES2015). It remains a CJS + ESM drop-in for `traverse`; only environments that required literal ES5 output, e.g. IE11, are no longer supported by the prebuilt bundle.
:::

## Security

::: warning Hardening lives in the functional API
The legacy build stays behaviour-compatible with the original `traverse`, so it intentionally does **not** carry the 1.0 security hardening (or the performance work). If you run on **untrusted data**, use the default [`neotraverse`](/guide) functional API, which refuses prototype-polluting keys, keeps the real prototype on `clone` / `map` of hostile JSON, and bounds recursion with `maxDepth`.
:::

Read the full audit story in the [**1.0 release post**](https://puruvj.dev/blog/neotraverse-1-0).

## Options

```ts
traverse(obj, {
  immutable: false, // if true, never mutate the original object
  includeSymbols: false // if true, also traverse own enumerable symbol keys
});
```

> Hardening options like `maxDepth` and the async-only `signal` option live on the default [`neotraverse`](/guide/options) functional API.

## Methods

Each method that takes an `fn` runs with the [context](#context) on `this`.

### `.map(fn)`

Run `fn` for each node and return a **new** object with the results. Update nodes in the result with `this.update(value)`.

### `.forEach(fn)`

Like `.map()`, but `update()` mutates the object **in place**.

### `.reduce(fn, acc)`

A [left-fold](<https://en.wikipedia.org/wiki/Fold_(higher-order_function)>) over every node. If `acc` is omitted, it starts as the root object and the root node is skipped.

### `.paths()`

Return an array of every non-cyclic path (each path an array of keys).

### `.nodes()`

Return an array of every node.

### `.clone()`

Create a deep clone. Handles circular references and `Date`/`RegExp`/`Error`/typed arrays. For prototype-pollution-safe cloning of untrusted data, use the default `neotraverse` functional API.

### `.get(path)` · `.set(path, value)` · `.has(path)`

Read / write / test the element at an array `path`.

> The query / iteration / async helpers (`find`, `filter`, `for…of`, `forEachAsync`, …) and `Map`/`Set` cloning live in the default [`neotraverse`](/guide/api/core) functional API.

## Context

Every callback runs with the context bound to `this`:

| Property                             | Description                                                             |
| ------------------------------------ | ----------------------------------------------------------------------- |
| `this.node`                          | The present node.                                                       |
| `this.path`                          | Array of keys from the root to the present node.                        |
| `this.parent` / `this.parents`       | The parent context / all ancestor contexts.                             |
| `this.key`                           | The key of the present node in its parent (`undefined` at the root).    |
| `this.isRoot` / `this.notRoot`       | Whether the node is the root.                                           |
| `this.isLeaf` / `this.notLeaf`       | Whether the node has no children.                                       |
| `this.isFirst` / `this.isLast`       | Whether the node is the first / last sibling.                           |
| `this.level`                         | Depth of the node within the traversal.                                 |
| `this.circular`                      | The ancestor context this node is a cycle back to, if any.              |
| `this.update(value, stopHere?)`      | Set a new value for the node. Stops descending when `stopHere` is true. |
| `this.remove(stopHere?)`             | Remove from the output (spliced from arrays, deleted otherwise).        |
| `this.delete(stopHere?)`             | `delete` from the parent (even on arrays).                              |
| `this.keys`                          | The node's keys, assign in `before()` to traverse in a custom order.    |
| `this.before(fn)` / `this.after(fn)` | Run before / after all children are traversed.                          |
| `this.pre(fn)` / `this.post(fn)`     | Run before / after **each** child is traversed.                         |
| `this.stop()`                        | Stop the entire traversal.                                              |
| `this.block()`                       | Don't descend into the current node's children.                         |

## Migrating from `traverse`

Swap the import, that's the whole migration:

```diff
-import traverse from 'traverse';
+import traverse from 'neotraverse/legacy';
```

See the [**Migration guide**](/migration) for the full `traverse → neotraverse/legacy → neotraverse` path.

## License

[MIT](https://github.com/PuruVJ/neotraverse/blob/main/packages/neotraverse/LICENSE), [Puru Vijay](https://puruvj.dev).

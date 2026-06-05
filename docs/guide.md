---
title: Documentation
outline: deep
---

# neotraverse

Traverse and transform objects by visiting every node on a recursive walk. A TypeScript rewrite of
[`traverse`](https://github.com/ljharb/js-traverse) with **0 dependencies**, **prototype-pollution hardening**,
and **~3× the performance**.

- 🤌 ~1.5–1.6 KB min+brotli
- 🚥 Zero dependencies, no polyfills
- 🎹 Types included — drop `@types/traverse`
- 🛡️ Safe on untrusted input (see [Security](#security))
- ⚡ ~2.9× faster than `traverse` ([benchmarks](/benchmarks))
- 🛸 ESM-first, with a legacy ES2015 CJS/ESM build

## Install

```sh
npm install neotraverse
# or: pnpm add neotraverse / bun add neotraverse / yarn add neotraverse
```

## Quick start

The modern build gives every callback a `ctx` argument:

```ts
import { Traverse } from 'neotraverse/modern';

const obj = { a: 1, b: 2, c: [3, 4] };

new Traverse(obj).forEach((ctx, x) => {
  if (typeof x === 'number') ctx.update(x * 10);
});
```

Or use the classic `this`-bound API (a drop-in for `traverse`):

```ts
import traverse from 'neotraverse';

const obj = { a: 1, b: 2, c: [3, 4] };

traverse(obj).forEach(function (x) {
  if (typeof x === 'number') this.update(x * 10);
});
```

## Which build to use?

`neotraverse` ships three builds:

| Build       | Import                  | Module       | Notes                                                   |
| ----------- | ----------------------- | ------------ | ------------------------------------------------------- |
| **default** | `neotraverse`           | ESM (ES2022) | Classic `traverse`-compatible API (`this`-bound).       |
| **modern**  | `neotraverse/modern`    | ESM (ES2022) | New `Traverse` class; state on a `ctx` argument.        |
| **legacy**  | `neotraverse/legacy`    | CJS + ESM    | ES2015 drop-in for `traverse` (old bundlers / runtimes). |

```js
// modern (recommended for new code)
import { Traverse } from 'neotraverse/modern';

// classic API, ESM
import traverse from 'neotraverse';

// legacy, CommonJS
const traverse = require('neotraverse/legacy');
```

### Browser & runtime support

The **default** and **modern** builds are **ES2022** (Chrome/Edge 94+, Firefox 93+, Safari 15+, Node 18+, Deno,
Bun). The **legacy** build is **ES2015 (ES6)** — Chrome 51+, Firefox 54+, Safari 10+, Edge 15+, Node 6+ — and
remains a CJS + ESM drop-in for `traverse`.

::: warning Breaking change in 0.7
The legacy build now targets **ES2015** instead of ES5 (it is built with rolldown/oxc, whose floor is ES2015).
Environments that required literal ES5 output — e.g. IE11 — are no longer supported by the prebuilt bundle.
:::

## Security

`neotraverse` is designed to be safe to run on **untrusted data**.

- **No prototype pollution.** `set(path, value)` refuses to navigate or write through `__proto__`,
  `constructor`, or `prototype`, so an attacker-controlled path can't reach `Object.prototype`.
- **No prototype injection.** `clone()`, `map()`, and `forEach()` assign keys without ever triggering the
  `__proto__` setter. An object parsed from hostile JSON such as `{"__proto__":{"isAdmin":true}}` is cloned with
  its real prototype intact — `result.isAdmin` is `undefined`, and the injected value is preserved as an inert own
  data property.
- **Prototype preservation still works.** Legitimate class instances keep their prototype (`instanceof` is
  unaffected) after `clone()`/`map()`.
- **No prototype-chain disclosure.** `get()` and `has()` only ever follow **own** properties.

```ts
import traverse from 'neotraverse';

const evil = JSON.parse('{"user":"bob","__proto__":{"isAdmin":true}}');
const safe = traverse(evil).clone();

safe.isAdmin;                         // undefined — not polluted
Object.getPrototypeOf(safe);          // Object.prototype
({}).isAdmin;                         // undefined — global prototype untouched
```

Read the story of the audit that produced these guarantees in the
[**0.7 release post**](https://puruvj.dev/blog/neotraverse-0-7).

### DoS guard — `maxDepth`

Traversal is recursive, so a deeply-nested hostile object can overflow the stack. Pass `maxDepth` to bound it; a
catchable `RangeError` is thrown before the native overflow. Unlimited when omitted (default behaviour is
unchanged).

```ts
import traverse from 'neotraverse';

try {
  traverse(untrusted, { maxDepth: 1000 }).clone();
} catch (e) {
  // RangeError: neotraverse: maximum traversal depth (1000) exceeded
}
```

## Options

```ts
traverse(obj, {
  immutable: false,      // if true, never mutate the original object
  includeSymbols: false, // if true, also traverse own enumerable symbol keys
  maxDepth: undefined,   // bound recursion depth (throws RangeError when exceeded)
});
```

## Examples

### Transform negative numbers in place

```ts
import { Traverse } from 'neotraverse/modern';

const obj = [5, 6, -3, [7, 8, -2, 1], { f: 10, g: -13 }];

new Traverse(obj).forEach((ctx, x) => {
  if (x < 0) ctx.update(x + 128);
});
// → [ 5, 6, 125, [ 7, 8, 126, 1 ], { f: 10, g: 115 } ]
```

### Collect leaf nodes

```ts
import { Traverse } from 'neotraverse/modern';

const leaves = new Traverse({ a: [1, 2, 3], b: 4, d: { e: [7, 8], f: 9 } }).reduce(
  (ctx, acc, x) => {
    if (ctx.isLeaf) acc.push(x);
    return acc;
  },
  [],
);
// → [ 1, 2, 3, 4, 7, 8, 9 ]
```

### Scrub circular references

```ts
import { Traverse } from 'neotraverse/modern';

const obj = { a: 1, b: 2, c: [3, 4] };
obj.c.push(obj);

const scrubbed = new Traverse(obj).map((ctx) => {
  if (ctx.circular) ctx.remove();
});
// → { a: 1, b: 2, c: [ 3, 4 ] }
```

## Migrating from `traverse`

It's a drop-in replacement — swap the import and you're done:

```diff
-import traverse from 'traverse';
+import traverse from 'neotraverse';
```

See the dedicated [**Migration guide**](/migration) for the full
`traverse → neotraverse → neotraverse/modern` path and a side-by-side diff.

## Methods

Each method that takes an `fn` runs with the [context](#context) below.

### `.map(fn)`

Run `fn` for each node and return a **new** object with the results. Update nodes in the result with
`ctx.update(value)` (modern) / `this.update(value)` (classic).

### `.forEach(fn)`

Like `.map()`, but `update()` mutates the object **in place**.

### `.reduce(fn, acc)`

A [left-fold](<https://en.wikipedia.org/wiki/Fold_(higher-order_function)>) over every node. If `acc` is omitted,
it starts as the root object and the root node is skipped.

### `.paths()`

Return an array of every non-cyclic path (each path an array of keys).

### `.nodes()`

Return an array of every node.

### `.clone()`

Create a deep clone. Handles circular references, `Date`/`RegExp`/`Error`/typed arrays, and is
prototype-pollution-safe.

### `.get(path)` · `.set(path, value)` · `.has(path)`

Read / write / test the element at an array `path`. `get`/`has` only follow own properties; `set` refuses
prototype-polluting keys.

## Context

Every callback receives a context — the `ctx` argument (modern) or `this` (classic):

| Property                            | Description                                                              |
| ----------------------------------- | ------------------------------------------------------------------------ |
| `node`                              | The present node.                                                         |
| `path`                              | Array of keys from the root to the present node.                         |
| `parent` / `parents`                | The parent context / all ancestor contexts.                              |
| `key`                               | The key of the present node in its parent (`undefined` at the root).     |
| `isRoot` / `notRoot`                | Whether the node is the root.                                            |
| `isLeaf` / `notLeaf`                | Whether the node has no children.                                        |
| `isFirst` / `isLast`                | Whether the node is the first / last sibling.                            |
| `level`                             | Depth of the node within the traversal.                                  |
| `circular`                          | The ancestor context this node is a cycle back to, if any.               |
| `update(value, stopHere?)`          | Set a new value for the node. Stops descending when `stopHere` is true.  |
| `remove(stopHere?)`                 | Remove from the output (spliced from arrays, deleted otherwise).         |
| `delete(stopHere?)`                 | `delete` from the parent (even on arrays).                               |
| `keys`                              | The node's keys — assign in `before()` to traverse in a custom order.    |
| `before(fn)` / `after(fn)`          | Run before / after all children are traversed.                          |
| `pre(fn)` / `post(fn)`              | Run before / after **each** child is traversed.                         |
| `stop()`                            | Stop the entire traversal.                                               |
| `block()`                           | Don't descend into the current node's children.                         |

## License

[MIT](https://github.com/PuruVJ/neotraverse/blob/main/packages/neotraverse/LICENSE) — Puru Vijay & James Halliday.

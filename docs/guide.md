---
title: Documentation
outline: deep
---

# neotraverse

Traverse and transform objects by visiting every node on a recursive walk. A TypeScript rewrite of
[`traverse`](https://github.com/ljharb/js-traverse) with **0 dependencies**, **prototype-pollution hardening**,
and **~4.5× the throughput** (up to ~7×).

::: tip This page documents the **modern** build
`neotraverse/modern` is the recommended API for new code: an explicit `ctx` argument (great with arrow functions
and TypeScript), the new query / iteration / async helpers, and the fastest path operations.

**Looking for a drop-in replacement for `traverse`?** That's the classic `this`-bound API — see the
[**Legacy / Classic API**](/legacy).
:::

- 🤌 ~2.2 KB min+brotli
- 🚥 Zero dependencies, no polyfills
- 🎹 Types included — drop `@types/traverse`
- 🛡️ Safe on untrusted input (see [Security](#security))
- ⚡ ~4.5× faster than `traverse` — up to ~7× (see [benchmarks](/benchmarks))
- 🧰 Query helpers, lazy iteration, async traversal, `Map`/`Set` clone

## Install

```sh
npm install neotraverse
# or: pnpm add neotraverse / bun add neotraverse / yarn add neotraverse
```

## Quick start

The modern build exports a `Traverse` class; every callback receives a `ctx` argument:

```ts
import { Traverse } from 'neotraverse/modern';

const obj = { a: 1, b: 2, c: [3, 4] };

new Traverse(obj).forEach((ctx, x) => {
  if (typeof x === 'number') ctx.update(x * 10);
});
// → { a: 10, b: 20, c: [30, 40] }
```

## Security

`neotraverse` is designed to be safe to run on **untrusted data**.

- **No prototype pollution.** `set(path, value)` refuses to navigate or write through `__proto__`,
  `constructor`, or `prototype`, so an attacker-controlled path can't reach `Object.prototype`.
- **No prototype injection.** `clone()`, `map()`, and `forEach()` assign keys without ever triggering the
  `__proto__` setter. An object parsed from hostile JSON such as `{"__proto__":{"isAdmin":true}}` is cloned with
  its real prototype intact — `result.isAdmin` is `undefined`, and the injected value is preserved as an inert
  own data property.
- **Prototype preservation still works.** Legitimate class instances keep their prototype (`instanceof` is
  unaffected) after `clone()`/`map()`.
- **No prototype-chain disclosure.** `get()` and `has()` only ever follow **own** properties.

```ts
import { Traverse } from 'neotraverse/modern';

const evil = JSON.parse('{"user":"bob","__proto__":{"isAdmin":true}}');
const safe = new Traverse(evil).clone();

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
import { Traverse } from 'neotraverse/modern';

try {
  new Traverse(untrusted, { maxDepth: 1000 }).clone();
} catch (e) {
  // RangeError: neotraverse: maximum traversal depth (1000) exceeded
}
```

## Options

```ts
new Traverse(obj, {
  immutable: false,      // if true, never mutate the original object
  includeSymbols: false, // if true, also traverse own enumerable symbol keys
  maxDepth: undefined,   // bound recursion depth (throws RangeError when exceeded)
  signal: undefined,     // AbortSignal — cancels forEachAsync()/mapAsync()
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

const leaves = new Traverse({ a: [1, 2, 3], b: 4, d: { e: [7, 8], f: 9 } }).filter((ctx) => ctx.isLeaf);
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

### Transform every node asynchronously

```ts
import { Traverse } from 'neotraverse/modern';

const translated = await new Traverse(doc).mapAsync(async (ctx, x) => {
  if (typeof x === 'string') ctx.update(await translate(x));
});
```

## Methods

Each method that takes an `fn` runs with the [context](#context) below.

### Core

#### `.map(fn)`

Run `fn` for each node and return a **new** object with the results. Update nodes in the result with
`ctx.update(value)`.

#### `.forEach(fn)`

Like `.map()`, but `update()` mutates the object **in place**.

#### `.reduce(fn, acc)`

A [left-fold](<https://en.wikipedia.org/wiki/Fold_(higher-order_function)>) over every node. If `acc` is omitted,
it starts as the root object and the root node is skipped.

#### `.paths()`

Return an array of every non-cyclic path (each path an array of keys).

#### `.nodes()`

Return an array of every node.

#### `.clone()`

Create a deep clone. Handles circular references, `Date`/`RegExp`/`Error`/typed arrays, and `Map`/`Set` (with
their entries deep-cloned), and is prototype-pollution-safe.

#### `.get(path)` · `.set(path, value)` · `.has(path)`

Read / write / test the element at an array `path`. `get`/`has` only follow own properties; `set` refuses
prototype-polluting keys.

### Query helpers

Array-style queries over every node (the root included).

#### `.find(fn)`

Return the first node for which `fn(ctx, value)` is truthy, or `undefined`. Stops walking as soon as it matches.

#### `.filter(fn)`

Return an array of every node for which `fn(ctx, value)` is truthy.

#### `.some(fn)` · `.every(fn)`

Return a boolean. `some` stops at the first match; `every` stops at the first node that fails.

```ts
const tree = { a: 1, b: { c: 2, d: 3 } };

new Traverse(tree).find((ctx, x) => x === 2); // 2
new Traverse(tree).filter((ctx) => ctx.isLeaf); // [1, 2, 3]
new Traverse(tree).some((ctx, x) => x > 2); // true
new Traverse(tree).every((ctx, x) => typeof x !== 'string'); // true
```

### Iteration — `for…of` / `.entries()`

`Traverse` is iterable, so you can pull nodes lazily without materializing `.nodes()` / `.paths()` first.
Circular references are visited once and not descended into.

#### `[Symbol.iterator]`

`for (const node of t)` and `[...t]` yield every node, depth-first (equivalent to `.nodes()`, but lazy).

#### `.entries()`

A generator yielding `[path, node]` pairs.

```ts
for (const node of new Traverse(tree)) {
  // every node
}

const all = [...new Traverse(tree)]; // same as .nodes()

for (const [path, node] of new Traverse(tree).entries()) {
  // path: PropertyKey[], node: the value at that path
}
```

### Async traversal

Async twins of `.forEach()` / `.map()` — the callback may be `async` and is awaited at each node.

#### `.forEachAsync(fn)`

Like `.forEach()`, but awaits the callback and mutates in place. Returns a promise of the (mutated) root.

#### `.mapAsync(fn)`

Like `.map()`, but awaits the callback and returns a new object, leaving the original intact.

Pass an [`AbortSignal`](https://developer.mozilla.org/docs/Web/API/AbortSignal) via the `signal` option to cancel
a long walk — it rejects on the next visited node.

```ts
const out = await new Traverse(tree).mapAsync(async (ctx, x) => {
  if (typeof x === 'number') ctx.update(await slowDouble(x));
});

const controller = new AbortController();
const walking = new Traverse(big, { signal: controller.signal }).forEachAsync(async (ctx) => {
  /* … */
});
controller.abort(); // → `walking` rejects with the abort reason
```

::: info `Map` / `Set` are leaf nodes
The traversal methods (`forEach`, `map`, `paths`, `nodes`, iteration) treat `Map`/`Set` as **leaf nodes** — their
entries use arbitrary-typed keys with no path semantics. Only `clone()` (and `map()`'s shallow copy) descend
into their entries.
:::

## Context

Every callback receives a context — the `ctx` argument:

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

## Builds & browser support

The **modern** build is **ES2022** (Chrome/Edge 94+, Firefox 93+, Safari 15+, Node 18+, Deno, Bun). For the
classic `this`-bound API and an ES2015 build for older targets, see the [**Legacy / Classic API**](/legacy).

## Migrating from `traverse`

It's a drop-in replacement — see the dedicated [**Migration guide**](/migration) for the full
`traverse → neotraverse → neotraverse/modern` path and a side-by-side diff.

## License

[MIT](https://github.com/PuruVJ/neotraverse/blob/main/packages/neotraverse/LICENSE) — Puru Vijay & James Halliday.

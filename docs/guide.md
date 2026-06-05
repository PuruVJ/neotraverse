---
title: Documentation
outline: [2, 3]
---

# neotraverse

Traverse and transform objects by visiting every node on a recursive walk. A TypeScript rewrite of
[`traverse`](https://github.com/ljharb/js-traverse) with **0 dependencies**, **prototype-pollution hardening**,
and **~4.5× the throughput** (up to ~7×).

::: tip This page documents the **modern** build
`neotraverse/modern` is the recommended API: **tree-shakeable** functions (`import * as t from 'neotraverse/modern'`), an explicit `ctx` argument, query / iteration / async helpers, and the fastest path operations.

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

Use a namespace import so each method is tree-shakeable. Every callback receives a `ctx` argument; pass options
as the **last** argument when you need them:

```ts
import * as t from 'neotraverse/modern';

const obj = { a: 1, b: 2, c: [3, 4] };

t.forEach(obj, (ctx, x) => {
  if (typeof x === 'number') ctx.update(x * 10);
});
// → { a: 10, b: 20, c: [30, 40] }
```

Named imports work too (`import { forEach, clone } from 'neotraverse/modern'`) when you only need a few ops.

## Functional API

Each `t` method call is a **terminal** operation: one walk per invocation. There is no `pipe()` helper;
tree-to-tree ops such as `t.map` and `t.clone` compose as plain nested calls (`t.clone(t.map(obj, cb))`).

`t.reduce(obj, cb)` is **seedless**: the accumulator starts at the root and the root node is skipped. Pass an
explicit initial value as the third argument for a seeded fold: `t.reduce(obj, cb, 0)`. Seedless calls cannot
also pass options positionally; pass an explicit seed (for example `undefined`) if you need options.

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
import * as t from 'neotraverse/modern';

const evil = JSON.parse('{"user":"bob","__proto__":{"isAdmin":true}}');
const safe = t.clone(evil);

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
import * as t from 'neotraverse/modern';

try {
  t.clone(untrusted, { maxDepth: 1000 });
} catch (e) {
  // RangeError: neotraverse: maximum traversal depth (1000) exceeded
}
```

## Options

Pass options as the **last** argument (for example `t.forEach(obj, cb, { maxDepth: 100 })`). `t.map` and
`t.mapAsync` always run immutably; other ops default to in-place mutation unless you set `immutable: true`.

```ts
{
  immutable: false,      // if true, never mutate the original object
  includeSymbols: false, // if true, also traverse own enumerable symbol keys
  maxDepth: undefined,   // bound recursion depth (throws RangeError when exceeded)
  signal: undefined,     // AbortSignal — cancels forEachAsync()/mapAsync()
}
```

## Examples

### Transform negative numbers in place

```ts
import * as t from 'neotraverse/modern';

const obj = [5, 6, -3, [7, 8, -2, 1], { f: 10, g: -13 }];

t.forEach(obj, (ctx, x) => {
  if (x < 0) ctx.update(x + 128);
});
// → [ 5, 6, 125, [ 7, 8, 126, 1 ], { f: 10, g: 115 } ]
```

### Immutable map (original untouched)

```ts
import * as t from 'neotraverse/modern';

const input = { a: 1, nested: { b: 2 } };
const out = t.map(input, (ctx, x) => {
  if (typeof x === 'number') ctx.update(x * 10);
});
// out → { a: 10, nested: { b: 20 } }
// input is unchanged
```

### Redact fields and strip secrets

```ts
import * as t from 'neotraverse/modern';

const apiPayload = {
  user: 'alice',
  token: 'secret',
  profile: { email: 'a@example.com', password: 'hunter2' },
};

const safe = t.deleteWhere(structuredClone(apiPayload), (_, x) =>
  x === 'secret' || x === 'hunter2',
);
// drops matching nodes; original apiPayload unchanged if you cloned first
```

### Dot-path read / write

```ts
import * as t from 'neotraverse/modern';

const config = { server: { host: 'localhost', port: 3000 } };

t.getPath(config, 'server.port'); // 3000
t.setPath(config, 'server.port', 8080);
t.hasPath(config, 'server.tls'); // false

// JSON Pointer (leading slash)
t.getPath(config, '/server/host'); // 'localhost' after set
```

### Find where a value lives

```ts
import * as t from 'neotraverse/modern';

const tree = { users: [{ id: 1 }, { id: 2, flag: true }] };

t.findPaths(tree, (_, x) => x === true); // ['users', '1', 'flag']
t.filterPaths(tree, (ctx) => ctx.isLeaf && typeof ctx.node === 'number');
// → [{ path: ['users','0','id'], node: 1 }, …]
```

### Glob-style `select`

```ts
import * as t from 'neotraverse/modern';

const data = { users: [{ email: 'a@x.com' }, { email: 'b@x.com' }] };

t.select(data, 'users[*].email');
// → [{ path: ['users','0','email'], node: 'a@x.com' }, …]
```

### Sum with `reduce`

```ts
import * as t from 'neotraverse/modern';

const nested = { a: 1, b: { c: 2, d: 3 } };
const sum = t.reduce(nested, (_, acc, x) => (typeof x === 'number' ? acc + x : acc), 0);
// 6
```

### Clone, then freeze for a read-only snapshot

```ts
import * as t from 'neotraverse/modern';

const snapshot = t.freeze(t.clone(liveConfig));
// snapshot is deeply frozen; liveConfig can still change
```

### Cycle-safe JSON for logging

```ts
import * as t from 'neotraverse/modern';

const graph: any = { name: 'root' };
graph.self = graph;

console.log(t.toJSON(graph)); // {"name":"root","self":null}
```

### Diff and patch (config updates)

```ts
import * as t from 'neotraverse/modern';

const v1 = { title: 'Hi', items: [1, 2] };
const v2 = { title: 'Hello', items: [1, 3], extra: true };

const ops = t.diff(v1, v2);
const v2FromV1 = t.patch(structuredClone(v1), ops);
// v2FromV1 deep-equals v2 (acyclic trees)
```

### Collect leaf nodes

```ts
import * as t from 'neotraverse/modern';

const leaves = t.filter({ a: [1, 2, 3], b: 4, d: { e: [7, 8], f: 9 } }, (ctx) => ctx.isLeaf);
// → [ 1, 2, 3, 4, 7, 8, 9 ]
```

### Scrub circular references

```ts
import * as t from 'neotraverse/modern';

const obj = { a: 1, b: 2, c: [3, 4] };
obj.c.push(obj);

const scrubbed = t.map(obj, (ctx) => {
  if (ctx.circular) ctx.remove();
});
// → { a: 1, b: 2, c: [ 3, 4 ] }
```

### Skip a subtree with `block`

```ts
import * as t from 'neotraverse/modern';

t.forEach(config, (ctx) => {
  if (ctx.key === 'skipMe') ctx.block();
  if (typeof ctx.node === 'number') ctx.update(ctx.node * 2);
});
// nodes under `skipMe` are not visited or updated
```

### Branch on node kind with `getType`

```ts
import * as t from 'neotraverse/modern';

t.map(doc, (ctx) => {
  switch (t.getType(ctx.node)) {
    case 'date':
      ctx.update(ctx.node.toISOString());
      break;
    case 'map':
    case 'set':
      // Map/Set are walk leaves — clone handles entries
      break;
  }
});
```

### Transform every node asynchronously

```ts
import * as t from 'neotraverse/modern';

const translated = await t.mapAsync(doc, async (ctx, x) => {
  if (typeof x === 'string') ctx.update(await translate(x));
});
```

## Methods

Import as `import * as t from 'neotraverse/modern'`. Each callback that takes `fn` receives the
[context](#context) below.

### Core

#### t.map {#t-map}

`t.map(obj, fn, options?)` runs `fn` for each node and returns a **new** object. Update nodes in the result with
`ctx.update(value)`.

#### t.forEach {#t-forEach}

`t.forEach(obj, fn, options?)` is like `t.map`, but `ctx.update()` mutates `obj` **in place** (returns the same
reference).

#### t.reduce {#t-reduce}

`t.reduce(obj, fn, init?, options?)` is a [left-fold](https://en.wikipedia.org/wiki/Fold_(higher-order_function))
over every node. Omit `init` to start from the root and skip the root node in the fold.

#### t.paths and t.nodes {#t-paths-nodes}

`t.paths(obj, options?)` and `t.nodes(obj, options?)` return every non-cyclic path or every node.

#### t.clone {#t-clone}

`t.clone(obj, options?)` deep-clones. Handles circular references, `Date`/`RegExp`/`Error`/typed arrays, and
`Map`/`Set` (entries deep-cloned), and is prototype-pollution-safe.

#### t.get, t.set, t.has {#t-get-set-has}

`t.get(obj, path, options?)`, `t.set(obj, path, value, options?)`, and `t.has(obj, path, options?)` read / write /
test at an array `path`. `get`/`has` only follow own properties; `set` refuses prototype-polluting keys.

### Paths & metrics

#### t.findPaths · t.filterPaths {#t-find-paths}

Return **where** a match occurred, not only the value. `findPaths` stops at the first hit; `filterPaths` returns
`{ path, node }[]`.

```ts
t.findPaths(tree, (_, x) => x?.type === 'error');
t.filterPaths(tree, (ctx) => ctx.level === 2);
```

#### t.getPath · t.setPath · t.hasPath {#t-string-paths}

String paths over array `get` / `set` / `has`. Dot notation (`a.b.0`) or JSON Pointer (`/a/b/0`). Unsafe segments
(`__proto__`, etc.) throw at parse time.

#### t.count · t.size {#t-count}

`size(obj)` counts every visited node. `count(obj, fn)` counts nodes where the predicate is true.

#### t.getType {#t-get-type}

`getType(value)` returns a stable tag (`'map'`, `'date'`, `'primitive'`, …) for branching inside callbacks.

### Structural helpers

#### t.deleteWhere · t.prune {#t-prune}

`deleteWhere` returns a new tree with matching nodes removed (`map` + `ctx.remove()`). `prune` keeps nodes where
the predicate is true (inverse). Map/Set stay whole leaves.

#### t.pruneDeep {#t-prune-deep}

Replace nodes deeper than `maxDepth` with a sentinel (default `null`). Unlike the `maxDepth` **option**, this does
not throw.

#### t.deepEqual {#t-deep-equal}

Structural compare with an explicit per-type contract (Dates by time, RegExp by source+flags, etc.). Optional
`compareFn` can override pairs. Not guaranteed to match `clone()` byte-for-byte (e.g. `Error` fields).

#### t.toJSON {#t-to-json}

`JSON.stringify` after a walk; circular references become `null` (configurable via `cycle`).

#### t.freeze {#t-freeze}

Deep-freeze in place (children before parents). Pair with `clone` when you need an immutable snapshot.

#### t.diff · t.patch {#t-diff}

RFC 6902 subset (`add` / `remove` / `replace`). `diff(a, b)` returns ops; `patch(clone(a), ops)` applies them.
Acyclic trees only.

#### t.select {#t-select}

Glob path query: `*`, `key[*]`, dot segments. For predicate search, use `filterPaths`.

### Query helpers

#### t.find, t.filter, t.some, t.every {#t-query}

`t.find`, `t.filter`, `t.some`, and `t.every` search over every node (root included). `find`/`some` stop at the
first match; `every` stops at the first failure.

```ts
import * as t from 'neotraverse/modern';

const tree = { a: 1, b: { c: 2, d: 3 } };

t.find(tree, (ctx, x) => x === 2); // 2
t.filter(tree, (ctx) => ctx.isLeaf); // [1, 2, 3]
t.some(tree, (ctx, x) => x > 2); // true
t.every(tree, (ctx, x) => typeof x !== 'string'); // true
```

### Lazy iteration — `t.entries` · `t.values`

Pull nodes without materializing `t.paths` / `t.nodes`. Circular references are visited once and not descended
into.

#### t.values {#t-values}

`for (const node of t.values(tree))` and `[...t.values(tree)]` yield every node depth-first (like `t.nodes()`, but
lazy).

#### t.entries {#t-entries}

`t.entries(obj, options?)` yields `[path, node]` pairs.

```ts
for (const node of t.values(tree)) {
  /* every node */
}

for (const [path, node] of t.entries(tree)) {
  /* path: PropertyKey[], node: value at that path */
}
```

### Async — `t.forEachAsync` · `t.mapAsync`

The callback may be `async` and is awaited at each node. Pass `signal` in options to cancel via
[`AbortController`](https://developer.mozilla.org/docs/Web/API/AbortController).

```ts
const out = await t.mapAsync(tree, async (ctx, x) => {
  if (typeof x === 'number') ctx.update(await slowDouble(x));
});

const controller = new AbortController();
const walking = t.forEachAsync(big, async (ctx) => { /* … */ }, { signal: controller.signal });
controller.abort(); // → `walking` rejects with the abort reason
```

::: info Map and Set are leaf nodes
`forEach`, `map`, `paths`, `nodes`, and lazy iteration treat `Map`/`Set` as **leaf nodes**. Only `clone` (and the
shallow `map` copy) descend into their entries.
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

## Deprecated: `Traverse` class (removed in 0.8)

In **0.7** you can still use `new Traverse(obj)`; it is deprecated (JSDoc only, no runtime warning) and will be
**removed in 0.8**. Prefer `import * as t from 'neotraverse/modern'` for tree-shaking and forward compatibility.

The class API mirrors the functional one: options were passed to the constructor instead of the last argument.

```ts
import { Traverse } from 'neotraverse/modern';

const obj = { a: 1, b: 2, c: [3, 4] };

new Traverse(obj).forEach((ctx, x) => {
  if (typeof x === 'number') ctx.update(x * 10);
});

const tree = { a: 1, b: { c: 2, d: 3 } };
new Traverse(tree).find((ctx, x) => x === 2);
new Traverse(tree).filter((ctx) => ctx.isLeaf);

for (const node of new Traverse(tree)) { /* … */ }
for (const [path, node] of new Traverse(tree).entries()) { /* … */ }

await new Traverse(doc).mapAsync(async (ctx, x) => { /* … */ });
```

See the [migration guide](/migration) for a full class-to-function table and the removal timeline.

## Migrating from `traverse`

It's a drop-in replacement — see the dedicated [**Migration guide**](/migration) for the full
`traverse → neotraverse → neotraverse/modern` path and a side-by-side diff.

## License

[MIT](https://github.com/PuruVJ/neotraverse/blob/main/packages/neotraverse/LICENSE) — Puru Vijay & James Halliday.

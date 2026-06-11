---
title: Core traversal
outline: [2, 3]
---

# Core traversal

Import as `import * as t from 'neotraverse'`. Each callback receives the [context](/guide/context).

## map {#map}

`t.map(obj, fn, options?)` runs `fn` for each node and returns a **new** object. Update nodes in the result with `ctx.update(value)`.

### Example

```ts
import * as t from 'neotraverse';

const input = { a: 1, nested: { b: 2 } };
const out = t.map(input, (ctx, x) => {
  if (typeof x === 'number') ctx.update(x * 10);
});
// out → { a: 10, nested: { b: 20 } }
// input is unchanged
```

### Example: scrub circular references

```ts
import * as t from 'neotraverse';

const obj = { a: 1, b: 2, c: [3, 4] };
obj.c.push(obj);

const scrubbed = t.map(obj, (ctx) => {
  if (ctx.circular) ctx.remove();
});
// → { a: 1, b: 2, c: [ 3, 4 ] }
```

## forEach {#forEach}

`t.forEach(obj, fn, options?)` is like `t.map`, but `ctx.update()` mutates `obj` **in place** (returns the same reference).

### Example

```ts
import * as t from 'neotraverse';

const obj = [5, 6, -3, [7, 8, -2, 1], { f: 10, g: -13 }];

t.forEach(obj, (ctx, x) => {
  if (x < 0) ctx.update(x + 128);
});
// → [ 5, 6, 125, [ 7, 8, 126, 1 ], { f: 10, g: 115 } ]
```

## reduce {#reduce}

`t.reduce(obj, fn, init?, options?)` is a [left-fold](<https://en.wikipedia.org/wiki/Fold_(higher-order_function)>) over every node. Omit `init` to start from the root and skip the root node in the fold.

See [Query → reduce](/guide/api/query#reduce) for a seeded example.

## paths · nodes {#paths}

`t.paths(obj, options?)` and `t.nodes(obj, options?)` return every non-cyclic path or every node.

For lazy alternatives, see [Iteration](/guide/api/iteration).

## clone {#clone}

`t.clone(obj, options?)` deep-clones. Handles circular references, `Date`/`RegExp`/`Error`/typed arrays, and `Map`/`Set` (entries deep-cloned), and is prototype-pollution-safe. See [Types & traversal](/guide/types).

### Example

```ts
import * as t from 'neotraverse';

const live = { count: 0 };
const snapshot = t.clone(live);
snapshot.count = 99;
live.count; // 0, unchanged
```

## get · set · has {#get}

`t.get(obj, path, options?)`, `t.set(obj, path, value, options?)`, and `t.has(obj, path, options?)` read / write / test at an array `path`. `get`/`has` only follow own properties; `set` refuses prototype-polluting keys.

For string paths, see [Paths & metrics → getPath](/guide/api/paths#getPath).

### Example

```ts
import * as t from 'neotraverse';

const obj = { a: { b: 1 } };
t.get(obj, ['a', 'b']); // 1
t.set(obj, ['a', 'b'], 2);
t.has(obj, ['a', 'c']); // false
```

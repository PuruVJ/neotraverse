---
title: Lazy iteration
outline: [2, 3]
---

# Lazy iteration

Pull nodes without materializing `t.paths` / `t.nodes`. Circular references are visited once and not descended
into.

Import as `import * as t from 'neotraverse/modern'`.

## values {#values}

`for (const node of t.values(tree))` and `[...t.values(tree)]` yield every node depth-first (like `t.nodes()`, but
lazy).

## entries {#entries}

`t.entries(obj, options?)` yields `[path, node]` pairs.

### Example

```ts
import * as t from 'neotraverse/modern';

const tree = { a: 1, b: { c: 2 } };

for (const node of t.values(tree)) {
  /* every node */
}

for (const [path, node] of t.entries(tree)) {
  /* path: PropertyKey[], node: value at that path */
}
```

## Map and Set

By default, `t.forEach`, `t.map`, `t.paths`, `t.nodes`, and lazy iteration treat `Map`/`Set` as **leaf nodes**. Only
`t.clone` (and the shallow `t.map` copy) descend into their entries.

Pass **`descendIntoMapSet: true`** ([Options](/guide/options)) to visit Map values at their keys and Set elements
at numeric indices during walks.

### Example: descend into Map entries

```ts
import * as t from 'neotraverse/modern';

const m = new Map([['k', { v: 1 }]]);
const paths: PropertyKey[][] = [];

for (const [path] of t.entries(m, { descendIntoMapSet: true })) {
  paths.push(path);
}
// includes paths into nested object values
```

See [Types & traversal](/guide/types#types-and-traversal) for walk vs clone behaviour.

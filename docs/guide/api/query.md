---
title: Query helpers
outline: [2, 3]
---

# Query helpers

Import as `import * as t from 'neotraverse/modern'`.

## find · filter · some · every {#find}

`t.find`, `t.filter`, `t.some`, and `t.every` search over every node (root included). `find`/`some` stop at the
first match; `every` stops at the first failure.

### Example

```ts
import * as t from 'neotraverse/modern';

const tree = { a: 1, b: { c: 2, d: 3 } };

t.find(tree, (ctx, x) => x === 2); // 2
t.filter(tree, (ctx) => ctx.isLeaf); // [1, 2, 3]
t.some(tree, (ctx, x) => x > 2); // true
t.every(tree, (ctx, x) => typeof x !== 'string'); // true
```

### Example: collect leaf nodes

```ts
import * as t from 'neotraverse/modern';

const leaves = t.filter({ a: [1, 2, 3], b: 4, d: { e: [7, 8], f: 9 } }, (ctx) => ctx.isLeaf);
// → [ 1, 2, 3, 4, 7, 8, 9 ]
```

## reduce {#reduce}

`t.reduce(obj, fn, init?, options?)` folds over every node. See [Core → reduce](/guide/api/core#reduce) for
seedless behaviour.

### Example: sum numbers

```ts
import * as t from 'neotraverse/modern';

const nested = { a: 1, b: { c: 2, d: 3 } };
const sum = t.reduce(nested, (_, acc, x) => (typeof x === 'number' ? acc + x : acc), 0);
// 6
```

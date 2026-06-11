---
title: Walk variants
outline: [2, 3]
---

# Walk variants

Import as `import * as t from 'neotraverse'`.

## walk {#walk}

`t.walk(obj, cb, options?)` is the low-level depth-first walker behind `forEach` and `map`. It returns the (possibly mutated) root. Prefer `t.forEach` / `t.map` unless you need the same callback shape with a different return contract.

## breadthFirst · mapBfs {#breadthFirst}

`t.breadthFirst` and `t.mapBfs` traverse level-order. `breadthFirst` mutates in place like `forEach`; `mapBfs` clones first like `map`. Visit order differs from DFS, do not assume `isFirst` / `isLast` match sibling order in the queue.

### Example

```ts
import * as t from 'neotraverse';

const obj = { a: { b: 1 }, c: 2 };
const order: string[] = [];

t.breadthFirst(obj, (ctx) => {
  order.push(ctx.path.join('.') || '(root)');
});
// root first, then shallower keys before deeper ones (e.g. a, c before b)
```

## skipWhere {#skipWhere}

Predicate helper that calls `ctx.block()`, equivalent to `if (pred(ctx, v)) ctx.block()` inside your callback. Compose with other logic in a single pass. See also [Context → block](/guide/context#context-block).

### Example

```ts
import * as t from 'neotraverse';

t.forEach(tree, (ctx, v) => {
  t.skipWhere((c) => c.level > 2)(ctx, v);
  if (typeof v === 'number') ctx.update(v * 2);
});
```

## groupBy {#groupBy}

One walk; buckets every visited value: `Map<PropertyKey, any[]>`. Usually combine with `ctx.isLeaf` or `typeof` so the root object does not land in a bucket.

### Example

```ts
import * as t from 'neotraverse';

const obj = { a: 1, b: 2, c: 3 };
const buckets = t.groupBy(obj, (ctx, v) =>
  ctx.isLeaf && typeof v === 'number' ? (v % 2 === 0 ? 'even' : 'odd') : 'skip'
);
buckets.get('odd'); // [1, 3]
buckets.get('even'); // [2]
```

## merge {#merge}

`t.merge(target, source, options?)` returns a **new** tree (does not mutate `target`). Plain objects and `Map` entries merge recursively; arrays take indices from `source` (length follows `source`, default **`array: 'replace'`**). Use `{ array: 'concat' }` to append.

### Example

```ts
import * as t from 'neotraverse';

const target = { a: { x: 1 }, arr: [1, 2] };
const source = { a: { y: 2 }, arr: [9] };

t.merge(target, source);
// → { a: { x: 1, y: 2 }, arr: [9] }
// target unchanged
```

## dereference {#dereference}

Resolve local JSON Pointer `$ref` objects (`{ "$ref": "#/definitions/Foo" }`) on a clone. External URL refs are left unchanged (`localOnly` defaults to `true`).

### Example

```ts
import * as t from 'neotraverse';

const doc = {
  defs: { Foo: { type: 'string' } },
  node: { $ref: '#/defs/Foo' }
};

const out = t.dereference(doc);
out.node; // { type: 'string' }
```

## getType {#getType}

Use `t.getType(ctx.node)` inside `t.map` / `t.forEach`. Full matrix: [Types & traversal](/guide/types#types-and-traversal).

### Example

```ts
import * as t from 'neotraverse';

t.map(doc, (ctx) => {
  switch (t.getType(ctx.node)) {
    case 'date':
      ctx.update(ctx.node.toISOString());
      break;
    case 'map':
    case 'set':
      // Map/Set are walk leaves by default, clone handles entries
      break;
  }
});
```

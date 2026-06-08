---
title: Context
outline: [2, 3]
---

# Context {#context}

Every callback receives a context (`ctx` argument):

| Property                            | Description                                                              |
| ----------------------------------- | ------------------------------------------------------------------------ |
| `node`                              | The present node.                                                         |
| `path`                              | Array of keys from the root to the present node.                         |
| `parent` / `parents`                | The parent context / all ancestor contexts.                              |
| `key`                               | The key of the present node in its parent (`undefined` at the root).     |
| `isRoot` / `notRoot`                | Whether the node is the root.                                            |
| `isLeaf` / `notLeaf`                | Whether the node has no children.                                        |
| `isFirst` / `isLast`                | Whether the node is the first / last sibling (stale in the current callback). |
| `level`                             | Depth of the node within the traversal.                                  |
| `circular`                          | The ancestor context this node is a cycle back to, if any.               |
| `update(value, stopHere?)`          | Set a new value for the node. Stops descending when `stopHere` is true.  |
| `remove(stopHere?)`                 | Remove from the output (spliced from arrays, deleted otherwise).         |
| `delete(stopHere?)`                 | `delete` from the parent (even on arrays).                               |
| `keys`                              | The node's keys, assign in `before()` to traverse in a custom order.    |
| `before(fn)` / `after(fn)`          | Run before / after all children are traversed.                          |
| `pre(fn)` / `post(fn)`              | Run before / after **each** child is traversed.                         |
| `stop()`                            | Stop the entire traversal.                                               |
| `block()`                           | Don't descend into the current node's children.                         |
| `nextSibling()` / `prevSibling()`   | Lightweight sibling context (path snapshot). See below.                  |

Import as `import * as t from 'neotraverse'`. API methods that take callbacks receive this [context](/guide/context).

## Skip a subtree with `block` {#context-block}

`ctx.block()` prevents visiting descendants of the current node. Equivalent to using [`t.skipWhere`](/guide/api/walk#skipWhere) in a callback.

### Example

```ts
import * as t from 'neotraverse';

t.forEach(config, (ctx) => {
  if (ctx.key === 'skipMe') ctx.block();
  if (typeof ctx.node === 'number') ctx.update(ctx.node * 2);
});
// nodes under `skipMe` are not visited or updated
```

## Circular references {#context-circular}

When a node equals an ancestor, `ctx.circular` points at that ancestor and the walker does not descend further.

### Example

```ts
import * as t from 'neotraverse';

const obj = { a: 1, b: 2, c: [3, 4] };
obj.c.push(obj);

const scrubbed = t.map(obj, (ctx) => {
  if (ctx.circular) ctx.remove();
});
// → { a: 1, b: 2, c: [ 3, 4 ] }
```

See also [Structural → toJSON](/guide/api/structural#toJSON) for logging cyclic graphs.

## Sibling helpers: `nextSibling` · `prevSibling` {#context-siblings}

Return a lightweight sibling context (path snapshot only, not a full re-walk). Reads live `parent.keys`; unlike
`isFirst` / `isLast`, safe when you need the adjacent key's node.

### Example

```ts
import * as t from 'neotraverse';

const obj = { a: 1, b: 2, c: 3 };

t.forEach(obj, (ctx) => {
  if (ctx.key === 'b') {
    const prev = ctx.prevSibling();
    const next = ctx.nextSibling();
    // prev?.node === 1, next?.node === 3
  }
});
```

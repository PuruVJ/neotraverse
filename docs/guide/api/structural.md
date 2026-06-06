---
title: Structural helpers
outline: [2, 3]
---

# Structural helpers

Import as `import * as t from 'neotraverse/modern'`.

## deleteWhere · prune {#prune}

`t.deleteWhere` returns a new tree with matching nodes removed (`map` + `ctx.remove()`). `t.prune` keeps nodes where
the predicate is true (inverse). Map/Set stay whole leaves unless [descendIntoMapSet](/guide/options) is set.

### Example: redact secrets

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

## pruneDeep {#pruneDeep}

Replace nodes deeper than `maxDepth` with a sentinel (default `null`). Unlike the `maxDepth` **option**, this does
not throw.

### Example

```ts
import * as t from 'neotraverse/modern';

const deep = { a: { b: { c: { d: 1 } } } };
t.pruneDeep(deep, 2);
// → { a: { b: null } } (depth counted from root)
```

## deepEqual {#deepEqual}

Structural compare with an explicit per-type contract (Dates by time, RegExp by source+flags, etc.). Optional
`compareFn` can override pairs. Not guaranteed to match `t.clone()` byte-for-byte (e.g. `Error` fields).

## toJSON {#toJSON}

`JSON.stringify` after a walk; circular references become `null` (configurable via `cycle`).

### Example

```ts
import * as t from 'neotraverse/modern';

const graph: any = { name: 'root' };
graph.self = graph;

console.log(t.toJSON(graph)); // {"name":"root","self":null}
```

## freeze {#freeze}

Deep-freeze in place (children before parents). Pair with `t.clone` when you need an immutable snapshot.

### Example

```ts
import * as t from 'neotraverse/modern';

const snapshot = t.freeze(t.clone(liveConfig));
// snapshot is deeply frozen; liveConfig can still change
```

## diff · patch {#diff}

RFC 6902 subset (`add` / `remove` / `replace`). `t.diff(a, b)` returns ops; `t.patch(clone(a), ops)` applies them.
Acyclic trees only.

### Example

```ts
import * as t from 'neotraverse/modern';

const v1 = { title: 'Hi', items: [1, 2] };
const v2 = { title: 'Hello', items: [1, 3], extra: true };

const ops = t.diff(v1, v2);
const v2FromV1 = t.patch(structuredClone(v1), ops);
// v2FromV1 deep-equals v2 (acyclic trees)
```

---
title: Paths & metrics
outline: [2, 3]
---

# Paths & metrics

Import as `import * as t from 'neotraverse'`.

## findPaths · filterPaths {#findPaths}

Return **where** a match occurred, not only the value. `t.findPaths` stops at the first hit; `t.filterPaths` returns `{ path, node }[]`.

### Example

```ts
import * as t from 'neotraverse';

const tree = { users: [{ id: 1 }, { id: 2, flag: true }] };

t.findPaths(tree, (_, x) => x === true); // ['users', '1', 'flag']
t.filterPaths(tree, (ctx) => ctx.isLeaf && typeof ctx.node === 'number');
// → [{ path: ['users','0','id'], node: 1 }, …]
```

## getPath · setPath · hasPath {#getPath}

String paths over array `get` / `set` / `has`. Dot notation (`a.b.0`) or JSON Pointer (`/a/b/0`). Unsafe segments (`__proto__`, etc.) throw at parse time.

### Example

```ts
import * as t from 'neotraverse';

const config = { server: { host: 'localhost', port: 3000 } };

t.getPath(config, 'server.port'); // 3000
t.setPath(config, 'server.port', 8080);
t.hasPath(config, 'server.tls'); // false

// JSON Pointer (leading slash)
t.getPath(config, '/server/host'); // 'localhost' after set
```

## count · size {#count}

`t.size(obj)` counts every visited node. `t.count(obj, fn)` counts nodes where the predicate is true.

### Example

```ts
import * as t from 'neotraverse';

const tree = { a: 1, b: { c: 2 } };
t.size(tree); // 4 (root + a + b + c)
t.count(tree, (_, x) => x === 2); // 1
```

## getType {#getType}

`t.getType(value)` returns a stable tag for branching inside callbacks. See [Types and traversal](/guide/types#types-and-traversal) for the full matrix.

## select {#select}

Glob path query: `*`, `key[*]`, dot segments. For predicate search, use `t.filterPaths`.

### Example

```ts
import * as t from 'neotraverse';

const data = { users: [{ email: 'a@x.com' }, { email: 'b@x.com' }] };

t.select(data, 'users[*].email');
// → [{ path: ['users','0','email'], node: 'a@x.com' }, …]
```

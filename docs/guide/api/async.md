---
title: Async traversal
outline: [2, 3]
---

# Async traversal

Import as `import * as t from 'neotraverse'`.

## forEachAsync · mapAsync {#forEachAsync}

The callback may be `async` and is awaited at each node. Pass `signal` in [options](/guide/options) to cancel via [`AbortController`](https://developer.mozilla.org/docs/Web/API/AbortController).

`t.mapAsync` always runs immutably (like `t.map`).

### Example: async transform

```ts
import * as t from 'neotraverse';

const doc = { title: 'Hello', body: 'world' };

const translated = await t.mapAsync(doc, async (ctx, x) => {
  if (typeof x === 'string') ctx.update(await translate(x));
});
```

### Example: abort

```ts
import * as t from 'neotraverse';

const controller = new AbortController();
const walking = t.forEachAsync(
  big,
  async (ctx) => {
    /* … */
  },
  { signal: controller.signal }
);
controller.abort(); // → `walking` rejects with the abort reason
```

## Concurrency

`forEachAsync` / `mapAsync` accept `{ concurrency: n }` (default `1`) to run up to **n** sibling callbacks in parallel. Each branch gets an isolated path/parent snapshot, intended for I/O-bound work; pair with `signal` to abort.

### Example

```ts
import * as t from 'neotraverse';

const obj = { a: 0, b: 0, c: 0 };

await t.forEachAsync(
  obj,
  async (ctx) => {
    await fetch(`/api/item/${ctx.key}`);
  },
  { concurrency: 3 }
);
// up to three sibling fetches in flight at once
```

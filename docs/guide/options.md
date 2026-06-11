---
title: Options
outline: [2, 3]
---

# Options {#options}

Pass options as the **last** argument (for example `t.forEach(obj, cb, { maxDepth: 100 })`). `t.map` and `t.mapAsync` always run immutably; other ops default to in-place mutation unless you set `immutable: true`.

```ts
{
  immutable: false,           // if true, never mutate the original object
  includeSymbols: false,      // if true, also traverse own enumerable symbol keys
  maxDepth: undefined,        // bound recursion depth (throws RangeError when exceeded)
  signal: undefined,          // AbortSignal, cancels forEachAsync()/mapAsync()
  descendIntoMapSet: false,   // if true, visit Map/Set entries during walks (see Iteration)
  concurrency: 1,             // parallel sibling callbacks in forEachAsync/mapAsync (see Async)
}
```

See also [Security](/guide/security) (`maxDepth` DoS guard) and [Types & traversal](/guide/types) (`includeSymbols`, `descendIntoMapSet`).

### Example

```ts
import * as t from 'neotraverse';

t.forEach(
  untrusted,
  (ctx, x) => {
    /* … */
  },
  {
    maxDepth: 500,
    includeSymbols: false,
    immutable: true
  }
);
```

---
title: Types & traversal
outline: [2, 3]
---

# Types and traversal {#types-and-traversal}

How neotraverse treats different JavaScript values. Use `t.getType(node)` inside callbacks; use `typeof` when you
need finer detail inside the `'primitive'` bucket (`'string'` vs `'number'`, etc.).

## JSON-like trees (the common case)

If your data looks like **`JSON.parse` output**, plain objects, arrays, `null`, strings, numbers, booleans, and
nested combinations, you are on the supported path:

- **`forEach` / `map` / `reduce`** visit every own enumerable property.
- **`clone`** deep-copies structure and handles circular references.
- **`get` / `set` / `has`** and **`getPath`** follow own keys only (no prototype chain).
- **`includeSymbols: false`** (default) matches JSON (no symbol keys).

Typical API/config/document trees need nothing special. Add **`Date`**, **`RegExp`**, **`Map`**, or **`Set`** when
your runtime actually uses them; see the table below for walk vs clone differences.

## Full type reference

| Kind | `getType()` | `forEach` / `map` walk | `clone()` | Notes |
|------|-------------|------------------------|-----------|--------|
| `null` | `'null'` | Visited | Copied | |
| `string`, `number`, `boolean`, `bigint`, `symbol`, `undefined` | `'primitive'` | Visited as values | Copied | Use `typeof` to branch |
| `function` | `'function'` | Node value only; not invoked | Same reference on properties | Stripped by `toJSON()` |
| Plain object, class instance | `'object'` | Descends into **own enumerable** keys | Deep clone; keeps prototype | Boxed `new String()` etc. are `'object'` **leaves** |
| `Array` | `'array'` | Descends indices | Deep clone | |
| `Date` | `'date'` | Leaf (no keys) | Cloned via `getTime()` | |
| `RegExp` | `'regexp'` | Leaf | Cloned | |
| `Map` | `'map'` | **Leaf** by default; with `{ descendIntoMapSet: true }` visits each **value** at its key | **Deep-clones entries** | See [Iteration](/guide/api/iteration) |
| `Set` | `'set'` | **Leaf** by default; with `{ descendIntoMapSet: true }` visits each element at a numeric index | **Deep-clones values** | Same as `Map` |
| `WeakMap` / `WeakSet` | `'weakmap'` / `'weakset'` | **Leaf** (not enumerable in walk) | **`clone` / `copy` return the same reference** | Cannot query weak refs after GC |
| Typed array (`Uint8Array`, …) | `'typed-array'` | Descends index keys; `copy` uses `.slice()` | Leaf in deep clone (buffer copied) | |
| `ArrayBuffer` | `'arraybuffer'` | Leaf | `.slice(0)` | |
| `DataView` | `'dataview'` | Leaf | Clones viewed byte range | |
| `Error` | `'error'` | Leaf | Deep clone; shallow `map` copy is lossy (`message` only) | `deepEqual`: `message` + `name` |
| `Promise`, `URL`, DOM nodes, … | `'object'` | Own enumerable keys only, if any | Generic object copy | Host objects may behave oddly |

## Deliberate limits

- **No prototype walking**, only own properties (`get`/`has` never follow the chain). Safer on untrusted input.
- **No non-enumerable / getter-only keys** unless you add your own logic.
- **`Map` / `Set` vs walk**, by default the walker sees the collection as one node; pass **`descendIntoMapSet: true`**
  to visit entries. **`clone`** always deep-copies entries regardless.
- **Boxed primitives** (`new String('x')`), classified as `'object'`, treated as **leaves**; unwrap with
  `.valueOf()` when needed.
- **`diff` / `patch`**, acyclic trees only; circular graphs are unsupported.
- **Cross-realm**, `instanceof` may fail; `copy()` falls back to tag checks for `Date` / `RegExp`.

## Quick checks in callbacks

### Example

```ts
import * as t from 'neotraverse';

t.forEach(data, (ctx, x) => {
  switch (t.getType(x)) {
    case 'primitive':
      if (typeof x === 'string') { /* … */ }
      break;
    case 'function':
      // present on the tree, but not called by neotraverse
      break;
    case 'map':
    case 'set':
      // walk leaf, use t.clone(x), descendIntoMapSet, or iterate x yourself
      break;
    case 'arraybuffer':
    case 'dataview':
    case 'typed-array':
      // binary data; clone copies bytes
      break;
    default:
      break;
  }
});
```

For transforming by kind in a single pass, see [Walk variants → getType](/guide/api/walk#getType).

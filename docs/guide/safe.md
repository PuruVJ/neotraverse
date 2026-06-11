---
title: neotraverse/safe
outline: deep
---

# `neotraverse/safe`

A second, opt-in traversal core. It's a **companion** to the default API, not a replacement. The default `neotraverse` is the fast path: a recursive walk ~5× faster than the original `traverse`. `neotraverse/safe` makes a different trade (**stack-safe, memory-bounded, pollution-safe**, at a modest throughput cost) and ships a different, smaller surface built around a lazy iterator and a copy-on-write rewriter.

```ts
import {
  visit,
  transform,
  transformAsync, // traversal
  get,
  set,
  has, // paths
  clone,
  equal,
  merge,
  diff,
  patch, // structural ops
  resolveRefs // $ref resolution
} from 'neotraverse/safe';
```

Reach for it when the input is **deep, huge, untrusted, or only partially consumed**. Stay on the default when you're doing a full eager pass over trusted, bounded data and want maximum speed.

## Why it exists

The default walk is recursive, which is _why_ it's fast. But recursion means a deep enough tree overflows the JavaScript call stack and throws `RangeError: Maximum call stack size exceeded`, and there's no way around that for a recursive walker. `neotraverse/safe` runs on an **iterative engine** (an explicit stack on the heap), so it walks arbitrarily deep input the default (and almost every other tree library) simply can't. On top of that it's **lazy** (stream and early-exit without materializing intermediates) and its writes are **copy-on-write** (share untouched subtrees instead of deep-copying). Three concrete wins, measured:

- **Stack safety.** The recursive default overflows past **~2,000** levels; `/safe` handles **200,000+**. Categorical, not incremental.
- **Bounded memory on partial consumption.** An early-exit chain peaks at **~6× less** memory than the eager default, because it never builds the intermediate array.
- **Copy-on-write edits.** A sparse edit copies only the changed spine, and a no-op returns the input by identity.

[Jump to the honest trade-offs ↓](#the-honest-trade-offs). `/safe` is not a free upgrade.

---

## `visit`: lazy iteration

```ts
function visit<T>(root: T, options?: VisitOptions): Visits;
function visit<T>(root: T, pattern: string, options?): Visits; // positional `match` shorthand
```

`visit` returns a **lazy iterator** of `Visit` records, one per node, that subclasses the native ES2025 `Iterator`. Every helper (`.map`, `.filter`, `.find`, `.take`, `.drop`, `.toArray`, `.reduce`, `.some`, `.every`, plus `for…of`, spread, and `Map.groupBy`) works with zero extra bundle cost.

```ts
for (const v of visit(doc)) {
  if (v.key === 'node_modules') {
    v.skip();
    continue;
  } // don't descend
  if (v.value === target) {
    console.log(v.pointer);
    break;
  } // '/users/3/email'
}

visit(doc).find((v) => v.value === needle)?.path; // ['users', 3, 'email']
visit(doc)
  .filter((v) => v.isLeaf)
  .map((v) => v.value)
  .toArray();
Map.groupBy(visit(doc), (v) => typeof v.value);
```

Each `Visit` is a fresh, retention-safe record:

| field      | meaning                                                                   |
| ---------- | ------------------------------------------------------------------------- |
| `value`    | the node's value                                                          |
| `key`      | its key in the parent (`undefined` at the root)                           |
| `parent`   | the parent node's `Visit` (`undefined` at the root)                       |
| `depth`    | depth from the root (`0` at the root)                                     |
| `path`     | key path from the root, a **lazy** getter (you pay only when you read it) |
| `pointer`  | RFC 6901 JSON Pointer string, also lazy                                   |
| `isLeaf`   | no traversable children under the current options                         |
| `circular` | the ancestor `Visit` this node points back to, if it's a back-edge        |
| `skip()`   | don't descend into this node (pre/breadth order; throws in post)          |

**Options** (shared, where they make sense, with `transform` and the ops):

```ts
interface VisitOptions {
  order?: 'pre' | 'post' | 'breadth'; // default 'pre' (parents first)
  match?: string; // glob pattern; yields only matches, PRUNES descent
  symbols?: boolean; // include own enumerable symbol keys (default false)
  mapSet?: boolean; // descend into Map/Set entries, recursively (default false)
  maxDepth?: number; // catchable RangeError past the bound
}
```

The `match` pattern (`'users.*.email'`, `'**.id'`) prunes the walk to viable prefixes, so subtrees that can't contain a match are never entered. Grammar: `literal`, `*` (one segment), `**` (recursive descent), `{a,b,c}` (alternation), with `\` escapes.

```ts
visit(doc, '**.email')
  .map((v) => v.value)
  .toArray(); // every `email` at any depth, pruned
```

## `transform`: copy-on-write rewrites

```ts
function transform<T>(root: T, visitor: Visitor | Visitor[] | Rules, options?: TransformOptions): T;
```

`transform` rewrites a tree by copying **only the spine along each edit** and sharing every untouched subtree with the input (the Immer model, no proxies). A visitor edits by returning a command from its second argument, an `edit` factory you can destructure:

```ts
const next = transform(state, (v, { replace, remove }) => {
  if (v.key === 'password') return replace('[redacted]');
  if (v.key === 'internalId') return remove();
});

next === state; // true if nothing matched. Identity means "no change"
next.profile === state.profile; // true. Untouched subtree shared by reference
```

| return                              | meaning                                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------------------------- |
| `undefined` / nothing               | keep the value, descend into it                                                             |
| `replace(value)`                    | substitute. **Final**: not re-visited, not descended. `replace(undefined)` sets `undefined` |
| `replace(value, { descend: true })` | substitute, then descend into the replacement's children                                    |
| `remove()`                          | delete the entry (arrays splice, no holes). `TypeError` at the root                         |
| `skip()`                            | keep the value, don't descend                                                               |
| `stop()`                            | end the pass. Edits already made still fold up                                              |

Returning anything else throws a `TypeError` (and is a compile error in TS, since commands are branded).

**Record rules** are the headline form: N pattern-scoped rules fused into one descent-pruned pass.

```ts
const safe = transform(doc, {
  '**.{password,token,secret}': (v, { replace }) => replace('[redacted]'),
  '**.url': (v, { replace }) => replace(String(v.value).replace(/^http:/, 'https:'))
});
```

Other knobs: `order: 'post'` runs the visitor on already-folded children; `{ mutate: true }` edits in place and returns the root; `match` scopes a single/array visitor (a `TypeError` with the rules form). **`transformAsync`** is the async twin, with `await`-able visitors, `concurrency` for parallel siblings, and the only function that accepts an `AbortSignal`.

## `get` / `set` / `has`: paths

One path family, three spellings: a dot string (`'users.0.name'`), a JSON Pointer (`'/users/0/name'`), or an exact key array (`['users', 0, 'name']`). Map keys and Set indices are navigated natively.

```ts
get(cfg, 'server.port'); // typed: number | undefined
get(cfg, 'server.host', 'localhost'); // fallback ONLY when the path is absent (not present-undefined)
has(cfg, ['server', 'tls']);

const next = set(cfg, 'server.port', 8080); // copy-on-write: new root, cfg untouched, siblings shared
set(cfg, 'server.port', 8080, { mutate: true }); // in-place, returns the root
```

`set` is copy-on-write by default and returns the new root (and returns the **input by identity** when the value is unchanged). String paths are template-literal typed (`get` infers `number | undefined` from `'server.port'`), with a graceful `unknown` for dynamic strings. Writes through `__proto__` / `constructor` / `prototype` throw, fail-closed.

## Structural ops

```ts
clone(value); // deep, cycle- & prototype-preserving. The "make independent" verb
equal(a, b); // structural equality (SameValueZero, Map/Set/typed-arrays/Date/…)
merge(base, overlay, opts); // deep merge, shares kept branches; array strategies + per-pattern `at`
diff(a, b); // RFC 6902 ops (add/remove/replace); throws on cycles; undo is diff(b, a)
patch(value, ops); // apply RFC 6902 copy-on-write; patch(x, []) === x
resolveRefs(doc); // resolve local '#/' $ref objects on a shared-structure result
```

`merge` answers the one question real-world merging dies on (_what happens to arrays?_) declaratively:

```ts
merge(defaults, userConfig, {
  arrays: 'replace', // default
  at: { plugins: { by: 'name' }, '**.tags': 'union' } // per-path overrides
});
```

## Cycles in copy-on-write edits (a known limitation)

`transform` and `merge` copy only the spine along each change and share everything else. For **cyclic** inputs this has one deliberate limitation: a **back-edge in the output still points at the original ancestor**, not the rewritten copy. Rewiring cycles during a copy-on-write fold needs complex after-the-fact patching for a rare input, so it's intentionally out of scope.

```ts
const cyc = { x: { a: 1 } };
cyc.self = cyc;

const out = transform(cyc, (v, { replace }) => (v.key === 'a' ? replace(2) : undefined));
out.x.a; // 2     (the edited spine is copied)
out.self === out; // false (the back-edge still points at the ORIGINAL cyc)
```

When you need a cycle-preserving rewrite, edit a clone in place (no fold, so no back-edges to rewire): `transform(clone(cyc), f, { mutate: true })`. `diff` takes the stricter line and **throws** on any cyclic input.

## The honest trade-offs

`neotraverse/safe` is **not** a universal upgrade:

|                               | Default `neotraverse` | `neotraverse/safe`                       |
| ----------------------------- | --------------------- | ---------------------------------------- |
| Full eager scan throughput    | **1.0×**              | ~0.8× (still ~4× faster than `traverse`) |
| Memory on a full materialize  | **lower**             | ~1.7× higher (one `Visit` per node)      |
| Deep input (>~2k levels)      | 💥 `RangeError`       | ✅ traverses fine                        |
| Early-exit / streaming memory | higher                | **~6× lower**                            |
| Bundle size                   | ~5.8 KB               | ~8 KB brotli                             |

Two caveats:

- **Full scans aren't a memory win.** `/safe` allocates one `Visit` per node (about the same as the default's per-node context). Keeping the whole tree costs _more_; the advantage is specifically about **not** materializing what you don't consume.
- **`Visit` records retain their ancestor chain.** `.path` is lazy via `v.parent`, so a retained `Visit` keeps its ancestors, including the root, whose `.value` is the whole input. To let a huge input be collected, extract `v.value` / `v.path` and drop the `Visit`:

  ```ts
  const values = visit(huge)
    .filter(p)
    .map((v) => v.value)
    .toArray(); // keeps only values
  ```

## When to use which

- **Default `neotraverse`.** Trusted, bounded-depth data; full eager passes; maximum speed; smallest bundle.
- **`neotraverse/safe`.** Untrusted or unknown-depth input; very deep trees; streaming / early-exit over large data; copy-on-write edits; anywhere a stack overflow would be a correctness or security bug.

See [Benchmarks](/benchmarks) for the full throughput matrix.

::: tip Platform
`neotraverse/safe` requires Node 22+ / evergreen browsers (it uses native ES2025 iterator helpers). The default `neotraverse` has no such floor.
:::

# neotraverse roadmap

Planned work for the **modern** build (`neotraverse/modern`, `packages/neotraverse/src/modern.ts`). Each item is
self-contained: a future agent can take any one of these and implement it without re-deriving context. The
default/legacy build (`src/index.ts`) is intentionally frozen and out of scope here.

Last updated: 2026-06-05. Source of truth for the current API: `packages/neotraverse/src/modern.ts`.

## 0. Guiding architecture decision (read this first)

The modern build is a single `Traverse` class (~2.2 KB min+brotli). The chaining ergonomics
(`new Traverse(obj).forEach(...)`) are intentional and worth keeping. A class cannot tree-shake its methods, so
every method ships to every user. We accept that for now because the bundle is tiny and chaining is nice.

Rules to follow as features are added:

1. **Add small features as class methods.** Items in Tier 1 and Tier 2 below are forEach/get wrappers or reuse
   `map()`/`clone_node()`. Each adds ~0.1 to 0.4 KB. Adding all of them lands the core around 3 to 3.5 KB, which
   is fine.
2. **Set `sideEffects: false`** in `packages/neotraverse/package.json` with the first feature PR. The library has
   no top-level side effects. This is free and helps consumers' bundlers drop the package when unused.
3. **Heavy or niche features go behind their own entry point**, never the core. Examples: `diff`/`patch`, glob
   `select`, `$ref` dereference. Pattern: add an entry in `tsdown.config.ts` (it already emits separate
   default/modern/legacy bundles, so this is a few lines) and a matching `exports["./diff"]` block in
   `package.json` mirroring the `./modern` block. Users opt in with `import { diff } from 'neotraverse/diff'`, so
   it costs zero to anyone who does not import it.
4. **Do NOT add `pipe()` / a functional-composition API.** neotraverse operations are terminal (one op per
   tree), so there is no real pipeline to compose. `pipe()` would be ceremony for a problem we do not have.
   Revisit only if a genuine multi-step composition use case appears.
5. **Major-version trigger: when the modern core approaches ~10 KB min+brotli**, do a **major version** that
   splits the API into tree-shakeable standalone functions (see section 6). Until then, keep the class.

## 1. Correctness traps in the current `modern.ts` (READ before implementing anything)

These were verified against the real implementation. They are described by function/behavior (not line numbers,
which drift). Violating any of these silently breaks a feature.

- **The `walk()` callback runs PRE-order** (before descending into children). So a node's callback fires before
  its children are visited. Any feature where "a parent must see its already-processed/pruned children" MUST use
  the `ctx.after()` or `ctx.post()` hook, not the main callback. This directly affects `prune`/`deleteWhere`.
- **`ctx.isFirst` / `ctx.isLast` are stale inside the node's own callback.** They are assigned to the child
  context only AFTER the child's callback returns (post-recursion in `walk()`). Inside the current node's
  callback they are still the constructor default (`false`). Sibling-aware features must read `parent.node`
  directly, not rely on these flags.
- **`get()` / `has()` are read-safe via `has_own_property`** (they never walk the prototype chain). They do NOT
  use the `is_unsafe_key` guard. Only `set()` guards `__proto__`/`constructor`/`prototype` via `is_unsafe_key`.
  So string-path features: route writes through `set()` (inherits the write guard), and make the path PARSER
  reject or neutralize unsafe segments so it never creates intermediate objects on a poisoned path like
  `a.__proto__.x`.
- **`copy()` is lossy and shallow for some types.** It reduces `Error` to `{ message }` (drops name/stack/cause)
  and treats `Map`/`Set` as SHALLOW leaves. `clone_node()` is the one that deep-clones `Map`/`Set` entries.
  There is no single shared "type classifier"; the checks are split across `copy()`, `clone_node()`,
  `is_typed_array`, and `is_boxed_primitive`. Consequence: `deepEqual` must define its OWN value-equality
  contract; do not promise "matches clone() exactly."
- **`clone_node()` has no `WalkContext`.** It uses a plain `Map<object, any>` for circular detection and carries
  no path/parent/level/ctx. A `clone(mutator)` cannot cheaply hand the mutator a full context. Prefer `map()`
  (which already does immutable transform WITH full ctx) over adding a context-shaped clone mutator.
- **The synchronous `walk()` is perf-critical** (~4.5x faster than the original `traverse`). Every feature below
  is designed to be a `forEach`/`get` wrapper or to reuse `map()`/`clone_node()` with NO change to the hot loop.
  If you ever touch `walk()`, `copy()`, or `clone_node()`, run `pnpm bench` and confirm no regression.

Reusable internals (module-private in `modern.ts`): `walk`, `walk_async`, `WalkContext`, `copy`, `clone_node`,
`iterate`, `assert_within_depth`, `safe_set`, `own_enumerable_keys`, `object_keys`, `is_non_writable`,
`is_typed_array`, `is_boxed_primitive`, `to_string`, `get_proto`.

Existing public surface (do not duplicate): `get/has/set`, `map/forEach/reduce`, `paths/nodes`, `clone`,
`find/filter/some/every`, `entries`, `[Symbol.iterator]`, `forEachAsync/mapAsync`; options
`{ immutable, includeSymbols, maxDepth, signal }`.

For every feature: add tests in a NEW test file (e.g. `test/roadmap-<feature>.test.ts`), never edit the frozen
suite. Keep the callback shape `(ctx, value)`. Update `docs/guide.md` (Methods section) and the README API line.

## 2. Tier 1 — ship next (cheap, high value, zero hot-path risk)

### 2.1 `findPaths(fn)` and `filterPaths(fn)`
- **What:** like `find`/`filter`, but return the location, not just the value. `findPaths` returns the first
  matching node's `path` (or `[path, node]`); `filterPaths` returns all matches as `{ path, node }[]`.
- **Why:** `filter()` already shipped and returns the *what*; users routinely need the *where* (which key path
  matched). Highest value-to-effort item on the board.
- **API:**
  ```ts
  new Traverse(obj).findPaths((ctx, x) => x?.type === 'user');   // => first matching path, e.g. ['users', 0]
  new Traverse(obj).filterPaths((ctx, x) => x > 10);             // => [{ path, node }]
  ```
  Decide one shape and document it: recommend `findPaths` returns the first matching `path` (and `undefined` if
  none), `filterPaths` returns `{ path, node }[]`. Keep names parallel to `find`/`filter`.
- **Implementation:** a `forEach` wrapper that pushes `ctx.path` (and the node) on match; `findPaths` calls
  `ctx.stop()` on first match. ~10 lines. The lazy `path` getter already exists and only allocates on a match.
- **Tests:** matches collected with correct paths; root path is `[]`; early stop for `findPaths`; no-match
  returns `undefined`/`[]`; respects `includeSymbols`/`maxDepth`.
- **Bundle:** ~+120 B. **Effort:** S.

### 2.2 `Traverse.getType(value)` (static classifier)
- **What:** a static method returning this library's node classification:
  `'null' | 'array' | 'object' | 'date' | 'regexp' | 'map' | 'set' | 'typed-array' | 'boxed-primitive' | 'error' | 'primitive'`.
- **Why:** lets users branch cleanly by type inside `map`/`forEach` callbacks, and documents why Map/Set are
  treated as leaves. Cheap credibility/utility win.
- **API:** `Traverse.getType(new Date())` => `'date'`; `Traverse.getType(new Map())` => `'map'`;
  `Traverse.getType(3)` => `'primitive'`.
- **Implementation:** a small NEW classifier that consolidates the scattered predicates (`is_typed_array`,
  `is_boxed_primitive`, the `to_string` tag, `is_array`). Note: this is new code, not a free re-export of an
  internal table (there is none). Decide whether boxed primitives collapse to one `'boxed-primitive'` tag or
  split into boolean/number/string. **Lock the returned string set on first release** so it never churns.
- **Tests:** one case per returned tag, including cross-realm-ish via `to_string` tags where relevant.
- **Bundle:** ~+150 B. **Effort:** S.

### 2.3 `count(fn?)` / `size()`
- **What:** number of nodes in one pass, optionally only those matching a predicate. `size()` is `count()` with
  no predicate.
- **Why:** common, precise, deterministic. People re-derive it constantly. (Note: this is the GOOD half of the
  rejected `collectStats`; we deliberately do NOT ship a byte-size estimator, which is inherently imprecise.)
- **API:** `new Traverse(obj).size()`; `new Traverse(obj).count((ctx, x) => x?.dirty)`.
- **Implementation:** `forEach` + counter. Pairs naturally with `maxDepth` for cheap structure metrics.
- **Tests:** count includes root; predicate filtering; `maxDepth` interaction; circular handled like `forEach`.
- **Bundle:** ~+80 B. **Effort:** S.

### 2.4 `getPath(str)` / `setPath(str, v)` / `hasPath(str)` (string paths)
- **What:** string-path adapters over the existing array `get`/`has`/`set`. Support dot notation (`'a.b.0.c'`)
  and optionally RFC 6901 JSON Pointer (`'/a/b/0/c'`). Parse the string into a `PropertyKey[]`, then forward.
- **Why:** bread-and-butter ergonomics for configs and API responses.
- **API:** `new Traverse(obj).getPath('a.b.0.c')` (and/or `'/a/b/0/c'`).
- **Implementation:** a thin parser then forward to `get`/`has`/`set`.
  - **Pick ONE canonical grammar before shipping** (recommend dot notation first; JSON Pointer is a small escape
    variant, `~1` => `/`, `~0` => `~`). Do NOT end up with three dialects (dot, pointer, and the glob brackets of
    a future `select`). Whatever you choose here is the grammar `select` must extend later.
  - **Security:** `setPath` inherits `set()`'s `is_unsafe_key` write guard automatically. `getPath`/`hasPath`
    are read-safe because `get`/`has` use `has_own_property`. The PARSER itself must reject/neutralize unsafe
    segments (`__proto__`/`constructor`/`prototype`) so a poisoned path string cannot create intermediate
    objects.
- **Tests:** dot and pointer parsing, numeric array indices, missing paths, the `is_unsafe_key` rejection on a
  poisoned string, round-trip get-after-set.
- **Bundle:** ~+250 B for both syntaxes (start with dot only if you want ~+150 B). **Effort:** S.

## 3. Tier 2 — strong (worth doing, reuse `map()`/`clone_node()`, need real tests)

### 3.1 `prune(fn)` / `deleteWhere(fn)` (immutable structural filter)
- **What:** return a NEW tree keeping only branches where the predicate holds (`prune`) or dropping matches
  (`deleteWhere`, the inverse). Arrays re-pack (splice), objects rebuild.
- **Why:** real demand: scrub sensitive fields, slice configs, build API payloads.
- **API:** `new Traverse(data, { immutable: true }).deleteWhere((ctx, x) => x?.internal || x?.temp)`.
- **Implementation:** build on `map()` (immutable copy-with-writeback) plus `ctx.remove()` (already handles array
  splice vs object delete). **Correctness:** the walk callback runs PRE-order, so use `ctx.after()`/`post()` if a
  parent's decision must account for already-pruned children; otherwise document clearly that the parent
  predicate sees the ORIGINAL node. Map/Set stay whole leaves (the predicate sees them entire; you cannot prune
  inside a Map/Set).
- **Tests:** prune a branch whose children were all removed; sparse-array repacking; Map/Set untouched;
  immutability (original tree intact).
- **Bundle:** ~+250 B. **Effort:** M (the effort is the test surface, not the design).

### 3.2 `deepEqual(other, compareFn?)`
- **What:** structural equality by walking both trees in lockstep, with an optional per-node comparator.
- **Why:** testing, memoization, change detection. Doing it right needs the same internal type knowledge, so a
  userland version is subtly wrong.
- **API:** `new Traverse(obj).deepEqual({ a: 1, b: [2, 3] })`; `.deepEqual(other, (a, b) => a.id === b.id)`.
- **Implementation:** dual-cursor walk with TWO `seen` sets for circular tracking on both sides. **Define an
  explicit equality contract; do NOT promise `clone()` parity** (clone is lossy on Error). Recommended contract:
  Date by `getTime()`, RegExp by `source`+`flags`, typed arrays elementwise, `Map`/`Set` by entries (document
  ordering), boxed primitives by `valueOf()`, Error by `message` (or `message`+`name`, your call, document it),
  plain objects by own enumerable keys.
- **Tests:** each type in the contract; circular on both sides; the `compareFn` override; key-order
  independence for objects; Map/Set ordering decision.
- **Bundle:** ~+400 to 600 B. **Effort:** M.

### 3.3 `toJSON()` / cycle-safe serializer
- **What:** like `JSON.stringify`, but does NOT throw on circular references. Replace a cycle with a sentinel or
  a JSON-Pointer-style reference to the first occurrence. Optionally drop functions/`undefined` and honor
  `includeSymbols`/`maxDepth`.
- **Why:** arguably the single most common reason people reach for a tree walker over `JSON.stringify`. The
  circular machinery already exists in `walk()`/`iterate()`.
- **API:** `new Traverse(obj).toJSON()` => string; consider an options arg for the cycle representation.
- **Implementation:** a walk that emits a string, reusing the existing ancestry/circular tracking. Decide the
  cycle representation and document it. Keep it allocation-conscious for large trees.
- **Tests:** cycles do not throw and use the chosen sentinel; functions/undefined handling; `maxDepth`; parity
  with `JSON.stringify` output for acyclic input.
- **Bundle:** ~+300 to 500 B. **Effort:** M.

### 3.4 `pruneDeep(maxDepth, replacement?)`
- **What:** return a tree truncated at a depth, replacing deeper nodes with a sentinel (or the result of a
  function). Distinct from the `maxDepth` OPTION, which throws; this degrades gracefully.
- **Why:** safe JSON previews, capping deep/untrusted structures without a `RangeError`.
- **API:** `new Traverse(hugeTree).pruneDeep(5, { truncated: true })`.
- **Implementation:** `map()` + a `ctx.level` check + `ctx.update(replacement)` + `ctx.block()`. Define the
  contract crisply: "nodes deeper than level N are replaced, not thrown." Test the circular interaction.
- **Bundle:** ~+120 B. **Effort:** S.

### 3.5 `freeze()` / deep-freeze
- **What:** `Object.freeze` every node on a single walk, returning a deeply-frozen tree.
- **Why:** classic companion to deep-clone (clone-then-freeze for safe config objects). The walk already handles
  the circular case that naive recursive deep-freeze gets wrong.
- **API:** `new Traverse(obj).freeze()` (decide: in place vs clone-then-freeze; recommend in place, and users
  compose `new Traverse(clone(obj)).freeze()`).
- **Implementation:** `forEach` with `ctx.after(() => Object.freeze(ctx.node))` so children freeze before parents.
- **Tests:** deep frozen-ness; circular safe; arrays and Map/Set (freeze the container).
- **Bundle:** ~+100 B. **Effort:** S.

## 4. Tier 3 — stretch / separate entry points

These are bigger, more speculative, or grammar-heavy. Default to a SEPARATE ENTRY POINT so the core stays lean.

### 4.1 `diff(a, b)` to JSON Patch, plus `patch(ops)` — ship as `neotraverse/diff`
- **What:** compute a delta between two trees and apply it. Start with a tight RFC 6902 subset
  (`add`/`remove`/`replace`, skip `copy`/`move`); `patch()` applies ops immutably.
- **Why:** high ceiling (change feeds, undo/redo, collaboration, DB deltas). Natural sibling of `deepEqual`, so
  build it AFTER `deepEqual` to share the lockstep walk.
- **API:** `import { diff, patch } from 'neotraverse/diff'`; `diff(v1, v2)` => ops; `patch(v1, ops)` => new tree.
- **Why separate entry:** ~+1.2 to 1.5 KB even trimmed; do not put it in the core 2.2 KB budget.
- **Notes:** RFC 6902 is verbose; circular refs make diffs ambiguous (document the limitation); reverse/inverse
  patching is a separate design. **Effort:** L.

### 4.2 `select(glob)` wildcard path queries — likely `neotraverse/select` or core if cheap
- **What:** CSS/GraphQL-style selectors, e.g. `'*.users[*].email'`, returning `{ path, node }[]`.
- **Why:** extract a field at any depth. The predicate form is already covered by `filterPaths`; this is the glob
  string layer.
- **Gate:** depends on the string-path grammar chosen in 2.4. Do NOT introduce a third dialect. **Effort:** M.

### 4.3 `mapAsync({ concurrency: N })`
- **What:** bounded parallelism in the async walk (run up to N node callbacks at once).
- **Why:** throughput for I/O-bound callbacks (batch fetch, parallel reads).
- **Risk:** real surgery on `walk_async`, which shares mutable per-walk state (`path[]`, `parents[]`) across the
  recursion; concurrent siblings would corrupt `path`/`parents` and break the immutable post-order writeback.
  Needs per-branch path snapshots or a different scheduler. Defer until there is demand. **Effort:** L.

### 4.4 `groupBy(keyFn)` / `collect(groupFn, reduceFn)`
- **What:** single-pass grouped aggregation. `groupBy` returns `Map<K, node[]>`.
- **Why:** unifies a common `forEach` + Map bookkeeping pattern (trivially built on `reduce`/`forEach`).
- **Note:** leans toward general collection-utility territory; ship only if grouped tree aggregation proves a
  recurring ask. **Bundle:** ~+150 B. **Effort:** S.

### 4.5 `ctx.nextSibling()` / `ctx.prevSibling()`
- **What:** sibling navigation on the context, computed on demand.
- **Why:** neighbor-dependent transforms (merge consecutive elements, reorder).
- **Spec carefully:** compute purely from `this.parent.node` and `this.key`. It reads LIVE parent state (so a
  prior `remove()` shifts the array), is `undefined` at the root and for non-adjacent object keys. Do NOT
  document it alongside `isFirst`/`isLast` (those are stale inside the callback, see section 1). Add
  read-after-remove/update tests. **Bundle:** ~+120 B. **Effort:** S.

## 5. Explicitly out of scope (decided NO, with reasons)

Do not build these into the core; each is a userland one-liner over existing primitives, model-breaking, or
off-mission. Revisit only with strong, specific demand.

- **Public `walk(fn, order?)` / `pipe()` / `mutate()` chaining:** `forEach` already IS `walk(options)` and
  returns the value; `before`/`after`/`pre`/`post` + `block`/`stop` already give order control. No new
  capability.
- **`merge(source)`:** off-mission (lodash territory), semantics tar pit (array concat vs replace, source vs
  target wins, cyclic sources). Separate package if ever.
- **Descend into Map/Set entries during the walk:** contradicts the deliberate 0.7 leaf design and forks the
  perf-critical loop (Map/Set entries have arbitrary-typed keys with no path). `clone()` already deep-clones
  Map/Set; transform entries manually if needed.
- **`breadthFirst` / BFS mode:** would need a parallel `walk_bfs()` AND `walk_async_bfs()` replicating circular
  detection, writeback, hooks, and `maxDepth`. Niche; not worth a second walker.
- **`includeNonEnumerable` / `visitGetters`:** execute side-effecting code during traversal (unsafe for
  untrusted input) and tax the hot loop. The walk standardizes on `object_keys`/`own_enumerable_keys` precisely
  to stay safe and fast.
- **`$ref` / `dereference`:** domain-specific (JSON Schema/OpenAPI). Doable in userland via `map()` + `getPath`.
  Separate package (`neotraverse-jsonschema`) built on the public API.
- **`skipWhere(pred)`:** pure alias for `ctx.block()`; document the `block()` pattern instead.
- **`flatten` / `mapEntries` / `keys()` / `values()` / `at(path, fn)`:** one-line derivations of
  `entries()`/`map()`/`get()`. `at(path, fn)` would fabricate an inaccurate synthetic context (wrong parent
  chain). Skip.
- **`visitBy(ctor)` / `dispatch(typeMap)`:** thin sugar over `instanceof`/`getType()` in the callback; adds
  per-node matching overhead.
- **`clone(mutator)` with a ctx-shaped callback:** `clone_node` has no `WalkContext`; `map()` already does
  immutable transform WITH full ctx. Redundant. (If a no-ctx `clone((value) => value)` is ever wanted, keep the
  signature minimal and document that it does NOT descend into Map/Set entries.)
- **`limit` / `sliceNodes` / `collectStats` byte estimator:** `limit` is `counter + stop()` userland;
  `sliceNodes` breaks depth-first semantics; a byte-size estimator is inherently imprecise.

## 6. The major-version refactor: tree-shakeable functional API (only at ~10 KB)

**Trigger:** when the modern core approaches ~10 KB min+brotli (small features have accumulated and users start
caring about shipping unused ones), do a MAJOR version.

**Design:** convert the class methods into **standalone exported functions** sharing the existing module-private
internals (`walk`, `walk_async`, `WalkContext`, `copy`, `clone_node`, `iterate`).

```ts
import { forEach, map, clone, find, paths } from 'neotraverse/modern';
forEach(obj, cb, options);
map(obj, cb, { immutable: true });
clone(obj, options);
```

- **Tree-shaking:** `import { clone }` pulls only `clone_node` + `copy`, not `walk`/`find`/async.
  `import { forEach }` pulls only the walk. A new `diff`/`select` is free for non-importers. Requires
  `sideEffects: false` (already set per section 0) and that functions do not reference the class.
- **Keep the class as a thin back-compat wrapper** built on the functions, so `new Traverse(obj).forEach(cb)`
  still works (importing the class still pulls everything, which is the opt-in convenience cost). Functions do
  NOT reference the class, so importing a function shakes the class out.
- **Perf:** the functions ARE the implementations; the class forwards. No hot-loop change. Benchmark to confirm.
- **Ergonomics:** the functional form (`map(obj, cb)`) is barely more verbose than `new Traverse(obj).map(cb)`
  because neotraverse ops are terminal (no real chaining is lost). Options become the last argument.
- **Do NOT add `pipe()`** even here unless a real composition use case has emerged by then.
- **Docs:** at that point, pivot the guide to lead with functions; keep a "classic class API" note. The current
  docs lead with the class, which is correct for the pre-major era.
- **Migration:** because the class is kept as a wrapper, existing code is non-breaking; the major bump is for the
  new primary surface and any signature cleanups. Provide a codemod note (method to function).

**Validation for the refactor:** add a bundle-size test that asserts `import { clone }` is materially smaller
than `import { Traverse }` (e.g. build a tiny fixture for each and compare brotli sizes), so tree-shaking cannot
silently regress.

## 7. Suggested build order (when features resume)

1. `findPaths`/`filterPaths`, `getType`, `count`/`size` (Tier 1 quick wins, one PR, plus `sideEffects: false`).
2. `getPath`/`setPath`/`hasPath` (lock the grammar).
3. `prune`/`deleteWhere`, `toJSON` cycle-safe serializer, `deepFreeze`, `pruneDeep`.
4. `deepEqual`.
5. `diff`/`patch` behind `neotraverse/diff` (after `deepEqual`).
6. Reassess size; if approaching ~10 KB, schedule the section 6 major refactor.

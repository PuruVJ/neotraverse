# neotraverse v2 — Final API Specification (synthesis)

Codename basis: **Lathe skeleton, KEEL spine, CURSOR-KERNEL protocol grafts, ATLAS pattern/merge grafts.**

Twelve runtime exports from the single `'neotraverse'` root entry. `neotraverse/legacy` stays frozen and untouched; `neotraverse/modern` is deleted (the `Traverse` class is gone). ESM-only, zero runtime deps, `sideEffects: false`, Node >= 22 / evergreen browsers (native ES2025 iterator helpers are part of the API story), best TS experience at 5.6+ (`IteratorObject`, `const` type params).

```ts
import {
  visit,
  transform,
  transformAsync, // traversal: read + write
  get,
  set,
  has, // path engine
  clone,
  equal,
  merge,
  diff,
  patch, // structural ops
  resolveRefs // $ref resolution (built on transform)
} from 'neotraverse';
```

---

## 0. Coherence laws (normative; everything below is a consequence)

1. **One key model.** A node's children are: array elements in ascending index (numeric keys), then own enumerable string keys in insertion order; own enumerable symbol keys appended when `symbols: true`. With `mapSet: true`, a `Map`'s children are its values keyed by their Map keys and a `Set`'s children are its elements keyed by insertion index, **recursively at every level** (fixes the v0.7 top-level-only bug). Only own enumerable properties, ever. Defined once, in `kernel/keys.ts`.
2. **One circular rule.** A reference back to an ancestor on the current descent path is visited exactly once (`Visit.circular` points at the ancestor's Visit) and never descended. Only `diff` refuses cycles outright (RFC 6902 cannot represent them) by throwing `TypeError`.
3. **One write contract.** Every producing function (`transform`, `set`, `merge`, `patch`, `resolveRefs`) returns a **new root that structurally shares every untouched subtree** with its input(s), and returns the input **by identity** when nothing changed. `{ mutate: true }` switches `transform`/`set`/`merge`/`patch` to in-place editing. A fully independent result is always the explicit composition `clone(...)`.
4. **One options vocabulary.** `symbols`, `mapSet`, `maxDepth`, `order`, `match`, `mutate` mean the same thing wherever they appear (full table in section F). Pairwise ops (`clone`, `equal`, `merge`, `diff`) have **fixed per-type Map/Set contracts** and therefore take no `mapSet` flag: clone always deep-clones them, equal always compares them structurally, merge always merges Maps by key and replaces Sets, diff treats them atomically via `equal`.
5. **One error contract.** No custom error classes. Misuse (non-Command visitor return, unsafe path segment, remove-at-root, diff on cycles, callback passed to `visit`) throws `TypeError`; the depth bound throws `RangeError`; aborts reject with `signal.reason`. Every message is prefixed `neotraverse:`. Sync functions never return partial results on error.
6. **One security posture.** `__proto__` / `constructor` / `prototype` are never written through on any code path; string-path parsing **fails closed** (TypeError before any partial container creation); every write in the library goes through `safe_set` (verified present at `src/utils.ts:316`). Patterns may _match_ unsafe keys (so removal-based sanitizing works) but writes through unsafe segments still throw. Reads (`get`/`has`) treat unsafe segments as absent. `maxDepth` bounds untrusted input everywhere.
7. **One signal rule.** `AbortSignal` is accepted **only** by `transformAsync`. No sync signature can even type a signal: a signal cannot fire during a synchronous same-realm traversal, so accepting one would be cancellation theater (unanimous judge verdict). The v0.7 silently-ignored-signal bug is unrepresentable.

### Firing-order invariants (normative; these are the conformance test skeleton)

- **I1 (order)**: `'pre'` yields a parent before its children; siblings in key-model order. `'post'` yields children before the parent, identical sibling order. `'breadth'` yields all depth-d nodes before any depth-(d+1) node, FIFO within a level.
- **I2 (single visit)**: every reachable node position is yielded exactly once; a back-edge yields a Visit with `circular` set and never descends.
- **I3 (prune)**: after `v.skip()` (read side) or `edit.skip()` (write side), nothing beneath that node is visited; the node itself was already yielded/visited.
- **I4 (transform order)**: the visitor runs in the selected order (`'pre'` default, `'post'` sees already-folded children). A value installed by `edit.replace` is final by default (not re-visited, not descended); a removed entry's children are never visited; after `edit.stop()`, no further visitor calls occur and edits made so far still fold.
- **I5 (sharing/identity)**: `transform(x, () => {}) === x`. Every subtree containing no edit is returned by reference. An edit copies exactly one shallow shell per dirty ancestor frame. `patch(x, []) === x`.
- **I6 (purity)**: with `mutate` falsy, inputs are never written, frozen inputs are fine. With `mutate: true`, the input root is returned (or its replacement).
- **I7 (round-trip)**: for every `v` of `visit(root, opts)`, `get(root, v.path) === v.value`, including `mapSet` traversals, because `get`/`set`/`has` navigate Map keys and Set indices natively (feasible today: `get_child_at(node, key, descend_map_set)` exists at `src/utils.ts:406`).
- **I8 (no rewiring)**: a back-edge in a COW transform output still points at the **original** ancestor; cycle rewiring is explicitly out of scope (recipe: `transform(clone(x), f, { mutate: true })`).

---

## 1. Kernel architecture: one traversal core, five faces

There is exactly **one** single-tree traversal implementation (v0.7's recursive `walk` / queue `walk_bfs` / generator `iterate` triplication is gone; the `entries()` recursive `yield*` delegation paying O(depth) per yield plus `path.concat` per node, verified at `src/context.ts:24-39`, is deleted).

```
src/
  kernel/keys.ts     listKeys(node, opts), childAt, isContainer, typeTag,
                     shallowShell (v0.7 make_shell, kept), safeSet, unsafe-key
                     guards, assertDepth — THE single definition of "children"
  kernel/cursor.ts   the ONE engine: explicit-stack step machine, pooled
                     fixed-shape frames { node, keys, index, visit, states, dirty },
                     hand-written step() emitting ENTER/EXIT (no generator frames
                     on the hot path), ancestry cycle detection, skip handling,
                     FIFO ring for breadth order
  kernel/pattern.ts  compile(pattern) -> NFA over path segments; live-state set
                     as a bitmask int (<=31 states; int-array fallback); memoized
                     in a small capped Map; drives PRUNING inside the cursor
  visit.ts           Visit record (monomorphic class; lazy .path via the proven
                     v0.7 parent-chain back-fill getter, src/context.ts:122;
                     lazy .pointer) + visit(): subclass of the ES2025 Iterator
                     global with hand-written next()/return()
  transform.ts       fold driver: visitor dispatch + EXIT-time copy-on-write
                     fold. Dirty bookkeeping per Lathe: parent frame records
                     (key, newValue | REMOVED); on EXIT of a dirty frame, ONE
                     shallowShell is materialized, changed children written in
                     via safeSet, array removals compacted in one splice pass
                     (no holes, ever), dirtiness propagates upward. Root clean
                     => return the input by identity. MutateApplier for
                     { mutate: true }. Command singletons + Edits factory.
  transform-async.ts async twin: awaits visitors, sibling batches, AbortSignal.
                     Separate module so sync users never bundle it.
  path.ts            dot/pointer/array parsing + get/has/set spine writer.
                     ZERO kernel imports (stated guarantee): get/set/has
                     consumers pull ~0.7-0.9 KB and never the engine.
  clone.ts           the v0.7 recursive engine KEPT VERBATIM (cycle-preserving,
                     prototype-preserving, Map/Set/Date/RegExp/Error/typed-array/
                     boxed aware). NOT reimplemented on the COW driver: the COW
                     driver's cycle rule (I8) cannot produce cycle-preserving
                     copies, so Lathe's "clone = forceCopy rewrite" is rejected.
  equal.ts           pairwise recursion + compare hook (two-tree zip; honestly
                     not a single-tree walk; consumes kernel/keys primitives)
  merge.ts           pairwise recursion + strategies + `at` pattern matching
  diff.ts            pairwise diff (uses equal); patch rides path.ts's COW
                     spine writer
  refs.ts            resolveRefs built ON public transform + get + per-target memo
  index.ts           the 12 exports
```

**The one-implementation claim, stated honestly** (KEEL's wording, adopted): every single-tree operation (`visit`, `transform`, `transformAsync`, the `match` matcher, `patch`'s application spines) runs on the one cursor. `equal`, `merge`, `diff` are two-tree algorithms that recurse pairwise but consume `kernel/keys` for key order, symbol handling, Map/Set semantics, depth, and pollution safety, so the semantics table is defined in exactly one place. `clone` is the kept v0.7 engine and supplies `shallowShell` to the COW fold. Because the engine is iterative, deep input can never blow the call stack; `maxDepth` is a resource bound for untrusted input, not a crash guard.

---

## 2. Complete export list (12 values; types are free)

```ts
// READ
export function visit<T>(root: T, options?: VisitOptions): Visits<unknown>;

// WRITE (the flagship)
export function transform<T>(
  root: T,
  visitor: Visitor | readonly Visitor[],
  options?: TransformOptions
): T;
export function transform<
  T,
  R extends {
    [P in keyof R]: (
      v: Visit<PatternValue<T, P & string>>,
      edit: Edits
    ) => Command | undefined | void;
  }
>(root: T, rules: R, options?: RuleTransformOptions): T;

export function transformAsync<T>(
  root: T,
  visitor: AsyncVisitor | readonly AsyncVisitor[] | Record<string, AsyncVisitor>,
  options?: TransformAsyncOptions
): Promise<T>;

// PATH
export function get<T, const P extends Path>(obj: T, path: P): Get<T, P>;
export function get<T, const P extends Path, F>(obj: T, path: P, fallback: F): Get<T, P> | F;
export function has(obj: unknown, path: Path): boolean;
export function set<T, const P extends Path>(
  obj: T,
  path: P,
  value: SetValue<T, P>,
  options?: WriteOptions
): T;

// STRUCTURAL
export function clone<T>(value: T, options?: CloneOptions): T;
export function equal(a: unknown, b: unknown, options?: EqualOptions): boolean;
export function merge<T>(base: T, overlay: DeepPartial<T>, options?: MergeOptions): T;
export function merge<A, B>(
  base: A,
  overlay: B,
  options?: { arrays?: 'replace'; symbols?: boolean; maxDepth?: number }
): Merge<A, B>;
export function merge(base: unknown, overlay: unknown, options?: MergeOptions): unknown;
export function diff(a: unknown, b: unknown, options?: DiffOptions): PatchOp[];
export function patch<T>(value: T, ops: readonly PatchOp[], options?: WriteOptions): T;

// $REF
export function resolveRefs<T>(root: T, options?: RefOptions): T;
```

Shared types:

```ts
export type Path = string | readonly PropertyKey[]; // 'a.b.0' | '/a/b/0' | ['a','b',0]

export interface VisitOptions {
  order?: 'pre' | 'post' | 'breadth'; // default 'pre'
  match?: string; // pattern (section D); yields only matches, PRUNES descent
  symbols?: boolean; // default false
  mapSet?: boolean; // default false; recursive when true
  maxDepth?: number; // RangeError beyond
}
export interface TransformOptions {
  order?: 'pre' | 'post'; // default 'pre'; NO breadth (BFS rewrite was incoherent in v0.7)
  match?: string; // function/array visitor forms only; TypeError with the rules form
  symbols?: boolean;
  mapSet?: boolean;
  maxDepth?: number;
  mutate?: boolean; // default false (COW)
}
export type RuleTransformOptions = Omit<TransformOptions, 'match'>;
export interface TransformAsyncOptions extends TransformOptions {
  signal?: AbortSignal; // rejects with signal.reason at the next visited node
  concurrency?: number; // max parallel sibling visits, default 1
}
export interface WriteOptions {
  mutate?: boolean;
}
export interface CloneOptions {
  symbols?: boolean;
  maxDepth?: number;
}
export interface EqualOptions {
  symbols?: boolean;
  maxDepth?: number;
  compare?: (a: unknown, b: unknown) => boolean | undefined; // undefined = fall through to structural rules
}
export type ArrayStrategy =
  | 'replace'
  | 'concat'
  | 'union'
  | { by: string | ((item: unknown) => unknown) }
  | ((a: readonly unknown[], b: readonly unknown[], path: PropertyKey[]) => unknown[]);
export interface MergeOptions {
  arrays?: ArrayStrategy; // default 'replace'
  at?: Record<string, ArrayStrategy>; // per-PATTERN overrides, same pattern language
  symbols?: boolean;
  maxDepth?: number;
  mutate?: boolean;
}
export interface DiffOptions {
  maxDepth?: number;
}
export interface RefOptions {
  maxDepth?: number;
}

export type PatchOp =
  | { op: 'add'; path: string; value: unknown }
  | { op: 'remove'; path: string }
  | { op: 'replace'; path: string; value: unknown };

export interface Visit<V = unknown> {
  readonly value: V;
  readonly key: PropertyKey | undefined; // undefined at root; non-primitive Map keys exposed as-is at runtime (documented type caveat)
  readonly parent: Visit | undefined;
  readonly depth: number; // 0 at root
  readonly path: PropertyKey[]; // LAZY getter: fresh array per access via the parent chain; safe to retain
  readonly pointer: string; // LAZY getter: RFC 6901 string ('/users/0/name')
  readonly isLeaf: boolean; // no traversable children under current options
  readonly circular: Visit | undefined; // the ancestor this node points back to, if any
  skip(): void; // read side only: do not descend (pre/breadth); TypeError in 'post'
}
export type Visits<V> = IteratorObject<Visit<V>, undefined, unknown>; // native helpers attach

declare const COMMAND: unique symbol;
export interface Command {
  readonly [COMMAND]: 'replace' | 'remove' | 'skip' | 'stop';
}
export interface Edits {
  replace(value: unknown, opts?: { descend?: boolean }): Command;
  remove(): Command;
  skip(): Command;
  stop(): Command;
}
export type Visitor<V = unknown> = (v: Visit<V>, edit: Edits) => Command | undefined | void;
export type AsyncVisitor<V = unknown> = (
  v: Visit<V>,
  edit: Edits
) => Command | undefined | void | Promise<Command | undefined | void>;
```

---

## A. The READ primitive: `visit()`

```ts
for (const v of visit(state)) { ... }              // pre-order DFS, root included
visit(state, { order: 'post' })                    // children before parents
visit(state, { order: 'breadth' })                 // level by level
visit(state, { match: 'users.*.email' })           // pruned query
```

- **Yield shape: a fresh, monomorphic `Visit` per node.** The flyweight reusable cursor is rejected (unanimous judge fatal flaw): fresh records make `.toArray()`, `Map.groupBy`, `.find()` retention, and every native helper composition safe by construction. The per-node cost equals v0.7's one `WalkContext` per node, with fewer fields. `path` is the proven v0.7 lazy parent-chain back-fill getter (`src/context.ts:122`): consumers that never read `.path` pay zero per-node array cost; `pointer` is a lazy prototype getter on top of it.
- **Pruning**: `v.skip()` sets a flag the cursor honors when iteration resumes (sound in a pull model: the consumer always calls it before the next `next()`). Works in `'pre'` and `'breadth'`; throws `TypeError` in `'post'` (children already visited; silence would lie).
- **Early exit**: `break` / `.find()` / `.take(n)`. The iterator's `return()` tears down the cursor and releases pooled frames. No `stop()` on the read side; control flow belongs to the language.
- **`match`** yields only accepting nodes and prunes descent to viable prefixes (section D). Order applies to the matched stream.
- **Dev guard** (Lathe, kept by all three judges): if the second argument is a function, `visit` throws `TypeError: neotraverse: visit(root, callback) is not the v0.7 walk(); use transform(root, visitor, { mutate: true }) for edits or for...of visit(root) for reads`.
- **No second read API.** v0.7's entries/values/find/filter/some/every/paths/nodes/count/size/groupBy/reduce are native iterator-helper one-liners (migration table).
- **Async reads need nothing**: `for (const v of visit(o)) await f(v)` is the supported pattern; pull-based iteration awaits between pulls for free.

```ts
visit(o).find((v) => v.value === needle)?.path; // findPaths
visit(o)
  .filter((v) => v.isLeaf)
  .toArray(); // safe: fresh records
visit(o).reduce((n) => n + 1, 0); // size
Map.groupBy(visit(o), (v) => typeof v.value); // groupBy, no ceremony
```

## B. The WRITE primitive: `transform()` and the edit/control protocol

```ts
const next = transform(state, (v, edit) =>
  v.key === 'password' ? edit.replace('[redacted]') : undefined
);

next === state; // true when nothing matched (I5)
state.users === next.users; // true for untouched subtrees (structural sharing)
```

### The protocol, fully specified

The `Edits` command factory is the visitor's **second argument** (CURSOR-KERNEL graft): nothing to import, fully autocompleted, zero export-budget cost. Commands are opaque `unique symbol`-branded objects; **there are no exported sentinel values anywhere in the library** (no `REMOVE`, no `STOP`). Every command and its exact meaning:

| Command | Allocation | Meaning |
| --- | --- | --- |
| `return undefined` / no return | none | Keep the value. In `'pre'`: descend into children. In `'post'`: keep the (already folded) value. This is unambiguous because plain values are never commands. |
| `edit.replace(value)` | one `{ tag, value, descend }` box, only when an edit happens | Substitute `value` for this node. **The replacement is final**: the visitor is not re-invoked on it and traversal does not descend into it (judges 2 and 3, 2:1 over judge 1: kills the self-feeding-visitor infinite loop; the safe default is the only reversible door). `edit.replace(undefined)` sets `undefined`; the v0.7 return-undefined ambiguity is closed by construction. |
| `edit.replace(value, { descend: true })` | same box | Substitute `value`, then descend into the **children of the replacement** (the replacement node itself is never re-visited). Opt-in restores v0.7 `ctx.update` descent for nested rewrites. A visitor that re-matches its own output under `descend: true` will recurse; documented as the user's explicit choice. |
| `edit.remove()` | none (module singleton) | Delete this entry from its parent: arrays **splice** (never holes; removals compacted in one pass at fold time), objects `delete`, Map entries deleted, Set elements deleted (order of survivors preserved). Children are never visited. At the root: `TypeError: neotraverse: cannot remove the root`. |
| `edit.skip()` | none (singleton) | Keep the value, do not descend. In `order: 'post'`: documented no-op (children were already visited; rule sets are reusable across orders). |
| `edit.stop()` | none (singleton) | Keep the value, end the whole pass immediately. **Edits already made still fold up** (well-defined partial output); the possibly-new root is returned. |
| anything else returned | n/a | `TypeError: neotraverse: visitor returned a non-command value; did you mean edit.replace(...)?` thrown immediately (KEEL guard, demanded by judges 1 and 3). The classic `(v) => v.value` accident fails loudly in plain JS, and the `Command` brand makes it a compile error in TS. |

### Visitor forms and composition (single pass, always)

```ts
// 1. Single function: runs on every visited node (optionally scoped by options.match).
transform(doc, (v, edit) => ...);
transform(doc, rewriteUrl, { match: '**.url' });

// 2. Array: pipeline, left to right per node, ONE traversal.
transform(doc, [stripNulls, redactSecrets, rewriteUrls]);

// 3. Record rules: pattern-scoped, compiled into ONE pruned pass (Lathe's flagship,
//    praised by all three judges). Keys are patterns; rules run in insertion order.
transform(doc, {
  '**.{password,token,secret,apiKey}': (v, edit) => edit.replace('[redacted]'),
  '**.url': (v, edit) => edit.replace(String(v.value).replace(/^http:/, 'https:')),
});
```

Composition semantics: per node, applicable visitors run in order; `edit.replace` updates `v.value` for subsequent visitors at the same node; `remove`/`skip`/`stop` short-circuit the remainder of the chain at that node (`stop` also ends the pass). With record rules, the **union automaton** prunes descent: subtrees no pattern can reach are never expanded, let alone copied. Combining the rules form with `options.match` is a `TypeError` (rules carry their own patterns).

### COW mechanics (no proxies)

The cursor walks the original tree; visitors see originals (`'pre'`) or folded copies (`'post'`, the bottom-up constant-folding mode, table stakes per judges 1 and 3). Edits mark the parent frame dirty with `(key, newValue | REMOVED)`. On a dirty frame's EXIT, exactly one `shallowShell` (the kept v0.7 `make_shell`: prototype- and exotic-preserving, Map/Set rebuilt in entry order) is materialized, changed children written in via `safeSet`, array removals compacted in one splice pass, and the change reported upward. Clean root: input returned by identity. Works on frozen inputs. `{ mutate: true }` swaps in the MutateApplier (same visitors, same commands, in-place `splice`/`delete`/`Map.set` with v0.7's index-shift handling on removal-during-iteration).

**Cycles**: back-edge visited once (`circular` set), never descended; commands apply to the entry. Output back-edges are **not rewired** (I8); D1's pending-fixup engine is rejected (judges 2 and 3: hairiest machinery in the field for the rarest input class). Recipe for cycle-preserving rewrites: `transform(clone(x), f, { mutate: true })`.

### `transformAsync`

```ts
const out = await transformAsync(
  doc,
  async (v, edit) =>
    typeof v.value === 'string' ? edit.replace(await shorten(v.value)) : undefined,
  { match: '**.url', concurrency: 8, signal }
);
```

Separate export so sync users never bundle the async driver, and so `transform` stays `T`, never `T | Promise<T>`. Awaits each visitor; `concurrency: n` processes sibling batches in parallel, which is race-free because Visit records are fresh per node (no shared cursor; judge 1's fatal flaw against D1 resolved structurally) and COW folding is per-frame. `signal` rejects with `signal.reason` before the next visit; this is the **only** signal-accepting function in the library (law 7). Cut entirely in KEEL was judged a capability regression by all three judges; it stays.

## C. The PATH engine: `get` / `set` / `has`

One family, three spellings, accepted everywhere (replaces v0.7's six functions and all five parse/format exports):

- `readonly PropertyKey[]` (exact; may contain symbols, numbers, and arbitrary Map keys),
- dot strings: `'users.0.name'` (`\.` escapes a literal dot; canonical integer segments coerce to numbers, v0.7 `coerceKey` rule kept),
- JSON Pointer when the string starts with `/`: `'/users/0/name'` (`~0`/`~1` unescaping; the v0.7 regexes at `src/utils.ts:297-300` carry over). `''` is the root path.

Semantics:

- `get(obj, path)`: own-property reads only (no prototype-chain reads). `undefined` on any miss. **Optional third argument `fallback`** (ATLAS graft, judges 2 and 3): returned only when the path is **absent**, not when a present key holds `undefined` (something `??` cannot express).
- `has(obj, path)`: the present-vs-undefined disambiguator; own-key probe along the full path.
- `set(obj, path, value)`: **copy-on-write by default** (law 3): copies the O(depth) spine, shares everything else, returns the new root. `{ mutate: true }` restores v0.7 in-place writes (and still returns the root, so call sites are uniform). **Autovivification**: a missing or non-container intermediate becomes `[]` when the next segment is a canonical integer, else `{}`. `set(obj, '', v)` returns `v`. Deletion is not a `set` mode (no sentinel); use `transform` or `patch` with a remove op.
- **Map/Set navigation always on** (I7): a Map step uses `.get`/`.set`/`.has` by key; a Set step indexes insertion order by number (O(size), documented). Caveat: string paths coerce `'0'` to number `0`; use array-form paths for Maps keyed by the string `'0'` or by non-primitive keys (the acknowledged seam in the one-algebra story).
- **Security**: writes through `__proto__`/`constructor`/`prototype` throw `TypeError` fail-closed before any partial write; `get` treats them as absent; `has` returns `false`.
- **Dev guard** (Lathe risk-1 mitigation, demanded by judge 1): in development builds (the `development` export condition), the first `set`/`merge`/`patch` call without `{ mutate: true }` logs a one-time `neotraverse:` notice that results are copy-on-write and the return value must be used. Stripped from production builds; scheduled for removal in 2.1.
- **Size guarantee** (ATLAS discipline, judge 2 graft): `path.ts` has zero kernel imports; a get/set/has-only consumer pulls ~0.7-0.9 KB brotli and never the traversal engine or pattern compiler.

## D. QUERY: the pattern language (an option, not an export)

Used by `visit({ match })`, `transform({ match })`, record-rule keys, and `merge.at` keys. Compiled once per string (memoized, capped Map) into an NFA whose states are pattern positions; state count <= segments + 1, so no blowup; live states ride each cursor frame as a bitmask integer (<=31 states, int-array fallback).

**Grammar (entire):**

```
pattern  :=  segment ( '.' segment )*
segment  :=  literal            exact key; matched via String(key), so 0 matches
                                both index 0 and key '0'; numeric literals address
                                array indices and Set positions
          |  '*'                exactly one segment, any key
          |  '**'               zero or more segments (recursive descent; self-loop state)
          |  '{' lit (',' lit)* '}'   exactly one segment, any of the listed literals
escapes  :=  '\.'  '\*'  '\{'  '\}'  '\,'  '\\'   inside literals
```

- Anchored full-path match: `''` matches only the root; `'**'` matches every node.
- `{a,b,c}` is ATLAS's brace alternation (grafted by all three judges): literals only, no nesting, no globs inside braces.
- **Not in the language, permanently**: slices `[a:b]`, negative indices, predicates, JSONPath filters (unanimous rejection: `.drop()/.take()/.filter()` cover them; a query DSL past two sentences becomes a second library). v0.7's `key[*]` is now `key.*`.
- Symbol keys match only `*`/`**` and only when `symbols: true`.
- Patterns may match unsafe keys (`'**.{__proto__,constructor,prototype}'` + `edit.remove()` is the sanitize recipe); writes through unsafe segments still throw (law 6).

**Pruning is the point**: a child is descended only if some NFA state survives consuming its key with input remaining. `'users.*.name'` touches root, `users`, each user, each `name`, and nothing else; v0.7's `select()` walked everything and string-matched after the fact and could not express `**`. Honest limit (KEEL, stated not hidden): below a live `**`, every subtree stays viable, so `'**.email'` gets laziness and correctness but not the asymptotic pruning win. User `v.skip()` composes with pattern pruning (descend only if viable AND not skipped).

**Typing stance** (judges 1 and 3 fatal flaws against Lathe's depth-8 `Select` unions): glob patterns yield `Visit<unknown>`. Only **glob-free** rule keys and match strings flow through `Get<T, P>` via `PatternValue` (section G). No `SelfAndBelow` machinery ships.

## E. STRUCTURAL ops

- **`clone`** — the v0.7 engine kept verbatim (cycle-reconstructing, prototype-preserving, Map/Set/Date/RegExp/Error(+cause)/typed-array/ArrayBuffer/boxed aware, single write per key, `maxDepth`). It is the explicit "make this fully independent" verb that the sharing contract composes with.
- **`equal`** — renamed from `deepEqual`. SameValueZero leaves; fixed per-type contract (Date by time, RegExp by source+flags, Map/Set structurally, typed arrays element-wise); cycle-safe pair memo. **Keeps the `compare?: (a, b) => boolean | undefined` escape hatch** (judges 1 and 3 against KEEL's removal: normalize-then-equal costs two tree rebuilds per comparison).
- **`merge`** — pairwise, recursive by key for plain objects and Maps (target order preserved, source-only keys appended); Sets and other exotics replace wholesale. **Structural sharing** of wholly-kept branches (no more defensive deep clones; `clone(merge(a, b))` for v0.7 isolation; `{ mutate: true }` merges into base). Array strategies: `'replace'` (default), `'concat'`, `'union'` (concat + dedupe via `equal`, O(n\*m) documented), `{ by: 'id' | fn }` (keyed upsert: match elements by key, merge matches deeply, append the rest in source order; the config killer feature), or a custom `(a, b, path) => unknown[]`. **`at: Record<pattern, strategy>`** applies per-path overrides using the same pattern language (ATLAS graft, all three judges). Cyclic overlay subtrees are taken by reference at the back-edge.
- **`diff` / `patch`** — RFC 6902 subset kept exactly: `add`/`remove`/`replace`, JSON Pointer string paths (interop is the point), emitted values cloned, array tail-removals emitted descending so ops apply left to right. **No `move`/`copy` detection, no `invert()`**: the undo patch is `diff(b, a)`, always correct, zero new API. `diff` **throws `TypeError` on cycles** (v0.7 silently truncated; loud beats wrong). `patch` is copy-on-write on the `set` spine machinery, O(ops x depth) instead of v0.7's full upfront clone; `{ mutate: true }` for in-place; throws `TypeError` on `move`/`copy`/`test` ops; `patch(x, []) === x`.
- **`resolveRefs`** — a real export, not a recipe (judge 1 graft, supported by judge 2: both Lathe's and KEEL's deref recipes are demonstrably subtly wrong; the proven reference implementation exists at `src/ops.ts:198`). Resolves local `#/json/pointer` `{ $ref }` objects (single-key objects only) on a structurally shared result, built on public `transform` + `get`: iterative chain-following with a seen-set, path compression, per-target memoization, and fixpoint resolution **inside** resolved targets so nested refs resolve despite replace-is-final. External refs, unresolvable refs, and cyclic chains are left as-is. Multiple refs to one target share one resolved subtree (use `clone` per site for isolation).
- **Dropped to documented one-liners**: `dereference` name (renamed `resolveRefs`), `toJSON`, `sanitize`, `freeze`, `flatten`/`unflatten`, `getType`, every read wrapper, every parse/format export, the `Traverse` class. Full mapping in the migration table.

## F. Cross-cutting option semantics (one table)

| Option | Accepted by | Meaning |
| --- | --- | --- |
| `order` | visit (`pre`/`post`/`breadth`), transform + transformAsync (`pre`/`post` only) | I1 ordering; no BFS writes, ever |
| `match` | visit, transform, transformAsync (function/array forms) | compiled pattern; visitor/yield only on accepting states; descent pruned to viable prefixes |
| `symbols` | visit, transform(+Async), clone, equal, merge | include own enumerable symbol keys; default false |
| `mapSet` | visit, transform(+Async) | descend Map/Set **recursively at every level**; default false (Map/Set are leaves). Pairwise ops have fixed contracts instead (law 4) |
| `maxDepth` | every traversing/recursing op | `RangeError` past the bound; the untrusted-input knob; the iterative kernel cannot stack-overflow regardless |
| `mutate` | transform(+Async), set, merge, patch | in-place applier; default false (COW + sharing + identity) |
| `signal` | transformAsync ONLY | rejects with `signal.reason` at the next visit (law 7) |
| `concurrency` | transformAsync only | max parallel sibling visits; default 1 |
| `arrays`, `at` | merge | array strategy + per-pattern overrides |
| `compare` | equal | leaf-level override; `undefined` falls through |
| `fallback` (3rd arg) | get | returned only when the path is absent |

Aliasing contract (documented loudly): results of `transform`/`set`/`merge`/`patch`/`resolveRefs` may share subtrees with their inputs. Treat inputs as immutable afterward, or compose with `clone`. This is Immer's contract, replacing v0.7's half-immutable copy-on-walk.

## G. The hardest TypeScript signatures, in full (TS 5.x; best with 5.6+)

**1. `Get<T, P>`: dot paths, JSON Pointer, tuples, index signatures, graceful bailout**

```ts
type ParseKey<S extends string> = S extends `${infer N extends number}` ? N : S;

type ReplaceAll<S extends string, From extends string, To extends string> =
  S extends `${infer A}${From}${infer B}` ? `${A}${To}${ReplaceAll<B, From, To>}` : S;
type PtrUnescape<S extends string> = ReplaceAll<ReplaceAll<S, '~1', '/'>, '~0', '~'>;

type SplitDot<P extends string> =
  P extends `${infer H}.${infer R}` ? [ParseKey<H>, ...SplitDot<R>] : [ParseKey<P>];
type SplitPtr<P extends string> =
  P extends `${infer H}/${infer R}` ? [ParseKey<PtrUnescape<H>>, ...SplitPtr<R>] : [ParseKey<PtrUnescape<P>>];

type Keys<P extends Path> =
  P extends readonly PropertyKey[] ? P :
  P extends string
    ? string extends P ? PropertyKey[]                    // non-literal string: bail out
      : P extends `${string}\\${string}` ? PropertyKey[]  // escaped dots: runtime-only
      : P extends '' ? []
      : P extends `/${infer R}` ? SplitPtr<R>             // JSON Pointer, typed (D1 graft)
      : SplitDot<P>
    : never;

type Step<T, K> =
  T extends null | undefined ? undefined :
  K extends keyof T ? T[K] :                                            // objects + tuples
  T extends readonly (infer E)[] ? (K extends number | `${number}` ? E | undefined : undefined) :
  T extends ReadonlyMap<infer MK, infer MV> ? (K extends MK ? MV | undefined : undefined) :
  T extends object ? (string extends keyof T ? T[string & keyof T] | undefined : undefined) :
  undefined;

type GetIn<T, K extends readonly unknown[]> =
  K extends readonly [infer H, ...infer R extends readonly unknown[]] ? GetIn<Step<T, H>, R> : T;

export type Get<T, P extends Path> =https://www-pre.se.com/fr/fr/
  PropertyKey[] extends Keys<P> ? unknown : GetIn<T, Keys<P>>;

// get({ users: [{ name: 'Ada' }] }, 'users.0.name')  : string | undefined
// get(cfg, '/server/port')                            : number | undefined (pointer, typed)
// get(cfg, ['server', 'port'] as const)               : number
// get(cfg, dynamicString)                             : unknown (graceful bailout)
```

**2. `SetValue<T, P>`: typed writes with the autovivification fallback (D1 graft)**

```ts
export type SetValue<T, P extends Path> =
  unknown extends Get<T, P>
    ? unknown // dynamic path: anything goes
    : [Get<T, P>] extends [undefined]
      ? unknown // path absent in T (autovivify): anything goes
      : Get<T, P>; // statically known slot: value must fit

export function set<T, const P extends Path>(
  obj: T,
  path: P,
  value: SetValue<T, P>,
  options?: WriteOptions
): T;
// set(cfg, 'server.port', '8080')   -> type error: string is not number
// set(cfg, 'server.tls.cert', pem)  -> ok (autovivified, loose)
// set returns T: shape preservation is the caller's assertion when adding new keys (documented)
```

**3. The branded command protocol + the reverse-mapped rules signature (safe typing only)**

```ts
declare const COMMAND: unique symbol;
export interface Command {
  readonly [COMMAND]: 'replace' | 'remove' | 'skip' | 'stop';
}
export interface Edits {
  replace(value: unknown, opts?: { descend?: boolean }): Command;
  remove(): Command;
  skip(): Command;
  stop(): Command;
}
export type Visitor<V = unknown> = (v: Visit<V>, edit: Edits) => Command | undefined | void;

// Glob-free rule keys are typed through Get; any glob degrades to unknown.
// No SelfAndBelow / depth-8 unions ship (judges 1 and 3: inference bombs on real config types).
type HasGlob<P extends string> = P extends `${string}*${string}`
  ? true
  : P extends `${string}{${string}`
    ? true
    : false;
export type PatternValue<T, P extends string> = string extends P
  ? unknown
  : HasGlob<P> extends true
    ? unknown
    : Get<T, P>;

export function transform<T>(
  root: T,
  visitor: Visitor | readonly Visitor[],
  options?: TransformOptions
): T;
export function transform<
  T,
  R extends {
    [P in keyof R]: (
      v: Visit<PatternValue<T, P & string>>,
      edit: Edits
    ) => Command | undefined | void;
  }
>(root: T, rules: R, options?: RuleTransformOptions): T;

transform(cfg, {
  'server.port': (v, edit) => edit.replace(Math.min(v.value, 65535)), // v: Visit<number>
  '**.{password,token}': (v, edit) => edit.replace('[redacted]') // v: Visit<unknown>
});
// The self-referential constraint infers cleanly for inline rule literals;
// extracted rule objects annotate as Record<string, Visitor> (documented).
```

**4. `merge` typing, layered honestly (KEEL's DeepPartial first, Lathe's Merge second, unknown last)**

```ts
export type DeepPartial<T> = T extends readonly unknown[]
  ? T // arrays are strategy-dependent: keep whole
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

export type Merge<A, B> = B extends readonly unknown[]
  ? B
  : A extends readonly unknown[]
    ? B
    : A extends object
      ? B extends object
        ? {
            [K in keyof A | keyof B]: K extends keyof B
              ? K extends keyof A
                ? Merge<A[K], B[K]>
                : B[K]
              : K extends keyof A
                ? A[K]
                : never;
          }
        : B
      : B;

export function merge<T>(base: T, overlay: DeepPartial<T>, options?: MergeOptions): T;
export function merge<A, B>(
  base: A,
  overlay: B,
  options?: { arrays?: 'replace'; symbols?: boolean; maxDepth?: number }
): Merge<A, B>;
export function merge(base: unknown, overlay: unknown, options?: MergeOptions): unknown;
// defaults + partial override infers perfectly; the precise Merge type applies only under the
// default array strategy; custom strategies fall to unknown rather than lie (A & B is rejected).
```

`Visits<V> = IteratorObject<Visit<V>, undefined, unknown>`: the implementation subclasses the ES2025 `Iterator` global with hand-written `next`/`return`, so every native helper has correct types from `lib.esnext.iterator` and `break`/`.find`/`.take` close the cursor.

**Deliberately loose** (the stated trade, every judge concurring): `Visit.value` defaults to `unknown`; no `Paths<T>` autocomplete union constrains runtime parameters; `transform`/`set`/`patch` return `T` as a shape-preservation assumption; `Visit.key` stays `PropertyKey` even though object-keyed Map entries expose the real key at runtime.

## H. The 8 common tasks

```ts
import {
  visit,
  transform,
  transformAsync,
  get,
  set,
  has,
  clone,
  equal,
  merge,
  diff,
  patch,
  resolveRefs
} from 'neotraverse';

// 1. Redact secrets: one pattern, one pruned pass, untouched subtrees shared
const safe = transform(payload, {
  '**.{password,token,secret,apiKey}': (v, edit) => edit.replace('[redacted]')
});

// 2. Collect all values of a key (lazy; eager only at toArray)
const ids = visit(doc, { match: '**.id' })
  .map((v) => v.value)
  .toArray();

// 3. Rewrite URLs (only edited spines are copied)
const secured = transform(
  doc,
  (v, edit) =>
    typeof v.value === 'string' && v.value.startsWith('http://')
      ? edit.replace('https://' + v.value.slice(7))
      : undefined,
  { match: '**.url' }
);

// 4. Config merge: plugins upserted by name, tags deduped, everything else replaced
const config = merge(defaults, userConfig, {
  arrays: 'replace',
  at: { plugins: { by: 'name' }, '**.tags': 'union' }
});

// 5. Diff two states + undo (undo IS a diff; no invert() API)
const redo = diff(before, after);
const undo = diff(after, before);
const next = patch(before, redo); // COW: unpatched subtrees shared
const back = patch(next, undo); // equal(back, before) === true

// 6. Resolve local $refs (OpenAPI / JSON Schema)
const resolved = resolveRefs(openapiDoc); // chains followed, targets memoized, cycles kept as-is

// 7. Deep freeze (post-order: children frozen before parents)
for (const v of visit(state, { order: 'post' }))
  if (typeof v.value === 'object' && v.value !== null) Object.freeze(v.value);

// 8. Find the path of a value (records stay valid after .find stops the iterator)
const hit = visit(state).find((v) => v.value === needle);
hit?.path; // ['users', 3, 'email']
hit?.pointer; // '/users/3/email'
```

Bonus, the async story:

```ts
// 9. Async rewrite with bounded parallelism and cancellation
const short = await transformAsync(
  doc,
  async (v, edit) => edit.replace(await shorten(v.value as string)),
  { match: '**.url', concurrency: 8, signal: controller.signal }
);
```

## I. v0.7 -> v2 migration table

Mechanical rules first: every callback `(ctx, v)` becomes a `Visit` record `v` (`v.value` ~ old node, `v.depth` ~ `ctx.level`, `v.parent.value` ~ `ctx.parent.node`); `ctx.update(x)` -> `return edit.replace(x)` (add `{ descend: true }` if you relied on post-update descent); `ctx.remove()/delete()` -> `return edit.remove()` (remove always splices; delete-leaves-a-hole has no replacement); `ctx.block()` -> `return edit.skip()` / `v.skip()`; `ctx.stop()` -> `return edit.stop()` / `break`.

| v0.7 export | v2 replacement |
| --- | --- | --- |
| `walk(o, cb)` (read) | `for (const v of visit(o)) cb2(v)` (passing a function as arg 2 of `visit` throws with this hint) |
| `walk` / `forEach` (mutating) | `transform(o, visitor, { mutate: true })` |
| `map(o, cb)` | `transform(o, visitor)` — now copies only edited spines; `clone(transform(...))` for v0.7 full independence |
| `mapBfs(o, cb)` / `breadthFirst(o, cb)` (write) | dropped (BFS rewrite was incoherent); use pre/post `transform`, or collect in a breadth read and apply with `set` |
| `breadthFirst(o, cb)` (read) | `for (const v of visit(o, { order: 'breadth' }))` |
| `forEachAsync(o, cb)` | `for (const v of visit(o)) await cb2(v)` (read) or `transformAsync(o, visitor, { mutate: true })` |
| `mapAsync(o, cb)` | `transformAsync(o, visitor)` |
| `entries(o)` | `visit(o).map(v => [v.path, v.value])` |
| `values(o)` | `visit(o).map(v => v.value)` |
| `paths(o)` | `visit(o).map(v => v.path).toArray()` |
| `nodes(o)` | `visit(o).map(v => v.value).toArray()` |
| `find(o, p)` | `visit(o).find(p)?.value` |
| `filter(o, p)` | `visit(o).filter(p).map(v => v.value).toArray()` |
| `some(o, p)` / `every(o, p)` | `visit(o).some(p)` / `visit(o).every(p)` |
| `count(o, p)` | `visit(o).filter(p).reduce(n => n + 1, 0)` |
| `size(o)` | `visit(o).reduce(n => n + 1, 0)` |
| `reduce(o, f, init)` | `visit(o).reduce((acc, v) => f2(acc, v), init)` (seedless root-skip magic removed; pass a seed) |
| `groupBy(o, k)` | `Map.groupBy(visit(o), v => k2(v))` (safe: fresh records) |
| `skipWhere(p)` | `if (p(v)) v.skip()` in the loop; `(v, edit) => p(v) ? edit.skip() : undefined` in transforms |
| `deleteWhere(o, p)` | `transform(o, (v, edit) => p(v) ? edit.remove() : undefined)` |
| `prune(o, keep)` | `transform(o, (v, edit) => v.parent && !keep(v) ? edit.remove() : undefined)` |
| `pruneDeep(o, n, r)` | `transform(o, (v, edit) => v.depth > n ? edit.replace(r ?? null) : undefined)` (replace never descends) |
| `sanitize(o)` | `transform(o, { '**.{__proto__,constructor,prototype}': (v, edit) => edit.remove() })` |
| `freeze(o)` | `for (const v of visit(o, { order: 'post' })) if (typeof v.value === 'object' && v.value) Object.freeze(v.value)` |
| `toJSON(o)` | `JSON.stringify(transform(o, (v, edit) => v.circular ? edit.replace(null) : typeof v.value === 'bigint' ? edit.replace(String(v.value)) : undefined))` |
| `flatten` (never shipped) | `Object.fromEntries(visit(o).filter(v => v.isLeaf).map(v => [v.pointer, v.value]))` |
| `get(o, keys)` / `getPath(o, s)` | `get(o, path)` — one function: arrays, dot strings, pointers; optional absent-only `fallback` |
| `has(o, keys)` / `hasPath(o, s)` | `has(o, path)` |
| `set(o, keys, v)` / `setPath(o, s, v)` | `set(o, path, v, { mutate: true })` — **BREAKING: default `set` is now copy-on-write and returns the new root**; unsafe segments now throw instead of silently no-oping |
| `parsePath` / `parseDotPath` / `parseJsonPointer` | dropped; strings are accepted directly everywhere (parsed and cached internally); exact form: pass `PropertyKey[]` |
| `pointerPath(keys)` | `v.pointer` on visits; raw arrays: `'/' + keys.map(k => String(k).replaceAll('~','~0').replaceAll('/','~1')).join('/')` |
| `findPaths(o, p)` | `visit(o).find(p)?.path` |
| `filterPaths(o, p)` | `visit(o).filter(p).map(v => ({ path: v.path, value: v.value })).toArray()` |
| `select(o, glob)` | `visit(o, { match: pattern })` — `key[*]` is now `key.*`; adds `**` and `{a,b}`; now lazy and actually prunes descent |
| `parseGlob` | dropped (internal compiler) |
| `clone(o)` | `clone(o)` (engine unchanged; `includeSymbols` renamed `symbols`) |
| `deepEqual(a, b, { compareFn })` | `equal(a, b, { compare })` (renamed; hook kept) |
| `merge(t, s, { array })` | `merge(t, s, { arrays, at })` — adds `'union'`, `{ by }`, per-pattern `at`; **result now shares kept branches**; `clone(merge(a, b))` for v0.7 isolation |
| `diff(a, b)` | `diff(a, b)` — same format; **now throws `TypeError` on cycles** instead of silently truncating |
| `patch(o, ops)` | `patch(o, ops)` — same format; now copy-on-write instead of clone-then-mutate; `{ mutate: true }` for in-place |
| `dereference(o, { localOnly })` | `resolveRefs(o)` (`localOnly` dropped: non-local refs always kept as-is) |
| `getType(v)` | dropped; `typeof` / `Array.isArray` / `instanceof` (doc snippet provided) |
| `pipe()` (idea) | array visitors or record rules in one `transform` pass |
| `Traverse` class (`neotraverse/modern`) | removed; `neotraverse/legacy` stays frozen for classic-traverse code |
| ctx `update/remove/delete/stop/block` | `edit.replace` / `edit.remove()` / (no holes) / `edit.stop()` or `break` / `edit.skip()` or `v.skip()` |
| ctx `before/after/pre/post` hooks | `order: 'pre' | 'post'`; per-child hooks dropped (use a post-order pass) |
| ctx `parents` / `isFirst` / `isLast` / siblings | walk the `v.parent` chain; sibling logic reads `v.parent.value` |
| options `immutable` | inverted: immutable + sharing is the default; `mutate: true` opts out |
| options `includeSymbols` / `descendIntoMapSet` | `symbols` / `mapSet` (now recursive at every level) |
| options `signal` on sync ops (silently ignored) | removed from sync signatures; `transformAsync` only |
| options `concurrency` | `transformAsync` only (sibling batches) |

## J. Perf invariants the implementation must hit

1. **Identity fast paths**: `transform(x, noop) === x` with zero shell allocations; `patch(x, []) === x`; an unmatched record-rule pass allocates no copies.
2. **Sparse-edit asymptotics**: COW transform performs exactly one shallow shell per dirty ancestor frame, O(edits x depth) shells total; 10 edits in a 100k-node tree means ~10 spine copies, not 100k (v0.7 `map` copied every node).
3. **Read cost ceiling**: exactly one monomorphic Visit allocation per yielded node, plus one `listKeys` array per container; `.path`/`.pointer`/`.isLeaf` are lazy getters costing nothing unless read; no generator delegation chains (O(1) per yield at any depth, replacing v0.7's O(depth) `yield*` at `src/context.ts:39`).
4. **Pruning asymptotics**: `match: 'users.*.name'` visits only viable prefixes, independent of total tree size; pattern compilation is memoized (capped Map); NFA stepping is branch-and-mask with zero per-key allocation. The `**`-prefix degradation to full descent is documented, not hidden.
5. **No stack overflow, ever**: the explicit-stack kernel survives arbitrary depth; `maxDepth` is a resource bound (RangeError), not a crash guard.
6. **patch/merge stop cloning**: `patch` is O(ops x depth) new nodes; `merge` is O(merged overlap); neither deep-clones retained branches.
7. **Monomorphism**: one Visit shape, one Frame shape, pooled frames (zero steady-state engine GC churn), command singletons, one 3-field replace box allocated only on actual edits, pattern state as integer bitmasks. These are the structural properties behind the v0.7 4.9x brand; they are requirements, not aspirations.
8. **Bundle budgets (brotli)**: `path.ts` terminal <= 0.9 KB with zero kernel imports; `visit` terminal <= 2.2 KB including the pattern compiler; full 12-export library <= 5.5 KB (v0.7: 5.8 KB with strictly less capability). Every export tree-shakes independently; `transform-async.ts` is never pulled by sync users.
9. **Bench gate (hard release requirement, per the implementer judge)**: before 2.0 ships, the suite must show (a) `visit` full-tree read within 15% of v0.7 `forEach` on the standard corpus, (b) no-op `transform` >= 10x faster than v0.7 `map` on 100k nodes, (c) sparse-edit `transform` asymptotically ahead of `map`, (d) pruned `match` asymptotically ahead of v0.7 `select`, (e) `equal`/`clone` at parity. Numbers in this spec are projections until this gate passes; the 4.9x claim is re-proven, not inherited.

## K. Entry points and platform floor

`package.json`: `"exports": { ".": v2 (+ a "development" condition build carrying the dev guards), "./legacy": frozen, "./legacy/*": frozen }`, `"sideEffects": false`, `"engines": { "node": ">=22" }`. ESM only. TS >= 5.6 for `IteratorObject` types (earlier 5.x works with degraded iterator typing). The platform floor is the price of the "dropped wrappers are native one-liners" story and is stated on the box.

---

# Appendix A: Export list (one-liners)

visit<T>(root: T, options?: VisitOptions): Visits<unknown> — lazy single-pass iterator of fresh monomorphic Visit records (pre/post/breadth); `match` pattern prunes descent; v.skip() prunes; break exits; throws TypeError if given a callback. transform<T>(root: T, visitor: Visitor | readonly Visitor[] | Rules, options?: TransformOptions): T — flagship copy-on-write rewriter; visitors return branded Commands via the Edits second argument; copies only edited spines; identity return on no-op; record rules compile to one pruned pass; { mutate: true } edits in place. transformAsync<T>(root: T, visitor: AsyncVisitor | readonly AsyncVisitor[] | Record<string, AsyncVisitor>, options?: TransformAsyncOptions): Promise<T> — async twin; awaited visitors, sibling concurrency, AbortSignal (the only signal-accepting export). get<T, const P extends Path>(obj: T, path: P, fallback?: F): Get<T, P> | F — point read by dot string, JSON Pointer, or key array; navigates Map keys and Set indices; fallback returned only when the path is absent; template-literal typed. set<T, const P extends Path>(obj: T, path: P, value: SetValue<T, P>, options?: WriteOptions): T — copy-on-write point write (new root, untouched subtrees shared); autovivifies ([] for numeric next key, else {}); throws on unsafe segments; { mutate: true } for in-place. has(obj: unknown, path: Path): boolean — own-property existence along the full path; distinguishes present-undefined from missing; Map/Set aware. clone<T>(value: T, options?: CloneOptions): T — fully independent deep copy; cycle-preserving, prototype-preserving, Map/Set/Date/RegExp/Error/typed-array/boxed aware (v0.7 engine kept verbatim). equal(a: unknown, b: unknown, options?: EqualOptions): boolean — structural equality; SameValueZero leaves, fixed per-type contract, cycle-safe pair memo; compare?: (a, b) => boolean | undefined escape hatch kept. merge<T>(base: T, overlay: DeepPartial<T>, options?: MergeOptions): T (+ Merge<A, B> and unknown overloads) — pairwise deep merge sharing kept branches; arrays: 'replace' | 'concat' | 'union' | { by } | fn; at: per-pattern strategy overrides; { mutate: true } merges into base. diff(a: unknown, b: unknown, options?: DiffOptions): PatchOp[] — RFC 6902 subset (add/remove/replace, pointer paths); throws TypeError on cycles; undo is diff(b, a). patch<T>(value: T, ops: readonly PatchOp[], options?: WriteOptions): T — applies RFC 6902 ops copy-on-write on the set spine machinery; patch(x, []) === x; { mutate: true } for in-place; throws on move/copy/test. resolveRefs<T>(root: T, options?: RefOptions): T — resolves local '#/' JSON Pointer { $ref } objects on a structurally shared result; chain-following with path compression, per-target memoization, fixpoint inside targets, cycle-tolerant; built on public transform + get.

---

# Appendix B: Key decisions (judge-panel consensus)

1. Lathe skeleton, KEEL spine. Lathe won two of three judges (practitioner 40, api-critic 42.5) and judge 1 stated the test directly: the synthesis everyone wants is Lathe's skeleton with parts grafted on. KEEL won the implementer (42) specifically for its spec discipline, so its six coherence laws, normative invariants I1-I8, single error contract ('neotraverse:'-prefixed TypeError/RangeError, no custom classes), and 'one-implementation claim stated honestly' paragraph are adopted verbatim as the conformance skeleton (judges 1 and 3 both grafted exactly this).

2. Fresh monomorphic Visit records; the flyweight cursor is dead. All three judges independently declared D1's single reusable Cursor a fatal flaw: it corrupts [...visit(o)], .toArray(), and Map.groupBy, the exact compositions the lazy-iterator constraint exists to enable, and snapshot() is an apology, not a fix. The lazy parent-chain path getter (verified in the kernel at src/context.ts:122) keeps the per-node cost at v0.7's proven one-record-per-node level, so the flyweight bought a microbenchmark at the price of a correctness trap.

3. Branded Command protocol with the Edits factory as the visitor's second argument; zero exported sentinels. Judges 1 and 2 both grafted D1's (cursor, edit) => edit.replace(v) shape: zero imports, full autocomplete, and it frees the export slot that pays for resolveRefs and transformAsync inside the 12-export budget. All three judges killed ATLAS's triple protocol (return-value sugar + m.set + REMOVE sentinel) for reopening the accidental-return bug class; KEEL's loud TypeError on non-command returns is adopted (judges 1 and 3) so untyped JS fails as loudly as typed TS.

4. edit.replace is final by default; { descend: true } is the opt-in. Judges disagreed 2:1 (judge 1 wanted Lathe's descend-by-default; judges 2 and 3 ruled descend-by-default reinvents the self-feeding-visitor infinite loop and that terminal-replace is the only reversible door post-1.0). The majority wins; judge 1's underlying need (one-pass nested rewrites, $ref chains) is met by the explicit descend option plus resolveRefs as a real export, and the migration table flags the ctx.update behavior change explicitly.

5. Record-form pattern rules ship as the flagship transform form. The single point of unanimous praise: judge 1 called it 'the one genuinely new product idea in the field', judge 2 'the single best user-facing idea', judge 3 'what pipe() wanted to be'. N pattern-scoped rewrite rules fuse into one union-automaton pruned pass. Per judges 1, 2, and 3, it ships with safe typing only: glob-free keys flow through Get<T, P>, glob keys are Visit<unknown> (ATLAS's PatternValue stance), and Lathe's depth-8 SelfAndBelow machinery does not ship at all.

6. resolveRefs is a real export, not a recipe. Judge 1 grafted it explicitly and judge 2 supplied the evidence: Lathe's recipe admits missing path compression, and KEEL's recipe is subtly wrong under replace-is-final (nested refs in cloned targets stay unresolved), 'which is the argument for D1's resolveRefs export'. The kernel already contains the reference implementation (dereference with chain-following at src/ops.ts:198). Built on public transform with memoization and fixpoint target resolution.

7. AbortSignal is async-only; transformAsync survives with sibling concurrency. Unanimous: judges 1, 2, and 3 all ruled sync signal checks (Lathe's WalkOptions.signal, KEEL's law 4) cancellation theater, since a signal cannot fire during synchronous same-realm execution, and endorsed D1's stance that the type system should make the v0.7 silently-ignored-signal bug unrepresentable. KEEL's total cut of async transform was ruled a capability regression by all three judges; concurrency is sound here because fresh Visit records and per-frame COW folds remove the shared-cursor race judge 1 flagged as D1's fatal flaw.

8. The pattern grammar is exactly: literal, \*, \*\*, {a,b,c}, escapes. Brace alternation was grafted by all three judges ('trivial NFA addition, powers the best one-liner in any spec'); slices, negative indices, and predicate segments were rejected by all three (ATLAS's self-declared riskiest code, covered by .drop/.take/.filter). The pattern is an option (match) and a rule key, not a standalone select export: the 12-export budget forced a choice between a separate select and resolveRefs, and two judges' demand for resolveRefs outranked one judge's tree-shake preference (cost: ~0.9 KB of compiler in the visit terminal, accepted and stated).

9. The path family navigates Map and Set, guaranteeing the round-trip invariant I7. Judge 1 grafted it, judge 2 declared Lathe's punt ('Map/Set is a walk concern, not a path concern') a fatal flaw, judge 3 grafted KEEL's I7 wording. get(root, v.path) === v.value holds for every visit including mapSet traversals. Verified cheap: get_child_at(node, key, descend_map_set) already exists in the kernel at src/utils.ts:406.

10. Structural sharing is the universal write contract, with identity fast paths and no cycle rewiring. Locked constraint plus all four designs converged here; the synthesis adds KEEL's testable forms (transform(x, noop) === x, patch(x, []) === x) and adopts judges 2 and 3's fatal ruling against D1's pending-fixup back-edge rewiring: output back-edges point at original ancestors (I8), with transform(clone(x), f, { mutate: true }) as the documented remedy. clone stays the v0.7 recursive engine because Lathe's 'clone = COW driver with forceCopy' self-contradicts on cycle preservation (judge 2 fatal flaw).

11. Honest types everywhere a precise type would lie. Pointer-aware Get<T, P> and SetValue<T, P> with the autovivify fallback are grafted from D1 (judges 2 and 3). merge<A, B>: A & B is rejected as a known lie (judge 1 fatal flaw 10); the layered overloads are KEEL's DeepPartial<T> for defaults+override first (judge 3), Lathe's Merge<A, B> only under the default array strategy (judges 1 and 2), unknown otherwise. equal keeps the compare hook (judges 1 and 3 against KEEL's false economy).

12. Migration hazards get runtime guards, not just docs. The renamed read primitive (visit, KEEL's name, per judge 3) defuses the v0.7 walk name trap structurally; Lathe's TypeError dev guard on visit(root, callback) ships anyway (kept by all three judges); and judge 1's fatal flaw 11 mandates the dev-mode one-time warning on the first copy-on-write set/merge/patch call, shipped via the development export condition and removed in 2.1.

---

# Appendix C: Rejected ideas (and why)

- D1's reusable flyweight Cursor and its snapshot() escape hatch: unanimous fatal flaw; corrupts toArray/groupBy/retention, the exact iterator-helper compositions the design sells. Fresh Visit records cost ~1 allocation/node, which v0.7's WalkContext already paid.
- D1's cycle back-edge rewiring (pending-fixup lists into changed regions): judges 2 and 3 ruled it the hairiest, most bug-prone machinery in the field for the rarest input class, and noted it silently violates the copies-only-along-changed-paths contract. Replaced by invariant I8 plus the clone-then-mutate recipe.
- D1's replace-never-descends with no opt-out, AND D2's replace-descends-by-default: both poles rejected. Final-by-default with { descend: true } opt-in (judges 2 and 3 majority over judge 1).
- D2's clone implemented as the COW driver with forceCopy: self-contradicts the cycle-preserving clone contract (judge 2 fatal). The proven v0.7 recursive clone engine stays.
- D2's depth-8 SelfAndBelow Select<T, P> typing and reverse-mapped rules typing at full strength: inference bombs on real config/JSON types (judge 1 fatal 7, judge 3 fatal 9). Glob patterns are Visit<unknown>; no \*\* typing ships.
- D2's and D4's sync AbortSignal ('honored by sync walks too', KEEL law 4): unanimous judge ruling that this is cancellation theater; a signal cannot fire mid-synchronous-traversal. Signal is transformAsync-only.
- D2's name reuse of walk: renamed visit (judge 3) to defuse the v0.7 mutating-walk trap entirely; the dev guard ships regardless.
- D3's Selection journal with m.set()/commit(): two addressing modes (journal targets the original tree, batch edit targets the current tree) plus a mandated byte-identical dual write path; judges 1, 2, and 3 all declared it fatal, the v0.7 entries-vs-walk divergence reborn.
- D3's return-value-as-edit sugar and the exported REMOVE sentinel: reopens the accidental-return corruption class and the undefined ambiguity the branded protocol exists to kill (all three judges). Zero sentinel exports survive.
- D3's pattern slices [a:b], [n], [-n]: self-declared riskiest code, rejected by all three judges; .drop/.take/.filter cover them. Brace alternation was the only grammar graft taken.
- D3's parsePath/formatPath/flatten/REMOVE export creep: judge 3 fatal 6; strings are accepted directly everywhere, flatten is a one-liner, pointer formatting is v.pointer.
- D3's order: 'breadth' reaching writes (EditOptions extends SelectOptions): BFS transforms were incoherent in v0.7; transform is pre/post only (judges 2 and 4 designs, judge 3 ruling).
- D4's omissions as defaults: no post-order transform (judge 1 fatal 8: bottom-up rewriting is table stakes), no transformAsync (all three judges: capability regression), compareFn removal from equal (judges 1 and 3: false economy), and its gather-then-transform doc recipe keyed by value (judge 2: collides on duplicates; any such recipe must key by pointer).
- D4's prune-as-option as the only read-side pruning channel: in-loop v.skip() is sound in a pull model and more ergonomic (judge 2 graft 5); a second prune option was dropped as a duplicate channel by KEEL's own one-way-to-do-it principle.
- KEEL's standalone select export (judge 2's tree-shake preference): rejected on the export budget; pattern-as-option plus record rules deliver the same capability, and the freed slot funds resolveRefs, which two judges demanded. The ~0.9 KB compiler cost in the visit terminal is accepted and stated in the perf budget.
- merge typed as A & B (D1, D3): a known lie for arrays, Maps, and conflicting keys (judge 1 fatal 10); replaced by the layered DeepPartial/Merge/unknown overloads.
- diff invert()/move/copy detection, JSONPath filters, BFS transform, per-child before/after/pre/post hooks, isFirst/isLast/siblings, flatten/unflatten/toJSON/getType/sanitize/freeze as exports: all four designs and all three judges concurred these stay dropped (one-liners or recipes in the migration table).
- A 13th export: every count over 12 (e.g. keeping both select and resolveRefs) was rejected to honor the locked ~8-12 budget with zero gymnastics; the edit factory living as a visitor argument is what makes the budget close honestly.

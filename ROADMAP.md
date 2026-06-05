# neotraverse roadmap

Work targets **`neotraverse/modern`** (`packages/neotraverse/src/modern.ts`). The default/legacy build (`src/index.ts`) stays frozen.

Last updated: 2026-06-05.

## Current state (0.7)

- **Public API:** tree-shakeable functions (`get`, `has`, `set`, `map`, `forEach`, `reduce`, `find`, `filter`, `some`, `every`, `paths`, `nodes`, `clone`, `entries`, `values`, `forEachAsync`, `mapAsync`). Docs use `import * as t from 'neotraverse/modern'`.
- **`Traverse` class:** still exported, `@deprecated`, removed in **0.8**. New code should use the functions only.
- **`sideEffects: false`** — set in `package.json`.
- **No `pipe()`** — one terminal op per walk; nest calls or combine logic in a single `map`/`forEach` callback.
- **Bundle:** ~2.2 KB min+brotli for the full modern build; keep the hot path (`walk`, `copy`, `clone_node`) lean.

### Rules for new work

1. **Ship new methods as standalone functions** on `modern.ts`, with the deprecated class forwarding to them until 0.8.
2. **Prefer thin wrappers** over `walk` / `map` / `forEach` / `clone_node` — do not grow the hot loop without bench proof.
3. **New capabilities are plain functions** in `modern.ts` (same package, same `neotraverse/modern` entry). No extra subpath exports unless something is truly huge and rarely used.
4. **Tests:** new file per feature (e.g. `test/find-paths.test.ts`); do not edit the frozen legacy suite.
5. **Docs:** `docs/guide.md` + package README when the API is public.

## Implementation notes (read before coding)

These match the real engine; breaking them silently breaks features.

- **`walk()` is pre-order.** Parent logic that needs finished children → `ctx.after()` / `ctx.post()`, not the main callback.
- **`isFirst` / `isLast` are wrong inside the current node's callback** — use `parent.node` for sibling logic.
- **`get` / `has`:** own keys only; no `is_unsafe_key`. **`set`:** blocks `__proto__` / `constructor` / `prototype`. String-path parsers must reject unsafe segments before navigation.
- **`copy()` vs `clone_node()`:** shallow/lossy vs deep (Map/Set, circular). `deepEqual` must document its own contract — not “matches clone exactly.”
- **`clone_node()` has no `WalkContext`.** Transform-with-context → `map()`, not `clone(mutator)`.

Module-private building blocks: `walk`, `walk_async`, `WalkContext`, `copy`, `clone_node`, `iterate`, `assert_within_depth`, `safe_set`, key helpers.

## Backlog

### Next (small, core)

| Feature | Notes |
| -------- | ------ |
| **`findPaths` / `filterPaths`** | Like `find`/`filter` but return `path` or `{ path, node }[]`. `forEach` + push path; `findPaths` → `ctx.stop()` on first hit. |
| **`count` / `size`** | Node count in one pass; optional predicate. Not a byte-size estimator. |
| **`getPath` / `setPath` / `hasPath`** | Parse dot paths (JSON Pointer optional later). Forward to `get`/`set`/`has`; parser must block unsafe segments. Pick **one** grammar before any future `select`. |
| **`getType(value)`** | Static classifier for callback branching (`'map'`, `'date'`, …). Lock the string union on first release. |

### Later (core, more tests)

| Feature | Notes |
| -------- | ------ |
| **`prune` / `deleteWhere`** | Immutable structural filter via `map` + `remove`; mind pre-order vs `after`. Map/Set stay leaves. |
| **`deepEqual`** | Lockstep walk, two circular maps; explicit per-type rules (see `copy`/`clone` caveats). |
| **`toJSON` (cycle-safe)** | Serialize without throw on cycles; document sentinel vs pointer. |
| **`pruneDeep`** | Cap depth with replacement — unlike `maxDepth` option which throws. |
| **`freeze`** | `Object.freeze` in `ctx.after` order; circular-safe. |

### Bigger additions (still same package)

| Feature | Notes |
| -------- | ------ |
| **`diff` / `patch`** | RFC 6902 subset (`add`/`remove`/`replace`). Ship as `t.diff` / `t.patch` after `deepEqual` if needed. Document circular-ref limits. |
| **`select(glob)`** | Wildcard path queries → `{ path, node }[]`. Extend the same grammar as `getPath` (no third dialect). Predicate queries stay `filterPaths`. |

### Defer / probably skip

- **`mapAsync({ concurrency })`** — needs per-branch path snapshots; easy to break `walk_async` state.
- **`groupBy`**, **`ctx.nextSibling()`** — userland `reduce` / `parent.node`; add only with real demand.
- **BFS**, **descend into Map/Set during walk**, **public `walk()` export** — out of mission or duplicate hooks.

## Out of scope

- **`pipe()`**, **`merge()`**, **`$ref` dereference** (domain packages / userland).
- **`skipWhere`** — use `ctx.block()`.
- **`flatten`**, extra **`keys`/`values`**, **`at(path, fn)`** — use `entries` / `get` + `map`.
- **`clone(mutator)` with full ctx** — use `map`.
- **`collectStats` byte estimates** — imprecise; `count` is enough.

## Releases

| Version | Plan |
| -------- | ------ |
| **0.7** | Functional API, security/perf, docs (current). |
| **0.8** | Remove `Traverse` class; functions-only modern surface. |
| **Future major** | Only if the core grows enough that bundle size forces API splits beyond tree-shaking (e.g. heavy optional subpaths). |

Suggested order: `findPaths`/`filterPaths` → `count`/`size` → string paths → `prune`/`deleteWhere` → `deepEqual` → `toJSON` / `freeze` / `pruneDeep` → `diff`/`patch` → `select`.

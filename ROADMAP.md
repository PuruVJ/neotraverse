# neotraverse roadmap

Work targets **`neotraverse/modern`** (`packages/neotraverse/src/modern.ts`). Legacy `src/index.ts` stays frozen.

Last updated: 2026-06-05.

## Shipped (0.7)

**Core:** `get`, `has`, `set`, `map`, `forEach`, `reduce`, `find`, `filter`, `some`, `every`, `paths`, `nodes`, `clone`, `entries`, `values`, `forEachAsync`, `mapAsync`.

**Backlog (same entry):** `findPaths`, `filterPaths`, `getPath`, `setPath`, `hasPath`, `parsePath`, `count`, `size`, `getType`, `deleteWhere`, `prune`, `pruneDeep`, `deepEqual`, `toJSON`, `freeze`, `diff`, `patch`, `select`, `parseGlob`.

**Infra:** `sideEffects: false`, tree-shakeable functions, deprecated `Traverse` class (removed in **0.8**).

## Rules for new work

1. Standalone functions in `modern.ts`; class forwards only until 0.8.
2. Thin wrappers over `walk` / `map` / `forEach` / `clone_node` — bench before touching the hot loop.
3. No `pipe()` — nest terminals or one callback.
4. New tests in dedicated files; do not edit the frozen legacy suite.

## Implementation notes

- `walk()` is **pre-order** — use `ctx.after()` / `ctx.post()` when children must be finished first.
- `isFirst` / `isLast` are stale in the current node's callback.
- `set` blocks unsafe keys; string path parsers must reject them too.
- `deepEqual` / `clone` have different contracts for some types (`Error`, etc.).

## Maybe later

- `mapAsync({ concurrency })` — needs isolated path state per branch.
- `groupBy`, sibling navigation helpers — userland `reduce` / `parent.node` first.

## Out of scope

`pipe()`, `merge()`, public `walk()`, BFS mode, descending into Map/Set during walk, `$ref` packages.

## Releases

| Version | Plan |
| -------- | ------ |
| **0.7** | Functional API + backlog helpers (current). |
| **0.8** | Remove `Traverse` class. |

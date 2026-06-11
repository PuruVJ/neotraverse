---
'neotraverse': minor
---

# neotraverse/safe: a stack-safe, memory-bounded traversal core

A new opt-in entry point, `neotraverse/safe`. It is a companion to the default functional API (not a replacement), for input that is **deep, untrusted, huge, or only partially consumed**.

The default `neotraverse` walk is recursive, which is why it is fast, but a recursive walker overflows the call stack on deep enough input. `neotraverse/safe` runs on an iterative engine, so it traverses arbitrarily deep trees that crash a recursive walker. Measured: the default overflows past ~2,000 levels; `/safe` handles 200,000+. It is also lazy and copy-on-write.

## What it ships (twelve exports)

- `visit`: a lazy iterator of `Visit` records that composes with native ES2025 iterator helpers (`.filter` / `.map` / `.find` / `.take` / `.toArray`, `Map.groupBy`, `for-of` + `break`), prunes with `v.skip()`, and matches a glob `pattern`.
- `transform` / `transformAsync`: copy-on-write rewriting. Untouched subtrees are shared with the input, and `transform(x, () => {}) === x`. Edits are branded commands (`replace` / `remove` / `skip` / `stop`) returned from a destructurable `edit` factory, including a pattern-keyed rules record form.
- `get` / `set` / `has`: one path family (dot string, JSON Pointer, or key array), template-literal typed, with copy-on-write `set`.
- `clone` / `equal` / `merge` / `diff` / `patch` / `resolveRefs`: structural ops. `merge` adds array strategies (`concat` / `union` / `by`) and per-pattern `at` overrides.

## The honest trade-off

`/safe` is not a universal upgrade. On a full eager scan it runs at roughly 0.8x the default (still about 4x faster than the original `traverse`), and materializing a whole tree costs a little more memory. It wins on stack safety, on early-exit and streaming memory (about 6x less on a `filter` then `take` chain), and on copy-on-write edits.

Requires Node 22+ or evergreen browsers (it uses native ES2025 iterator helpers). See the guide: https://neotraverse.puruvj.dev/guide/safe

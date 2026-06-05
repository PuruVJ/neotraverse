---
'neotraverse': minor
---

# Security hardening, a much faster modern build, new modern APIs, and a tsdown build

This release hardens neotraverse against prototype pollution / injection when
processing untrusted data, adds an opt-in DoS guard, makes the modern build
~4.5× faster on average (up to ~7×) than the original `traverse`, adds several
modern-only APIs, and modernizes the toolchain. The default/legacy `traverse`
API is unchanged — it remains a drop-in replacement.

## ⚠️ Breaking change

The **legacy** build now targets **ES2015** instead of ES5 (it is built with
rolldown/oxc, whose minimum target is ES2015). It remains CJS + ESM and a
drop-in `traverse` replacement; only environments that required literal ES5
output — e.g. **Internet Explorer 11** — are affected.

Browser / runtime support by build:

| Build               | Target | Browsers                                         | Node    |
| ------------------- | ------ | ------------------------------------------------ | ------- |
| default / modern    | ES2022 | Chrome/Edge 94+, Firefox 93+, Safari 15+         | 18+     |
| legacy              | ES2015 | Chrome 51+, Firefox 54+, Safari 10+, Edge 15+    | 6+      |

## 🔒 Security — prototype pollution & injection

When neotraverse runs on attacker-controlled objects or paths, three mutation
sinks could be abused. All are now neutralized **silently** (no throw, data is
preserved):

- **`set(path, value)` — prototype pollution.** A path containing
  `__proto__` / `constructor` / `prototype` could, via the
  `constructor.prototype` gadget, write onto `Object.prototype` globally (for
  example when an intermediate node exposed an own, function-valued
  `constructor`). `set()` now refuses to navigate or write through these keys.
- **`clone()` / `map()` / `copy()` — prototype injection.** Cloning or mapping an
  object parsed from untrusted JSON such as `{"__proto__":{"isAdmin":true}}`
  (where `__proto__` is an *own enumerable* key) caused the produced object's
  prototype to carry attacker data, so `result.isAdmin` read `true`. Keys are now
  assigned without invoking the `__proto__` setter — the value is kept as an
  inert own data property — so the clone keeps its real prototype.
- **`update()` write-sink** is likewise routed through the safe assignment.

Legitimate prototype **preservation** is unchanged (`instanceof` still works
after `clone()` / `map()`), and `get()` / `has()` continue to follow only own
properties (no prototype-chain disclosure). All of the above are now covered by a
dedicated regression suite (`test/security.test.ts`) so the fixes cannot silently
regress.

> This is the prototype-pollution class of vulnerability historically associated
> with the upstream `traverse` lineage. A GitHub Security Advisory / CVE id will
> be linked here once assigned.

## 🛡️ DoS guard — `maxDepth`

New `maxDepth` option bounds recursion on deeply-nested untrusted input, throwing
a catchable `RangeError` before the native stack overflow:

```js
traverse(untrusted, { maxDepth: 1000 }).clone();
```

Unlimited when omitted, so default behavior is unchanged.

## 🧱 Robustness

- Cloning / mapping inputs that contain **boxed primitives** (`new String()`, …)
  no longer throws on their read-only index slots.
- A `Symbol.toStringTag`-spoofed object (e.g. `{ [Symbol.toStringTag]: 'Date' }`)
  no longer collapses to an `Invalid Date`; it falls through to a faithful copy.

## ⚡ Performance

Across the full benchmark matrix the geometric-mean speedup vs `traverse` is now
**modern ≈ 4.5×** and **legacy ≈ 2.3×** — with individual traversal ops up to
**~7× faster** and allocating **3–5× less memory** per op.

The **modern build was re-architected** for this: visiting a node used to
allocate a context object **plus a fresh closure for every method**
(`update`/`remove`/`before`/…) **plus a `modifiers` object plus a per-node path
copy**. The new modern context is a class whose methods live on the prototype
(one allocation per node), and `ctx.path` is derived lazily from the parent
chain — so `forEach`/`map`/`clone`/`reduce`/`nodes` never pay for a path copy.
Shared wins (both builds): `copy()`/`clone()` make 2–3 `toString` tag checks per
node instead of 6–9, and child iteration no longer allocates a pairs array.

Reproduce with `pnpm bench` (results in `bench/results.json`). The default and
legacy builds keep the original, battle-tested implementation; only the modern
context was rewritten (behaviour is identical — the full test suite passes on
both builds).

> For the `get` / `has` / `set` path helpers, prefer the **modern** build — the
> **legacy** (ES2015) build is slower there because private `#fields` are
> downleveled to WeakMaps.

## ✨ New APIs (modern build only)

The `Traverse` class in `neotraverse/modern` gains four sets of additions. They
live only on the modern build, so the default/legacy `traverse` surface is
unchanged:

- **Query helpers** — `.find(fn)`, `.filter(fn)`, `.some(fn)`, `.every(fn)`:
  array-style queries over every node (root included), with `find`/`some`/`every`
  short-circuiting.
- **Lazy iteration** — `Traverse` is now iterable (`for (const node of t)`,
  `[...t]`) and exposes `.entries()` yielding `[path, node]` pairs. Pull-based, so
  it never materializes the full `nodes()` / `paths()` arrays; circular-safe.
- **Async traversal** — `.forEachAsync(fn)` / `.mapAsync(fn)` await an `async`
  callback at each node, and a new `signal?: AbortSignal` option cancels a walk in
  flight.
- **`Map` / `Set` support** — `clone()` now deep-clones `Map`/`Set` (keys and
  values) and `map()` shallow-copies them, instead of silently dropping every
  entry. (They remain leaf nodes during traversal.)

These are purely additive (no change to existing methods); the only hot-path
touch is two cheap `instanceof` checks in `copy()` / `clone_node()`, so the
benchmark numbers above are unaffected.

## 🔧 Tooling / build

- Build migrated from **tsup → tsdown** (rolldown / oxc).
- The **legacy** build now targets **ES2015** (rolldown's floor) instead of ES5.
  It is still CJS + ESM and a drop-in `traverse` replacement; only environments
  that required literal ES5 output are affected.
- Dev dependencies updated to latest (Vitest 4, Vite 8, TypeScript 6); the unused
  `@swc/core` and `terser` were removed.

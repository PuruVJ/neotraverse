---
'neotraverse': minor
---

# Security hardening, faster traversal, and a tsdown build

This release hardens neotraverse against prototype pollution / injection when
processing untrusted data, adds an opt-in DoS guard, makes traversal ~2–3×
faster than the original `traverse`, and modernizes the toolchain. The public
API is unchanged — it remains a drop-in replacement for `traverse`.

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

Traversal is now ~2–3× faster than `traverse`. Across the full benchmark matrix
the geometric-mean speedup is **modern ≈ 2.9×** and **legacy ≈ 2.3×**; for the
core traversal operations (`forEach` / `map` / `clone` / `reduce` / `paths` /
`nodes`) both builds land at ~2.7–3.3×. The hot `copy()` / `clone()` paths now
make 2–3 `toString` tag checks per node instead of 6–9, and child iteration no
longer allocates a pairs array per node. Reproduce with `pnpm bench` (results in
`bench/results.json`).

> For the `get` / `has` / `set` path helpers, prefer the **modern** build — the
> **legacy** (ES2015) build is slower there because private `#fields` are
> downleveled to WeakMaps.

## 🔧 Tooling / build

- Build migrated from **tsup → tsdown** (rolldown / oxc).
- The **legacy** build now targets **ES2015** (rolldown's floor) instead of ES5.
  It is still CJS + ESM and a drop-in `traverse` replacement; only environments
  that required literal ES5 output are affected.
- Dev dependencies updated to latest (Vitest 4, Vite 8, TypeScript 6); the unused
  `@swc/core` and `terser` were removed.

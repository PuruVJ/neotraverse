# Security Policy

## Reporting a vulnerability

Please report security issues privately via GitHub Security Advisories ("Report a vulnerability" on the repo's **Security** tab) rather than a public issue.

## Threat model

`neotraverse` walks, clones, merges, diffs, and patches arbitrary JavaScript objects. It is commonly used on **untrusted input** — objects from `JSON.parse`, request bodies, config files, JSON Schema / OpenAPI documents — and with **untrusted path / JSON-Pointer / glob strings**. The hardening below targets that model. Findings are gated in CI by [`test/security.test.ts`](packages/neotraverse/test/security.test.ts), [`test/functional-security.test.ts`](packages/neotraverse/test/functional-security.test.ts), and [`test/security-audit.test.ts`](packages/neotraverse/test/security-audit.test.ts) (see `.github/workflows/security.yml`).

## What is hardened

- **Prototype pollution.** `set`/`setPath`/`merge`/`clone`/`patch`/`dereference` reject or neutralize `__proto__`/`constructor`/`prototype`. Keys are coerced to a primitive **once** before the guard, so a boxed/object key (`new String('__proto__')`, `{toString:…}`) or a TOCTOU `toString` cannot slip past the check or fire the `__proto__` setter. Injected `__proto__` from JSON is kept as an inert own data property, never the prototype.
- **`sanitize` for the trust boundary.** If you must hand untrusted parsed JSON to code that is _not_ pollution-hardened (a naive deep-merge, an ORM, a template engine), `sanitize(obj)` returns a deep clone with every own `__proto__`/`constructor`/`prototype` key removed at every level. It strips the key-injection vector only — it does not bound depth/size or sanitize path-based writes, and it is not a blanket "make this safe" guarantee.
- **DoS bounding.** `merge`, `diff`, and `deepEqual` are cycle-safe (they terminate on circular input); `dereference` follows `$ref` chains iteratively (no stack overflow) and memoizes resolved targets (no O(N²) re-walk); `diff` memoizes equal pairs (no exponential blow-up on shared/DAG inputs); `deepEqual`/`diff` compare primitive Sets in O(n).
- **Type confusion.** Cross-realm `Map`/`Set`/`DataView`/`ArrayBuffer` and `Symbol.toStringTag` spoofs are detected by tag and degrade gracefully — they never crash `clone`, lose entries, or return the input by reference.
- **Isolation.** `clone` and `merge` return values that share no references with their inputs (including under `map()` + `stop()`, and `Error.cause`).

## Contracts you must respect for untrusted input

These are intentional behaviors, not bugs — handle them at the call site:

- **Recursion depth is unbounded by default.** Deeply-nested untrusted input can overflow the call stack. Pass `maxDepth` to bound it: `clone(x, { maxDepth: 1000 })`, `deepEqual(a, b, { maxDepth })`, `diff(a, b, { maxDepth })`, `merge(a, b, { maxDepth })`, `dereference(doc, { maxDepth })`, walks (`forEach`/`map`/…).
- **`dereference` fan-out is proportional to the document.** N `$ref`s to a large subtree produce N clones — size-limit untrusted schema/OpenAPI documents before dereferencing.
- **`deepEqual`/`diff` on large object-element Sets is O(n²).** Size-cap untrusted Sets of objects (primitive-element Sets are O(n)).
- **`patch` rejects unsafe path segments** (`__proto__`/`constructor`/`prototype`) by design. As a consequence, objects with a _literal_ own `__proto__` data key do not round-trip through `diff` → `patch` (the patch throws rather than risk pollution). This is intentional.
- **Traversal executes accessors.** `forEach`/`map`/`clone`/`get`/`has`/`deepEqual` read `obj[key]`, which invokes getters and `Proxy` traps on the input. If the input is untrusted and may carry accessors, round-trip it through `JSON.parse(JSON.stringify(x))` (or `structuredClone`) first. The library is robust to throwing/mutating getters (no state corruption, no infinite loop), but their code still runs.
- **`get`/`has` read own non-enumerable properties** (they never walk the prototype chain), which differs from the walk APIs' own-enumerable-only contract.
- **`freeze` deep-freezes the original graph in place** (and all shared sub-objects). Use `freeze(clone(obj))` if you need an isolated frozen copy.

## Supported versions

Security fixes target the latest published `0.x` release.

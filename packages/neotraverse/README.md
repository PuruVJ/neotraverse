# neotraverse

Traverse and transform objects by visiting every node on a recursive walk. A TypeScript rewrite of [`traverse`](https://github.com/ljharb/js-traverse) with **0 dependencies**, **prototype-pollution hardening**, **~5× the throughput** and **~6× less allocation** with the functional API (up to **~10×** / **~11×** peaks on core walks).

> 📖 **Full docs, security audit & live benchmarks:** **[neotraverse.puruvj.dev](https://neotraverse.puruvj.dev)**

**Utility-first:** the default export is named functions (`sideEffects: false`), pay for what you use, not a monolithic class.

- 🤌 **~2–6 KB brotli** (tree-shaken; ~2 KB for one walk like `forEach`, ~5.8 KB for every helper)
- 🚥 Zero dependencies, no polyfills
- 🎹 TypeScript: throw away `@types/traverse`
- 🛡️ Safe on untrusted input ([prototype-pollution & injection hardened](#security))
- ⚡ **~5× faster** and **~6× leaner** than `traverse` with the functional API (up to **~10×** / **~11×**); **~3×** speed and **~2×** less memory on the legacy drop-in build
- 🛸 ESM-first, with a legacy ES2015 CJS/ESM build
- 🛟 **[`neotraverse/safe`](#neotraversesafe):** an opt-in, stack-safe iterative core that walks **200,000-deep** trees recursion can't, with a lazy `visit` iterator and copy-on-write `transform` (Node 22+)

## Benchmarks (summary)

Geometric-mean speedup versus the original `traverse` across the full operation × shape matrix:

| Build                               | Speedup vs `traverse`                                               | Allocation vs `traverse` (core walks)               |
| ----------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------- |
| **neotraverse modern** (functional) | **≈ 4.9×** (full matrix) · **≈ 5.6×** (core walks) · **up to ~10×** | **≈ 5.7× less** · **up to ~11×** (`forEach · wide`) |
| **neotraverse legacy** (drop-in)    | **≈ 3×**                                                            | **≈ 2× less**                                       |

Core traversal ops (`forEach` / `map` / `clone` / `reduce` / `paths` / `nodes`) on the **functional** build land at **~3–10×** throughput and **~6× less heap** on average vs `traverse` (peaks: `clone · small` **~9.9×** speed, `forEach · wide` **~11×** memory). See the [full table](#benchmarks-full) or the [interactive benchmarks page](https://neotraverse.puruvj.dev/benchmarks). Reproduce with `pnpm bench`.

## Install

```sh
npm install neotraverse
```

## Bundle size (tree-shaken, brotli)

Measured with esbuild + brotli from published ESM ([`bench/bundle-sizes.json`](./bench/bundle-sizes.json); `pnpm bundle-size`):

| Import                                                  | Brotli          |
| ------------------------------------------------------- | --------------- |
| One walk terminal (`forEach`, `map`, `find`, `size`, …) | **~2 KB**       |
| Path only (`get` / `has` / `set` or `getPath`)          | **~0.3–0.5 KB** |
| Every functional helper                                 | **~5.8 KB**     |

## Quick start

```ts
// the default export: tree-shakeable functions, `ctx` argument (recommended)
import { forEach } from 'neotraverse';

forEach({ a: 1, b: 2, c: [3, 4] }, (ctx, x) => {
  if (typeof x === 'number') ctx.update(x * 10);
});
```

```ts
// classic `traverse`-compatible API (drop-in for the original `traverse`)
import traverse from 'neotraverse/legacy';

traverse({ a: 1, b: 2, c: [3, 4] }).forEach(function (x) {
  if (typeof x === 'number') this.update(x * 10);
});
```

```ts
// the deprecated 0.x `Traverse` class lives here, removed in v2
import { Traverse } from 'neotraverse/modern';
```

## `neotraverse/safe`

A second, opt-in entry point for input that is **deep, untrusted, huge, or only partially consumed**. The default `neotraverse` walk is recursive (fast, but it overflows the call stack on deep enough input). `neotraverse/safe` runs on an **iterative** engine, so it traverses arbitrarily deep trees that crash a recursive walker (measured: the default overflows past **~2,000** levels; `/safe` handles **200,000+**). It is also lazy and copy-on-write.

```ts
import { visit, transform } from 'neotraverse/safe';

// lazy iteration: stop early, never materialize the rest
const first5 = visit(huge)
  .filter((v) => typeof v.value === 'string')
  .take(5)
  .toArray();

// copy-on-write: shares untouched subtrees, returns the input by identity on a no-op
const redacted = transform(doc, {
  '**.{password,token}': (v, { replace }) => replace('***')
});
```

It ships a twelve-export surface: `visit`, `transform` / `transformAsync`, `get` / `set` / `has`, `clone`, `equal`, `merge`, `diff`, `patch`, `resolveRefs`.

**The honest trade-off:** on a full eager scan `/safe` runs at roughly **0.8×** the default (still ~4× faster than `traverse`), and materializing a whole tree costs a little more memory. It wins on **stack safety**, on **early-exit memory** (~6× less peak on a `filter().take()` chain), and on **copy-on-write** edits. Requires **Node 22+** / evergreen browsers (it uses native ES2025 iterator helpers). See the [`/safe` guide](https://neotraverse.puruvj.dev/guide/safe).

## Builds & browser support

| Build       | Import               | Contents                           | Module    | Target | Browsers                                      |
| ----------- | -------------------- | ---------------------------------- | --------- | ------ | --------------------------------------------- |
| **default** | `neotraverse`        | functional API (recommended)       | ESM       | ES2022 | Chrome/Edge 94+, Firefox 93+, Safari 15+      |
| **safe**    | `neotraverse/safe`   | stack-safe iterative core (opt-in) | ESM       | ES2024 | Node 22+, evergreen browsers                  |
| **modern**  | `neotraverse/modern` | deprecated `Traverse` class only   | ESM       | ES2022 | Chrome/Edge 94+, Firefox 93+, Safari 15+      |
| **legacy**  | `neotraverse/legacy` | classic `traverse` drop-in         | CJS + ESM | ES2015 | Chrome 51+, Firefox 54+, Safari 10+, Edge 15+ |

> ⚠️ **1.0 breaking changes:** the default export (`neotraverse`) is now the functional API, not the classic `traverse` default. Move classic drop-in imports to `neotraverse/legacy`, and `import { Traverse }` to `neotraverse/modern`. The legacy build also targets **ES2015** (was ES5); only environments needing literal ES5 (e.g. IE11) are affected.

## Security

`neotraverse` is safe to run on **untrusted data**:

- **No prototype pollution:** `set(path, value)` refuses `__proto__` / `constructor` / `prototype` keys.
- **No prototype injection:** `clone()` / `map()` of hostile JSON like `{"__proto__":{"isAdmin":true}}` keep their real prototype; `result.isAdmin` is `undefined`.
- **Prototype preservation intact:** legitimate `instanceof` still works after a clone.
- **No prototype-chain disclosure:** `get()` / `has()` follow only own properties.

```ts
import { clone } from 'neotraverse';

const evil = JSON.parse('{"user":"bob","__proto__":{"isAdmin":true}}');
clone(evil).isAdmin; // undefined
({}).isAdmin; // undefined, global prototype untouched
```

Read the full story in the [**1.0 release post**](https://puruvj.dev/blog/neotraverse-1-0).

### DoS guard

Bound recursion on deeply-nested hostile input with `maxDepth` (throws a catchable `RangeError`; unlimited by default):

```ts
clone(untrusted, { maxDepth: 1000 });
```

> The hardening and DoS guards apply to the **functional** API. The `neotraverse/legacy` drop-in is intentionally kept behaviour-compatible with the original `traverse` and does **not** receive them — run untrusted data through the functional API.

## Migrating from `traverse`

**[Differences from traverse](https://neotraverse.puruvj.dev/guide/vs-traverse):** drop-in vs functional, what's new, which build to use.

```diff
-import traverse from 'traverse';
+import traverse from 'neotraverse/legacy';
```

```sh
npm install neotraverse && npm uninstall traverse @types/traverse
```

The legacy API is identical to `traverse`. For new code, prefer the functional default export.

## API

**Functional (`neotraverse`, recommended):** `forEach`, `map`, `clone`, `reduce`, `find`, `filter`, `some`, `every`, `paths`, `nodes`, `get`, `set`, `has`, `entries`, `values`, `walk`, `breadthFirst`, `mapBfs`, `forEachAsync`, `mapAsync`, plus `findPaths`, `filterPaths`, `getPath`, `setPath`, `hasPath`, `parsePath`, `parseDotPath`, `parseJsonPointer`, `pointerPath`, `parseGlob`, `count`, `size`, `getType`, `groupBy`, `skipWhere`, `deleteWhere`, `prune`, `pruneDeep`, `sanitize`, `deepEqual`, `merge`, `dereference`, `toJSON`, `freeze`, `diff`, `patch`, `select`. Options are always the last argument.

**Deprecated class (`neotraverse/modern`):** the `Traverse` class (`.get`/`.has`/`.set`/`.map`/`.forEach`/`.reduce`/`.paths`/`.nodes`/`.clone`) is deprecated and **removed in v2** — use the functions above.

**Classic (`neotraverse/legacy`):** `.map(fn)` · `.forEach(fn)` · `.reduce(fn, acc)` · `.paths()` · `.nodes()` · `.clone()` · `.get(path)` · `.set(path, value)` · `.has(path)` on a traversal instance (`this`-bound context).

Options: `{ immutable?, includeSymbols?, maxDepth?, signal? }` (`signal` is async-only on modern).

Each callback gets a context (`ctx` in modern, `this` in classic) with `node`, `path`, `parent`, `key`, `isRoot`, `isLeaf`, `isFirst`, `isLast`, `level`, `circular`, and the mutators `update()`, `remove()`, `delete()`, `before()`, `after()`, `pre()`, `post()`, `stop()`, `block()`.

👉 Full API reference, examples, and context docs: **[neotraverse.puruvj.dev/guide](https://neotraverse.puruvj.dev/guide)**.

## Benchmarks (full) {#benchmarks-full}

`neotraverse` vs `traverse`, ops/sec (and ×speedup). Generated by [`bench/run.ts`](./bench/run.ts) via [tinybench](https://github.com/tinylibs/tinybench); see [`bench/results.json`](./bench/results.json).

| Operation · shape |   traverse | neotraverse legacy | neotraverse modern |
| ----------------- | ---------: | -----------------: | -----------------: |
| `forEach · small` |    841,043 |  2,414,704 (2.87×) |  4,016,013 (4.78×) |
| `forEach · wide`  |     79,308 |    284,208 (3.58×) |    594,241 (7.49×) |
| `forEach · deep`  |     53,214 |    160,316 (3.01×) |    330,800 (6.22×) |
| `forEach · array` |      3,019 |     10,186 (3.37×) |     21,242 (7.04×) |
| `forEach · json`  |     57,421 |    186,579 (3.25×) |    382,143 (6.66×) |
| `map · small`     |    393,442 |  1,268,242 (3.22×) |  2,267,588 (5.76×) |
| `map · wide`      |     50,468 |    106,498 (2.11×) |    183,870 (3.64×) |
| `map · deep`      |     18,833 |     87,198 (4.63×) |    136,623 (7.25×) |
| `map · array`     |      1,421 |      4,376 (3.08×) |      8,619 (6.07×) |
| `map · json`      |     23,178 |     83,958 (3.62×) |    151,069 (6.52×) |
| `clone · small`   |    494,252 |  3,356,979 (6.79×) |  4,884,062 (9.88×) |
| `clone · wide`    |    209,591 |    309,111 (1.47×) |    574,325 (2.74×) |
| `clone · deep`    |     27,853 |    170,807 (6.13×) |    260,473 (9.35×) |
| `clone · array`   |      3,250 |     11,408 (3.51×) |     15,411 (4.74×) |
| `clone · json`    |     42,207 |    205,740 (4.87×) |    303,054 (7.18×) |
| `reduce · small`  |    796,994 |  2,201,209 (2.76×) |  3,536,758 (4.44×) |
| `reduce · wide`   |     75,627 |    260,493 (3.44×) |    489,665 (6.47×) |
| `reduce · deep`   |     50,668 |    145,498 (2.87×) |     288,933 (5.7×) |
| `reduce · array`  |      2,909 |      9,229 (3.17×) |     17,781 (6.11×) |
| `reduce · json`   |     55,255 |    173,837 (3.15×) |    328,782 (5.95×) |
| `paths · small`   |    811,923 |  2,279,936 (2.81×) |  3,402,905 (4.19×) |
| `paths · wide`    |     77,412 |    268,188 (3.46×) |    475,490 (6.14×) |
| `paths · deep`    |     50,955 |    151,982 (2.98×) |    212,666 (4.17×) |
| `paths · array`   |      2,976 |      9,566 (3.21×) |      16,368 (5.5×) |
| `paths · json`    |     56,251 |    177,158 (3.15×) |    294,870 (5.24×) |
| `nodes · small`   |    800,765 |  2,258,624 (2.82×) |  3,490,623 (4.36×) |
| `nodes · wide`    |     76,618 |    265,446 (3.46×) |    506,638 (6.61×) |
| `nodes · deep`    |     51,151 |    149,846 (2.93×) |    288,099 (5.63×) |
| `nodes · array`   |      2,943 |      9,442 (3.21×) |     17,715 (6.02×) |
| `nodes · json`    |     55,541 |    176,656 (3.18×) |    328,321 (5.91×) |
| `get · json`      | 18,069,492 | 22,168,643 (1.23×) | 21,280,988 (1.18×) |
| `has · json`      | 18,943,414 | 22,254,349 (1.17×) | 22,156,236 (1.17×) |
| `set · json`      | 23,632,276 | 23,862,298 (1.01×) | 19,365,527 (0.82×) |

> `get` / `has` / `set` are micro-ops (20M+ ops/s); all three builds are within noise of each other and of `traverse`. The legacy class stores its state in plain instance fields (not `#private`, which would downlevel to WeakMaps at ES2015), so these stay native-fast on the drop-in too.

## License

[MIT](./LICENSE), [Puru Vijay](https://puruvj.dev).

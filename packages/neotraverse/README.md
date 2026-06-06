# neotraverse

Traverse and transform objects by visiting every node on a recursive walk. A TypeScript rewrite of [`traverse`](https://github.com/ljharb/js-traverse) with **0 dependencies**, **prototype-pollution hardening**, **~5× the throughput** and **~6× less allocation** with the functional API (up to **~10×** / **~11×** peaks on core walks).

> 📖 **Full docs, security audit & live benchmarks:** **[neotraverse.puruvj.dev](https://neotraverse.puruvj.dev)**

**Utility-first:** import named functions from `neotraverse/modern` (`sideEffects: false`), pay for what you use, not a monolithic class.

- 🤌 **~2–6 KB brotli** (tree-shaken; ~2 KB for one walk like `forEach`, ~5.8 KB for all functions except deprecated `Traverse`)
- 🚥 Zero dependencies, no polyfills
- 🎹 TypeScript: throw away `@types/traverse`
- 🛡️ Safe on untrusted input ([prototype-pollution & injection hardened](#security))
- ⚡ **~5× faster** and **~6× leaner** than `traverse` with `neotraverse/modern` (up to **~10×** / **~11×**); **~2.3×** speed and **~2×** less memory on the drop-in build
- 🛸 ESM-first, with a legacy ES2015 CJS/ESM build

## Benchmarks (summary)

Geometric-mean speedup versus the original `traverse` across the full operation × shape matrix:

| Build                  | Speedup vs `traverse` | Allocation vs `traverse` (core walks) |
| ---------------------- | --------------------- | ------------------------------------- |
| **neotraverse modern** (functional) | **≈ 4.8×** (full matrix) · **≈ 5.6×** (core walks) · **up to ~10×** | **≈ 5.7× less** · **up to ~11×** (`forEach · wide`) |
| **neotraverse legacy** (drop-in)      | **≈ 2.3×**                                                            | **≈ 2× less**                                       |

Core traversal ops (`forEach` / `map` / `clone` / `reduce` / `paths` / `nodes`) on the **functional** build land at **~3–10×** throughput and **~6× less heap** on average vs `traverse` (peaks: `clone · small` **10.1×** speed, `forEach · wide` **~11×** memory). See the [full table](#benchmarks-full) or the [interactive benchmarks page](https://neotraverse.puruvj.dev/benchmarks). Reproduce with `pnpm bench`.

## Install

```sh
npm install neotraverse
```

## Bundle size (tree-shaken, brotli)

Measured with esbuild + brotli from published ESM ([`bench/bundle-sizes.json`](./bench/bundle-sizes.json); `pnpm bundle-size`):

| Import | Brotli |
|--------|--------|
| One walk terminal (`forEach`, `map`, `find`, `size`, …) | **~2 KB** |
| Path only (`get` / `has` / `set` or `getPath`) | **~0.3–0.5 KB** |
| All modern functions (no deprecated `Traverse` class) | **~5.8 KB** |

## Quick start

```ts
// modern build, tree-shakeable functions, `ctx` argument (recommended)
import { forEach } from 'neotraverse/modern';

forEach({ a: 1, b: 2, c: [3, 4] }, (ctx, x) => {
  if (typeof x === 'number') ctx.update(x * 10);
});
```

```ts
// or: import * as t from 'neotraverse/modern'
// `new Traverse(obj)` still works in 0.7 but is deprecated, see the migration guide
```

```ts
// classic `traverse`-compatible API
import traverse from 'neotraverse';

traverse({ a: 1, b: 2, c: [3, 4] }).forEach(function (x) {
  if (typeof x === 'number') this.update(x * 10);
});
```

## Builds & browser support

| Build       | Import                | Module       | Target | Browsers                                      |
| ----------- | --------------------- | ------------ | ------ | --------------------------------------------- |
| **default** | `neotraverse`         | ESM          | ES2022 | Chrome/Edge 94+, Firefox 93+, Safari 15+      |
| **modern**  | `neotraverse/modern`  | ESM          | ES2022 | Chrome/Edge 94+, Firefox 93+, Safari 15+      |
| **legacy**  | `neotraverse/legacy`  | CJS + ESM    | ES2015 | Chrome 51+, Firefox 54+, Safari 10+, Edge 15+ |

> ⚠️ **0.7 breaking change:** the legacy build now targets **ES2015** (was ES5). It is still CJS + ESM and a drop-in `traverse` replacement; only environments needing literal ES5 (e.g. IE11) are affected.

## Security

`neotraverse` is safe to run on **untrusted data**:

- **No prototype pollution:** `set(path, value)` refuses `__proto__` / `constructor` / `prototype` keys.
- **No prototype injection:** `clone()` / `map()` of hostile JSON like `{"__proto__":{"isAdmin":true}}` keep their real prototype; `result.isAdmin` is `undefined`.
- **Prototype preservation intact:** legitimate `instanceof` still works after a clone.
- **No prototype-chain disclosure:** `get()` / `has()` follow only own properties.

```ts
const evil = JSON.parse('{"user":"bob","__proto__":{"isAdmin":true}}');
traverse(evil).clone().isAdmin; // undefined
({}).isAdmin;                    // undefined, global prototype untouched
```

Read the full story in the [**0.7 release post**](https://puruvj.dev/blog/neotraverse-0-7).

### DoS guard

Bound recursion on deeply-nested hostile input with `maxDepth` (throws a catchable `RangeError`; unlimited by default):

```ts
traverse(untrusted, { maxDepth: 1000 }).clone();
```

## Migrating from `traverse`

**[Differences from traverse](https://neotraverse.puruvj.dev/guide/vs-traverse):** drop-in vs modern, what's new, which build to use.

```diff
-import traverse from 'traverse';
+import traverse from 'neotraverse';
```

```sh
npm install neotraverse && npm uninstall traverse @types/traverse
```

The API is identical. For old bundlers/runtimes use `neotraverse/legacy`.

## API

**Modern (`neotraverse/modern`):** `forEach`, `map`, `clone`, `reduce`, `find`, `filter`, `paths`, `nodes`, `get`, `set`, `has`, `entries`, `values`, `forEachAsync`, `mapAsync`, plus `findPaths`, `filterPaths`, `getPath`, `setPath`, `hasPath`, `count`, `size`, `getType`, `deleteWhere`, `prune`, `pruneDeep`, `deepEqual`, `toJSON`, `freeze`, `diff`, `patch`, `select`. Options are always the last argument. The `Traverse` class is deprecated in 0.7 and removed in 0.8.

**Classic (`neotraverse`):** `.map(fn)` · `.forEach(fn)` · `.reduce(fn, acc)` · `.paths()` · `.nodes()` · `.clone()` · `.get(path)` · `.set(path, value)` · `.has(path)` on a traversal instance (`this`-bound context).

Options: `{ immutable?, includeSymbols?, maxDepth?, signal? }` (`signal` is async-only on modern).

Each callback gets a context (`ctx` in modern, `this` in classic) with `node`, `path`, `parent`, `key`, `isRoot`, `isLeaf`, `isFirst`, `isLast`, `level`, `circular`, and the mutators `update()`, `remove()`, `delete()`, `before()`, `after()`, `pre()`, `post()`, `stop()`, `block()`.

👉 Full API reference, examples, and context docs: **[neotraverse.puruvj.dev/guide](https://neotraverse.puruvj.dev/guide)**.

## Benchmarks (full) {#benchmarks-full}

`neotraverse` vs `traverse`, ops/sec (and ×speedup). Generated by [`bench/run.ts`](./bench/run.ts) via [tinybench](https://github.com/tinylibs/tinybench); see [`bench/results.json`](./bench/results.json).

| Operation · shape | traverse | neotraverse legacy | neotraverse modern |
| --- | ---: | ---: | ---: |
| `forEach · small` | 841,386 | 1,720,627 (2.04×) | 4,057,365 (4.82×) |
| `forEach · wide` | 78,483 | 267,531 (3.41×) | 617,121 (7.86×) |
| `forEach · deep` | 52,573 | 153,935 (2.93×) | 349,603 (6.65×) |
| `forEach · array` | 3,036 | 9,983 (3.29×) | 20,954 (6.9×) |
| `forEach · json` | 56,685 | 176,455 (3.11×) | 382,614 (6.75×) |
| `map · small` | 387,387 | 990,791 (2.56×) | 1,721,915 (4.44×) |
| `map · wide` | 49,933 | 102,529 (2.05×) | 140,108 (2.81×) |
| `map · deep` | 18,543 | 83,697 (4.51×) | 121,441 (6.55×) |
| `map · array` | 1,426 | 4,316 (3.03×) | 6,435 (4.51×) |
| `map · json` | 22,880 | 81,502 (3.56×) | 119,187 (5.21×) |
| `clone · small` | 501,164 | 2,080,789 (4.15×) | 5,073,559 (**10.12×**) |
| `clone · wide` | 207,489 | 290,273 (1.4×) | 591,765 (2.85×) |
| `clone · deep` | 27,846 | 158,910 (5.71×) | 266,072 (9.56×) |
| `clone · array` | 3,205 | 11,191 (3.49×) | 15,902 (4.96×) |
| `clone · json` | 41,840 | 196,597 (4.7×) | 303,938 (7.26×) |
| `reduce · small` | 796,124 | 1,582,620 (1.99×) | 3,437,297 (4.32×) |
| `reduce · wide` | 75,487 | 244,335 (3.24×) | 510,850 (6.77×) |
| `reduce · deep` | 50,355 | 141,620 (2.81×) | 285,759 (5.67×) |
| `reduce · array` | 2,797 | 8,792 (3.14×) | 17,191 (6.15×) |
| `reduce · json` | 54,769 | 160,287 (2.93×) | 321,514 (5.87×) |
| `paths · small` | 805,467 | 1,576,093 (1.96×) | 3,311,953 (4.11×) |
| `paths · wide` | 75,679 | 248,143 (3.28×) | 481,905 (6.37×) |
| `paths · deep` | 50,249 | 140,920 (2.8×) | 210,963 (4.2×) |
| `paths · array` | 2,892 | 9,420 (3.26×) | 15,623 (5.4×) |
| `paths · json` | 55,659 | 164,819 (2.96×) | 292,957 (5.26×) |
| `nodes · small` | 797,648 | 1,587,215 (1.99×) | 3,418,562 (4.29×) |
| `nodes · wide` | 75,792 | 251,876 (3.32×) | 516,023 (6.81×) |
| `nodes · deep` | 50,493 | 139,695 (2.77×) | 293,898 (5.82×) |
| `nodes · array` | 2,882 | 9,202 (3.19×) | 17,257 (5.99×) |
| `nodes · json` | 54,999 | 165,298 (3.01×) | 322,322 (5.86×) |
| `get · json` | 17,876,663 | 4,171,290 (0.23×) | 22,827,547 (1.28×) |
| `has · json` | 18,238,578 | 3,295,910 (0.18×) | 23,185,771 (1.27×) |
| `set · json` | 23,695,761 | 3,217,818 (0.14×) | 22,588,780 (0.95×) |

> `get` / `has` / `set` are fastest on the **modern** build; the **legacy** (ES2015) build is slower for these because its private `#fields` downlevel to WeakMaps. Prefer `neotraverse/modern` for path-heavy hot code.

## License

[MIT](./LICENSE), [Puru Vijay](https://puruvj.dev).

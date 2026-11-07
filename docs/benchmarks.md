---
title: Benchmarks
outline: deep
---

<script setup>
import results from '../packages/neotraverse/bench/results.json'
import bundleSizes from '../packages/neotraverse/bench/bundle-sizes.json'
import safeMem from '../packages/neotraverse/bench/results-safe-memory.json'
import BenchChart from './.vitepress/theme/components/BenchChart.vue'
const date = new Date(results.generatedAt).toISOString().slice(0, 10)
const compareUrl = `https://bundle-roast.puruvj.dev/compare?q=neotraverse@${results.versions.neotraverse}%7Ctraverse@${results.versions.traverse}`
const brotli = bundleSizes.summary.brotliKb
const earlyExit = safeMem.rows.find(r => r.pattern.startsWith('First 5'))
const fullScan = safeMem.rows.find(r => r.pattern.startsWith('Genuinely'))
</script>

# Benchmarks

How <strong>neotraverse</strong> compares to the original <a href="https://www.npmjs.com/package/traverse"><code>traverse</code></a>, across the full operation × shape matrix. Toggle between **throughput** (higher is better) and **memory** (lower is better).

<blockquote>

**Geometric mean speedup vs `traverse`:** **functional `neotraverse` ≈ {{ results.summary['neotraverse modern'] }}×**, **`neotraverse/legacy` ≈ {{ results.summary['neotraverse legacy'] }}×**.

**Geometric mean allocation reduction on core walks** (`forEach`, `map`, `clone`, `reduce`, `paths`, `nodes`): **functional `neotraverse` ≈ {{ results.summary.memory.traversal['neotraverse modern'] }}× less**, **`neotraverse/legacy` ≈ {{ results.summary.memory.traversal['neotraverse legacy'] }}× less** (traverse B/op ÷ neotraverse B/op).

</blockquote>

These numbers come from [`packages/neotraverse/bench/run.ts`](https://github.com/PuruVJ/neotraverse/blob/main/packages/neotraverse/bench/run.ts) (powered by [tinybench](https://github.com/tinylibs/tinybench)) and are imported directly from the committed `bench/results.json`. Reproduce locally with `pnpm bench`.

<small>Generated {{ date }} · Node {{ results.runtime.node }} · neotraverse {{ results.versions.neotraverse }} vs traverse {{ results.versions.traverse }}</small>

These are **runtime** benchmarks.

## Bundle size (tree-shaken, brotli)

The default `neotraverse` export is **utility-first** (`sideEffects: false`): your bundler drops unused exports.

| Scenario                                        | Brotli (approx.)                     |
| ----------------------------------------------- | ------------------------------------ |
| One walk terminal (`forEach`, `map`, `find`, …) | **~{{ brotli.walkTerminalMin }} KB** |
| Path helpers only (`get` / `has` / `set`)       | **~{{ brotli.pathOnlyMin }} KB**     |
| All functions except deprecated `Traverse`      | **~{{ brotli.allFunctionsMax }} KB** |

**Range: {{ bundleSizes.summary.rangeLabel }}**, floor ≈ single traversal, ceiling ≈ full toolkit.

Source: [`bench/bundle-sizes.json`](https://github.com/PuruVJ/neotraverse/blob/main/packages/neotraverse/bench/bundle-sizes.json) (`pnpm bundle-size` in `packages/neotraverse`). For a third-party **`traverse` vs neotraverse** comparison, see <a :href="compareUrl" target="_blank" rel="noreferrer">bundle-roast ↗</a>.

<BenchChart />

## Notes

- **Traversal operations** (`forEach`, `map`, `clone`, `reduce`, `paths`, `nodes`) on the **functional** default `neotraverse` export average **~5.6×** vs `traverse` and peak at **~10×** (`clone · small`), with **~5.7× less heap per op** on average (up to **~11×** on `forEach · wide`). The **`neotraverse/legacy`** drop-in averages **~3×** speed and **~2×** less allocation across core walks.
- **`clone` peaks at ~10×** on the functional API (`clone · small`). The legacy build and the functional API share the same `clone()` / `copy()` source, but the functional bundle inlines a leaner walk, so it often wins by a wide margin on smaller shapes while wide flat objects stay closer (~3×).
- The **`get` / `has` / `set`** path helpers are micro-ops (20M+ ops/s); the functional `neotraverse` API and the `neotraverse/legacy` drop-in are both within noise of `traverse`. The legacy class stores its state in plain instance fields (not `#private`, which would downlevel to WeakMaps at ES2015), so it stays native-fast here too.
- **Memory** figures are an approximate bytes-allocated-per-op signal (median of GC-bracketed samples). JS memory measurement is noisy, treat them as ballpark, like the throughput margins of error (`rme`) in the JSON.

## `neotraverse/safe` — the safety trade-off

[`neotraverse/safe`](/guide/safe) is a separate, opt-in core built on an **iterative** engine. It is **not** a faster successor — it trades a little throughput for **stack-safety** and **bounded memory on partial consumption**. The point of these numbers is _when to reach for it_, not "/safe is faster".

### Throughput

On a full eager scan, `/safe`'s lazy iterator runs at roughly **0.8×** the default `neotraverse` (which is itself ~5× faster than `traverse`) — so `/safe` is still ~4× faster than the original `traverse`. `clone` is at parity; in-place `set` is slightly ahead. Reproduce with `pnpm bench:safe` (written to `bench/results-safe.json`).

### Memory & stack-safety (the reasons it exists)

<small>Reproduce with <code>pnpm bench:safe-memory</code> · {{ safeMem.treeSize.toLocaleString() }}-node tree · Node {{ safeMem.runtime.node }}</small>

| Scenario                                 | default `neotraverse`                                                        | `neotraverse/safe`                                                           | Verdict                                                                 |
| ---------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **Deep input** (linked tree, levels)     | overflows past **~{{ safeMem.stackSafety.v1MaxDepth.toLocaleString() }}** 💥 | **{{ safeMem.stackSafety.safeDepthTested.toLocaleString() }}+**, no overflow | **/safe only**                                                          |
| **First 5 of a filtered scan** (peak MB) | {{ earlyExit.v1Mb }} MB                                                      | **{{ earlyExit.safeMb }} MB**                                                | **/safe {{ earlyExit.ratio }}× less**                                   |
| **Materialize the whole tree** (peak MB) | **{{ fullScan.v1Mb }} MB**                                                   | {{ fullScan.safeMb }} MB                                                     | default wins ({{ (fullScan.safeMb / fullScan.v1Mb).toFixed(1) }}× more) |

**Read this honestly:**

- **Stack safety is categorical.** The default walk is recursive and overflows on deep input; `/safe` is iterative and doesn't. For untrusted JSON or naturally deep data (ASTs, file trees), this is a correctness/security difference, not a speed one.
- **Early-exit / streaming uses far less memory** — because `/safe`'s lazy chains never materialize the intermediate collection that the default's array-returning `filter`/`paths`/`nodes` must build first. This win is _algorithmic_, so it's stable.
- **Full materialization is not a memory win.** `/safe` allocates one `Visit` per node, so keeping the whole tree costs _more_. Its memory advantage is specifically about **not** materializing what you don't consume.

See [Why `/safe`](/guide/safe) for the full story.

## Counting work (for PRs)

The numbers above are timings: they answer "how fast is it, and how does it compare with `traverse`". They also move by a few percent from run to run, so they cannot tell you whether a PR made a walk 2% slower.

For that, the repository also counts the work each function does with [Heisenbench](https://www.npmjs.com/package/heisenbench). It runs the TypeScript source in `src/` with every function rewritten to count its own operations (property reads, compares, calls, allocations). The count is exact and the same on every run, so one run of a PR and one run of its base are enough, and a change is reported on the line that caused it.

```sh
pnpm bench:count    # needs Node 26.4 or newer; writes packages/neotraverse/bench/heisenbench.json
```

- The cases are in `packages/neotraverse/bench/*.bench.ts`: the operations and datasets of `run.ts` and `run-safe.ts` (default API, `neotraverse/legacy` and `neotraverse/safe`), plus `find`, `filter`, `breadthFirst`, `patch`, `transformAsync` and the string path parsers.
- `bench/resolve.ts` lets the source's `./x.js` imports load the `./x.ts` files.
- Every PR gets a comment from [`.github/workflows/heisenbench.yml`](https://github.com/PuruVJ/neotraverse/blob/main/.github/workflows/heisenbench.yml) with each function whose count changed, and the lines where it changed.
- To compare two commits by hand, count each one, then run `pnpm exec heisenbench diff base.json pr.json --repo ../..` in `packages/neotraverse`.
- `pnpm --filter neotraverse bench:growth` counts each case at 1×, 4×, 16× and 50× its input and names the curve. The datasets that have a `grow` in `bench/data.ts` grow by keys, depth or items (50× stays under the depth where the recursive default walk overflows). It shows, for example, that the default walks are quadratic in depth on the `deep` chain (each node is compared with every ancestor to find cycles), while `neotraverse/safe` stays linear.

Counts are not time: the engine can make some operations nearly free. Use `pnpm bench` for speed and for the comparison with `traverse`, and the counts to see what a change does to the work.

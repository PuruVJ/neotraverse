---
title: Benchmarks
outline: deep
---

<script setup>
import results from '../packages/neotraverse/bench/results.json'
import bundleSizes from '../packages/neotraverse/bench/bundle-sizes.json'
import BenchChart from './.vitepress/theme/components/BenchChart.vue'
const date = new Date(results.generatedAt).toISOString().slice(0, 10)
const compareUrl = `https://bundle-roast.puruvj.dev/compare?q=neotraverse@${results.versions.neotraverse}%7Ctraverse@${results.versions.traverse}`
const brotli = bundleSizes.summary.brotliKb
</script>

# Benchmarks

How <strong>neotraverse</strong> compares to the original <a href="https://www.npmjs.com/package/traverse"><code>traverse</code></a>,
across the full operation × shape matrix. Toggle between **throughput** (higher is better) and **memory**
(lower is better).

<blockquote>

**Geometric mean speedup vs `traverse`:**
**functional `neotraverse` ≈ {{ results.summary['neotraverse modern'] }}×**, **`neotraverse/legacy` ≈ {{ results.summary['neotraverse legacy'] }}×**.

**Geometric mean allocation reduction on core walks** (`forEach`, `map`, `clone`, `reduce`, `paths`, `nodes`):
**functional `neotraverse` ≈ {{ results.summary.memory.traversal['neotraverse modern'] }}× less**, **`neotraverse/legacy` ≈ {{ results.summary.memory.traversal['neotraverse legacy'] }}× less** (traverse B/op ÷ neotraverse B/op).

</blockquote>

These numbers come from [`packages/neotraverse/bench/run.ts`](https://github.com/PuruVJ/neotraverse/blob/main/packages/neotraverse/bench/run.ts)
(powered by [tinybench](https://github.com/tinylibs/tinybench)) and are imported directly from the committed
`bench/results.json`. Reproduce locally with `pnpm bench`.

<small>Generated {{ date }} · Node {{ results.runtime.node }} · neotraverse {{ results.versions.neotraverse }} vs traverse {{ results.versions.traverse }}</small>

These are **runtime** benchmarks.

## Bundle size (tree-shaken, brotli)

The default `neotraverse` export is **utility-first** (`sideEffects: false`): your bundler drops unused exports.

| Scenario | Brotli (approx.) |
|----------|------------------|
| One walk terminal (`forEach`, `map`, `find`, …) | **~{{ brotli.walkTerminalMin }} KB** |
| Path helpers only (`get` / `has` / `set`) | **~{{ brotli.pathOnlyMin }} KB** |
| All functions except deprecated `Traverse` | **~{{ brotli.allFunctionsMax }} KB** |

**Range: {{ bundleSizes.summary.rangeLabel }}**, floor ≈ single traversal, ceiling ≈ full toolkit.

Source: [`bench/bundle-sizes.json`](https://github.com/PuruVJ/neotraverse/blob/main/packages/neotraverse/bench/bundle-sizes.json) (`pnpm bundle-size` in `packages/neotraverse`). For a third-party **`traverse` vs neotraverse** comparison, see
<a :href="compareUrl" target="_blank" rel="noreferrer">bundle-roast ↗</a>.

<BenchChart />

## Notes

- **Traversal operations** (`forEach`, `map`, `clone`, `reduce`, `paths`, `nodes`) on the **functional** default
  `neotraverse` export average **~5.6×** vs `traverse` and peak at **~10×** (`clone · small`), with **~5.7× less
  heap per op** on average (up to **~11×** on `forEach · wide`). The **`neotraverse/legacy`** drop-in averages **~3×**
  speed and **~2×** less allocation across core walks.
- **`clone` peaks at ~10×** on the functional API (`clone · small`). The legacy build and the functional API share the same
  `clone()` / `copy()` source, but the functional bundle inlines a leaner walk, so it often wins by a wide margin
  on smaller shapes while wide flat objects stay closer (~3×).
- The **`get` / `has` / `set`** path helpers are micro-ops (20M+ ops/s); the functional `neotraverse` API and the
  `neotraverse/legacy` drop-in are both within noise of `traverse`. The legacy class stores its state in plain
  instance fields (not `#private`, which would downlevel to WeakMaps at ES2015), so it stays native-fast here too.
- **Memory** figures are an approximate bytes-allocated-per-op signal (median of GC-bracketed samples). JS memory
  measurement is noisy, treat them as ballpark, like the throughput margins of error (`rme`) in the JSON.

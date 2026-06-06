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
**modern ≈ {{ results.summary['neotraverse modern'] }}×**, **legacy ≈ {{ results.summary['neotraverse legacy'] }}×**.

</blockquote>

These numbers come from [`packages/neotraverse/bench/run.ts`](https://github.com/PuruVJ/neotraverse/blob/main/packages/neotraverse/bench/run.ts)
(powered by [tinybench](https://github.com/tinylibs/tinybench)) and are imported directly from the committed
`bench/results.json`. Reproduce locally with `pnpm bench`.

<small>Generated {{ date }} · Node {{ results.runtime.node }} · neotraverse {{ results.versions.neotraverse }} vs traverse {{ results.versions.traverse }}</small>

These are **runtime** benchmarks.

## Bundle size (tree-shaken, brotli)

`neotraverse/modern` is **utility-first** (`sideEffects: false`): your bundler drops unused exports.

| Scenario | Brotli (approx.) |
|----------|------------------|
| One walk terminal (`forEach`, `map`, `find`, …) | **~{{ brotli.walkTerminalMin }} KB** |
| Path helpers only (`get` / `has` / `set`) | **~{{ brotli.pathOnlyMin }} KB** |
| All functions except deprecated `Traverse` | **~{{ brotli.allFunctionsMax }} KB** |

**Range: {{ bundleSizes.summary.rangeLabel }}** — floor ≈ single traversal, ceiling ≈ full toolkit.

Source: [`bench/bundle-sizes.json`](https://github.com/PuruVJ/neotraverse/blob/main/packages/neotraverse/bench/bundle-sizes.json) (`pnpm bundle-size` in `packages/neotraverse`). For a third-party **`traverse` vs neotraverse** comparison, see
<a :href="compareUrl" target="_blank" rel="noreferrer">bundle-roast ↗</a>.

<BenchChart />

## Notes

- **Traversal operations** (`forEach`, `map`, `clone`, `reduce`, `paths`, `nodes`) are ~5–7× faster than
  `traverse` on the **modern** build (which also allocates 3–5× less per op) and ~2.7–3.3× on **legacy**.
- **`clone` legacy vs modern is a tie.** Both builds compile from the *same* `clone()` / `copy()` source, so for
  cloning they're equal within measurement noise — the per-run winner just flips. Treat any ~1–2% gap there as
  jitter, not a real difference.
- The **`get` / `has` / `set`** path helpers are fastest on the **modern** build. The **legacy** build is slower
  for these because it targets ES2015, which downlevels the class's private `#fields` to WeakMaps. For
  path-heavy hot code, prefer `neotraverse/modern`.
- **Memory** figures are an approximate bytes-allocated-per-op signal (median of GC-bracketed samples). JS memory
  measurement is noisy — treat them as ballpark, like the throughput margins of error (`rme`) in the JSON.

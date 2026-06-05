/**
 * Benchmarks the original `traverse` package against the two shipped
 * neotraverse builds — legacy (ES2015 CJS, the `traverse`-compatible API) and
 * modern (`new Traverse`) — across a matrix of operations × dataset shapes.
 *
 * It runs against the BUILT artifacts in `dist/` (so `pnpm bench` builds first),
 * which is why the legacy build can differ from modern: ES2015 downlevels the
 * private `#fields` to WeakMaps.
 *
 * Writes machine-readable results to `bench/results.json` (importable for docs
 * rendering) and prints a summary.
 */
import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Bench } from 'tinybench';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// The three contenders — exactly what npm consumers get.
const traverseOrig = require('traverse'); // original `traverse`
const traverseLegacy = require('../dist/legacy/legacy.cjs'); // neotraverse legacy (ES2015 CJS)
const { Traverse } = await import('../dist/modern/modern.js'); // neotraverse modern (ES2022 ESM)

// ---------------------------------------------------------------------------
// datasets — a spread of realistic shapes
// ---------------------------------------------------------------------------
const build_wide = (n: number) => {
	const o: Record<string, unknown> = {};
	for (let i = 0; i < n; i++) o['k' + i] = i % 3 === 0 ? `v${i}` : i;
	return o;
};

const build_deep = (n: number) => {
	const root: any = {};
	let cur = root;
	for (let i = 0; i < n; i++) cur = cur.child = { i, label: 'node' + i };
	return root;
};

const build_array = (n: number) =>
	Array.from({ length: n }, (_, i) => ({
		id: i,
		name: `item-${i}`,
		active: i % 2 === 0,
		tags: [i, i + 1],
	}));

const realistic = {
	id: 'u_123',
	name: 'Ada',
	roles: ['admin', 'user'],
	profile: {
		age: 41,
		address: { city: 'London', geo: { lat: 51.5, lng: -0.12 } },
		prefs: { theme: 'dark', langs: ['en', 'fr'] },
	},
	posts: Array.from({ length: 8 }, (_, i) => ({
		id: i,
		title: `Post ${i}`,
		likes: i * 3,
		meta: { pinned: i === 0, tags: ['a', 'b'] },
	})),
};

const datasets: Record<string, { description: string; value: any }> = {
	small: { description: '{ a, b, c:[…] } — the canonical example', value: { a: 1, b: 2, c: [3, 4] } },
	wide: { description: 'flat object with 64 keys', value: build_wide(64) },
	deep: { description: '32-level deeply nested object', value: build_deep(32) },
	array: { description: 'array of 256 small objects', value: build_array(256) },
	json: { description: 'realistic nested API response', value: realistic },
};

// sink prevents the optimizer from eliminating benchmarked work
let sink = 0;

type Contender = 'traverse' | 'neotraverse legacy' | 'neotraverse modern';
type Factory = (d: any) => () => void;

// `traverse` and the legacy build share the classic this-bound API.
const operations: Record<string, Record<Contender, Factory>> = {
	forEach: {
		traverse: (d) => () => traverseOrig(d).forEach(function (this: any, n: any) { if (typeof n === 'number') sink += n; }),
		'neotraverse legacy': (d) => () => traverseLegacy(d).forEach(function (this: any, n: any) { if (typeof n === 'number') sink += n; }),
		'neotraverse modern': (d) => () => new Traverse(d).forEach((_c: any, n: any) => { if (typeof n === 'number') sink += n; }),
	},
	map: {
		traverse: (d) => () => traverseOrig(d).map(function (this: any, n: any) {
			if (typeof n === 'number') this.update(n + 1);
			else if (typeof n === 'string') this.update(n.toUpperCase());
		}),
		'neotraverse legacy': (d) => () => traverseLegacy(d).map(function (this: any, n: any) {
			if (typeof n === 'number') this.update(n + 1);
			else if (typeof n === 'string') this.update(n.toUpperCase());
		}),
		'neotraverse modern': (d) => () => new Traverse(d).map((c: any, n: any) => {
			if (typeof n === 'number') c.update(n + 1);
			else if (typeof n === 'string') c.update(n.toUpperCase());
		}),
	},
	clone: {
		traverse: (d) => () => { sink += traverseOrig(d).clone() ? 1 : 0; },
		'neotraverse legacy': (d) => () => { sink += traverseLegacy(d).clone() ? 1 : 0; },
		'neotraverse modern': (d) => () => { sink += new Traverse(d).clone() ? 1 : 0; },
	},
	reduce: {
		traverse: (d) => () => { sink += traverseOrig(d).reduce(function (this: any, acc: any[], n: any) { if (this.isLeaf) acc.push(n); return acc; }, []).length; },
		'neotraverse legacy': (d) => () => { sink += traverseLegacy(d).reduce(function (this: any, acc: any[], n: any) { if (this.isLeaf) acc.push(n); return acc; }, []).length; },
		'neotraverse modern': (d) => () => { sink += new Traverse(d).reduce((c: any, acc: any[], n: any) => { if (c.isLeaf) acc.push(n); return acc; }, []).length; },
	},
	paths: {
		traverse: (d) => () => { sink += traverseOrig(d).paths().length; },
		'neotraverse legacy': (d) => () => { sink += traverseLegacy(d).paths().length; },
		'neotraverse modern': (d) => () => { sink += new Traverse(d).paths().length; },
	},
	nodes: {
		traverse: (d) => () => { sink += traverseOrig(d).nodes().length; },
		'neotraverse legacy': (d) => () => { sink += traverseLegacy(d).nodes().length; },
		'neotraverse modern': (d) => () => { sink += new Traverse(d).nodes().length; },
	},
};

// path-style operations, exercised on the realistic dataset with a deep path
const DEEP_PATH = ['profile', 'address', 'geo', 'lat'];
const path_operations: Record<string, Record<Contender, Factory>> = {
	get: {
		traverse: (d) => () => { sink += traverseOrig(d).get(DEEP_PATH); },
		'neotraverse legacy': (d) => () => { sink += traverseLegacy(d).get(DEEP_PATH); },
		'neotraverse modern': (d) => () => { sink += new Traverse(d).get(DEEP_PATH); },
	},
	has: {
		traverse: (d) => () => { sink += traverseOrig(d).has(DEEP_PATH) ? 1 : 0; },
		'neotraverse legacy': (d) => () => { sink += traverseLegacy(d).has(DEEP_PATH) ? 1 : 0; },
		'neotraverse modern': (d) => () => { sink += new Traverse(d).has(DEEP_PATH) ? 1 : 0; },
	},
	set: {
		traverse: (d) => () => { sink += traverseOrig(d).set(DEEP_PATH, 1); },
		'neotraverse legacy': (d) => () => { sink += traverseLegacy(d).set(DEEP_PATH, 1); },
		'neotraverse modern': (d) => () => { sink += new Traverse(d).set(DEEP_PATH, 1); },
	},
};

const CONTENDERS: Contender[] = ['traverse', 'neotraverse legacy', 'neotraverse modern'];

const hasGc = typeof (globalThis as any).gc === 'function';

// Approximate bytes allocated per op (median of samples). Requires --expose-gc
// (the `bench` script sets it); returns null otherwise. Memory in JS is noisy —
// treat this as a rough allocation signal, not an exact figure.
function measure_memory(fn: () => void): number | null {
	if (!hasGc) return null;
	const gc = (globalThis as any).gc as () => void;
	for (let i = 0; i < 30; i++) fn(); // warm
	gc();
	const h0 = process.memoryUsage().heapUsed;
	for (let i = 0; i < 200; i++) fn();
	const per = Math.max(1, (process.memoryUsage().heapUsed - h0) / 200);
	const N = Math.min(20000, Math.max(80, Math.round((8 * 1024 * 1024) / per)));
	const samples: number[] = [];
	for (let s = 0; s < 5; s++) {
		gc();
		const before = process.memoryUsage().heapUsed;
		for (let i = 0; i < N; i++) fn();
		samples.push((process.memoryUsage().heapUsed - before) / N);
	}
	gc();
	samples.sort((a, b) => a - b);
	return Math.max(0, Math.round(samples[2]));
}

async function run_suite(operation: string, dataset: string, factories: Record<Contender, Factory>) {
	const d = datasets[dataset].value;
	const bench = new Bench({ name: `${operation} · ${dataset}`, time: 250, warmupTime: 50 });
	for (const c of CONTENDERS) bench.add(c, factories[c](d));
	await bench.run();

	const mem: Record<string, number | null> = {};
	for (const c of CONTENDERS) mem[c] = measure_memory(factories[c](d));

	const results = bench.tasks.map((t) => {
		const r = t.result!;
		return {
			name: t.name as Contender,
			opsPerSec: Math.round(r.throughput.mean),
			meanMs: r.latency.mean,
			rme: +r.latency.rme.toFixed(2),
			samples: r.latency.samplesCount,
			bytesPerOp: mem[t.name as Contender],
		};
	});

	const fastest = results.reduce((a, b) => (b.opsPerSec > a.opsPerSec ? b : a));
	const baseline = results.find((r) => r.name === 'traverse')!;
	const speedupVsTraverse = Object.fromEntries(
		results.map((r) => [r.name, +(r.opsPerSec / baseline.opsPerSec).toFixed(2)]),
	);

	const fmt = (n: number) => n.toLocaleString('en-US');
	console.log(`\n${operation} · ${dataset}  (${datasets[dataset].description})`);
	for (const r of results) {
		const tag = r.name === fastest.name ? ' ⭐' : '';
		const m = r.bytesPerOp != null ? `  ${fmt(r.bytesPerOp)} B/op` : '';
		console.log(
			`  ${r.name.padEnd(20)} ${fmt(r.opsPerSec).padStart(12)} ops/s  ±${r.rme}%  (${speedupVsTraverse[r.name]}× vs traverse)${m}${tag}`,
		);
	}

	return { operation, dataset, label: `${operation} · ${dataset}`, description: datasets[dataset].description, results, fastest: fastest.name, baseline: 'traverse', speedupVsTraverse };
}

async function main() {
	console.log('traverse  vs  neotraverse legacy  vs  neotraverse modern\n' + '='.repeat(56));
	const suites: any[] = [];

	for (const [operation, factories] of Object.entries(operations)) {
		for (const dataset of Object.keys(datasets)) {
			suites.push(await run_suite(operation, dataset, factories));
		}
	}
	for (const [operation, factories] of Object.entries(path_operations)) {
		suites.push(await run_suite(operation, 'json', factories));
	}

	// overall: geometric-mean speedup of each neotraverse build vs traverse
	const geomean = (xs: number[]) => Math.exp(xs.reduce((a, b) => a + Math.log(b), 0) / xs.length);
	const summary = {
		'neotraverse legacy': +geomean(suites.map((s) => s.speedupVsTraverse['neotraverse legacy'])).toFixed(2),
		'neotraverse modern': +geomean(suites.map((s) => s.speedupVsTraverse['neotraverse modern'])).toFixed(2),
	};

	const output = {
		generatedAt: new Date().toISOString(),
		runtime: { node: process.version, v8: process.versions.v8 },
		versions: {
			neotraverse: require('../package.json').version,
			traverse: require('traverse/package.json').version,
		},
		contenders: CONTENDERS,
		summary: { metric: 'geometric-mean speedup vs traverse', ...summary },
		suites,
	};

	await writeFile(join(here, 'results.json'), JSON.stringify(output, null, 2) + '\n');
	console.log(`\n${'='.repeat(56)}`);
	console.log('Overall (geometric mean vs traverse):');
	console.log(`  neotraverse legacy  ${summary['neotraverse legacy']}×`);
	console.log(`  neotraverse modern  ${summary['neotraverse modern']}×`);
	console.log(`\nWrote ${join('bench', 'results.json')}  ·  sink=${sink}`);
}

main();

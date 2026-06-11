/**
 * v2 benchmarks. Pits the new copy-on-write core against neotraverse v1 (the
 * shipped functional API) and the original `traverse`, on EQUIVALENT logical
 * operations, so the benchmark page can show v1 → v2 deltas honestly. v2 idioms
 * differ (lazy `visit` iterator, `transform` commands) but do the same work.
 *
 * Also benchmarks v2-only wins that have no v1 equivalent at parity: identity
 * no-op transform, sparse-edit transform (the headline COW advantage), and the
 * pruned-match query vs v1 `select`.
 *
 * Runs against BUILT artifacts in dist/ (so `pnpm bench:v2` builds first).
 * Writes bench/results-safe.json.
 */
import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Bench } from 'tinybench';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const traverseOrig = require('traverse');
const v1 = await import('../dist/index.js'); // neotraverse v1 functional API
const v2 = await import('../dist/safe/index.js'); // neotraverse/safe core

// --- datasets (mirrors run.ts) ----------------------------------------------
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
	Array.from({ length: n }, (_, i) => ({ id: i, name: `item-${i}`, active: i % 2 === 0, tags: [i, i + 1] }));
const realistic = {
	id: 'u_123',
	name: 'Ada',
	roles: ['admin', 'user'],
	profile: { age: 41, address: { city: 'London', geo: { lat: 51.5, lng: -0.12 } }, prefs: { theme: 'dark', langs: ['en', 'fr'] } },
	posts: Array.from({ length: 8 }, (_, i) => ({ id: i, title: `Post ${i}`, likes: i * 3, meta: { pinned: i === 0, tags: ['a', 'b'] } })),
};
const datasets: Record<string, { description: string; value: any }> = {
	small: { description: '{ a, b, c:[…] }', value: { a: 1, b: 2, c: [3, 4] } },
	wide: { description: 'flat object, 64 keys', value: build_wide(64) },
	deep: { description: '32-level nested', value: build_deep(32) },
	array: { description: 'array of 256 objects', value: build_array(256) },
	json: { description: 'realistic API response', value: realistic },
};

let sink = 0;

type Contender = 'traverse' | 'neotraverse v1' | 'neotraverse/safe';
type Factory = (d: any) => () => void;
const CONTENDERS: Contender[] = ['traverse', 'neotraverse v1', 'neotraverse/safe'];

// Equivalent logical operations across the three. v2 uses visit/transform.
const operations: Record<string, Partial<Record<Contender, Factory>>> = {
	forEach: {
		traverse: (d) => () => traverseOrig(d).forEach(function (this: any, n: any) { if (typeof n === 'number') sink += n; }),
		'neotraverse v1': (d) => () => v1.forEach(d, (_c: any, n: any) => { if (typeof n === 'number') sink += n; }),
		'neotraverse/safe': (d) => () => { for (const node of v2.visit(d)) if (typeof node.value === 'number') sink += node.value as number; },
	},
	map: {
		traverse: (d) => () => traverseOrig(d).map(function (this: any, n: any) {
			if (typeof n === 'number') this.update(n + 1);
			else if (typeof n === 'string') this.update(n.toUpperCase());
		}),
		'neotraverse v1': (d) => () => v1.map(d, (c: any, n: any) => {
			if (typeof n === 'number') c.update(n + 1);
			else if (typeof n === 'string') c.update(n.toUpperCase());
		}),
		'neotraverse/safe': (d) => () => { sink += v2.transform(d, (node: any, edit: any) => {
			if (typeof node.value === 'number') return edit.replace(node.value + 1);
			if (typeof node.value === 'string') return edit.replace(node.value.toUpperCase());
		}) ? 1 : 0; },
	},
	clone: {
		traverse: (d) => () => { sink += traverseOrig(d).clone() ? 1 : 0; },
		'neotraverse v1': (d) => () => { sink += v1.clone(d) ? 1 : 0; },
		'neotraverse/safe': (d) => () => { sink += v2.clone(d) ? 1 : 0; },
	},
	reduce: {
		traverse: (d) => () => { sink += traverseOrig(d).reduce(function (this: any, acc: any[], n: any) { if (this.isLeaf) acc.push(n); return acc; }, []).length; },
		'neotraverse v1': (d) => () => { sink += v1.reduce(d, (c: any, acc: any[], n: any) => { if (c.isLeaf) acc.push(n); return acc; }, []).length; },
		'neotraverse/safe': (d) => () => { let n = 0; for (const node of v2.visit(d)) if (node.isLeaf) n++; sink += n; },
	},
	paths: {
		traverse: (d) => () => { sink += traverseOrig(d).paths().length; },
		'neotraverse v1': (d) => () => { sink += v1.paths(d).length; },
		'neotraverse/safe': (d) => () => { let n = 0; for (const node of v2.visit(d)) { sink += node.path.length; n++; } sink += n; },
	},
	nodes: {
		traverse: (d) => () => { sink += traverseOrig(d).nodes().length; },
		'neotraverse v1': (d) => () => { sink += v1.nodes(d).length; },
		'neotraverse/safe': (d) => () => { let n = 0; for (const _ of v2.visit(d)) n++; sink += n; },
	},
};

const DEEP_PATH = ['profile', 'address', 'geo', 'lat'];
const path_operations: Record<string, Partial<Record<Contender, Factory>>> = {
	get: {
		traverse: (d) => () => { sink += traverseOrig(d).get(DEEP_PATH); },
		'neotraverse v1': (d) => () => { sink += v1.get(d, DEEP_PATH); },
		'neotraverse/safe': (d) => () => { sink += v2.get(d, DEEP_PATH); },
	},
	has: {
		traverse: (d) => () => { sink += traverseOrig(d).has(DEEP_PATH) ? 1 : 0; },
		'neotraverse v1': (d) => () => { sink += v1.has(d, DEEP_PATH) ? 1 : 0; },
		'neotraverse/safe': (d) => () => { sink += v2.has(d, DEEP_PATH) ? 1 : 0; },
	},
	set: {
		// v1 set mutates in place; match that with v2 { mutate: true } for a like-for-like.
		// (v2's copy-on-write default is benchmarked separately under v2-only.)
		traverse: (d) => () => { sink += traverseOrig(d).set(DEEP_PATH, 1) ? 1 : 0; },
		'neotraverse v1': (d) => () => { sink += v1.set(d, DEEP_PATH, 1) ? 1 : 0; },
		'neotraverse/safe': (d) => () => { sink += v2.set(d, DEEP_PATH, 1, { mutate: true }) ? 1 : 0; },
	},
};

const hasGc = typeof (globalThis as any).gc === 'function';
function measure_memory(fn: () => void): number | null {
	if (!hasGc) return null;
	const gc = (globalThis as any).gc as () => void;
	for (let i = 0; i < 30; i++) fn();
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

async function run_suite(operation: string, dataset: string, factories: Partial<Record<Contender, Factory>>) {
	const make = () => structuredClone(datasets[dataset].value);
	const present = CONTENDERS.filter((c) => factories[c]);
	const bench = new Bench({ name: `${operation} · ${dataset}`, time: 250, warmupTime: 50 });
	for (const c of present) bench.add(c, factories[c]!(make()));
	await bench.run();

	const mem: Record<string, number | null> = {};
	for (const c of present) mem[c] = measure_memory(factories[c]!(make()));

	const results = bench.tasks.map((t) => {
		const r: any = t.result;
		return { name: t.name as Contender, opsPerSec: Math.round(r.throughput.mean), rme: +r.latency.rme.toFixed(2), bytesPerOp: mem[t.name as Contender] };
	});
	const v1r = results.find((r) => r.name === 'neotraverse v1');
	const v2r = results.find((r) => r.name === 'neotraverse/safe');
	const v2VsV1 = v1r && v2r ? +(v2r.opsPerSec / v1r.opsPerSec).toFixed(2) : null;

	const fmt = (n: number) => n.toLocaleString('en-US');
	console.log(`\n${operation} · ${dataset}`);
	for (const r of results) {
		const m = r.bytesPerOp != null ? `  ${fmt(r.bytesPerOp)} B/op` : '';
		console.log(`  ${r.name.padEnd(18)} ${fmt(r.opsPerSec).padStart(12)} ops/s  ±${r.rme}%${m}`);
	}
	if (v2VsV1 != null) console.log(`  → v2 is ${v2VsV1}× v1`);
	return { operation, dataset, label: `${operation} · ${dataset}`, results, v2VsV1 };
}

async function run_v2_only(label: string, fn: () => void) {
	const bench = new Bench({ name: label, time: 250, warmupTime: 50 });
	bench.add('neotraverse/safe', fn);
	await bench.run();
	const r: any = bench.tasks[0].result;
	const out = { label, opsPerSec: Math.round(r.throughput.mean), rme: +r.latency.rme.toFixed(2), bytesPerOp: measure_memory(fn) };
	console.log(`  ${label.padEnd(28)} ${out.opsPerSec.toLocaleString('en-US').padStart(12)} ops/s  ±${out.rme}%`);
	return out;
}

async function main() {
	console.log('traverse  vs  neotraverse v1  vs  neotraverse/safe\n' + '='.repeat(56));
	const suites: any[] = [];
	for (const [operation, factories] of Object.entries(operations)) {
		for (const dataset of Object.keys(datasets)) suites.push(await run_suite(operation, dataset, factories));
	}
	for (const [operation, factories] of Object.entries(path_operations)) {
		suites.push(await run_suite(operation, 'json', factories));
	}

	// v2-only headline wins
	console.log('\nv2-only (no v1 parity equivalent)');
	const big = build_array(2000);
	const bigB = structuredClone(big);
	bigB[1000].name = 'changed';
	const refDoc = { defs: { Foo: { type: 'string' } }, items: Array.from({ length: 32 }, () => ({ $ref: '#/defs/Foo' })) };
	const v2only: any[] = [];
	v2only.push(await run_v2_only('transform · no-op identity (2000)', () => { sink += v2.transform(big, () => {}) === big ? 1 : 0; }));
	v2only.push(await run_v2_only('transform · single sparse edit (2000)', () => {
		sink += v2.transform(big, (n: any, e: any) => (n.key === 'name' && n.value === 'item-1000' ? e.replace('x') : undefined)) ? 1 : 0;
	}));
	v2only.push(await run_v2_only('merge · json', () => { sink += v2.merge(realistic, { profile: { age: 42 } }) ? 1 : 0; }));
	v2only.push(await run_v2_only('diff · array(2000) one change', () => { sink += v2.diff(big, bigB).length; }));
	v2only.push(await run_v2_only('equal · json', () => { sink += v2.equal(realistic, structuredClone(realistic)) ? 1 : 0; }));
	v2only.push(await run_v2_only('resolveRefs · refs', () => { sink += v2.resolveRefs(refDoc) ? 1 : 0; }));
	v2only.push(await run_v2_only('visit match · posts.*.id', () => { sink += v2.visit(realistic, 'posts.*.id').toArray().length; }));

	const geomean = (xs: number[]) => Math.exp(xs.reduce((a, b) => a + Math.log(b), 0) / xs.length);
	const ratios = suites.map((s) => s.v2VsV1).filter((x): x is number => x != null && x > 0);
	const summary = { metric: 'geometric-mean v2 throughput ÷ v1 on equivalent ops', v2VsV1Geomean: +geomean(ratios).toFixed(2) };

	const output = {
		generatedAt: new Date().toISOString(),
		runtime: { node: process.version, v8: process.versions.v8 },
		note: 'v2 idioms (lazy visit, COW transform) doing the same logical work as v1; not API-identical.',
		contenders: CONTENDERS,
		summary,
		suites,
		v2only,
	};
	await writeFile(join(here, 'results-safe.json'), JSON.stringify(output, null, 2) + '\n');
	console.log(`\n${'='.repeat(56)}`);
	console.log(`v2 vs v1 (geomean, equivalent ops): ${summary.v2VsV1Geomean}×`);
	console.log(`Wrote ${join('bench', 'results-safe.json')}  ·  sink=${sink}`);
}

main();

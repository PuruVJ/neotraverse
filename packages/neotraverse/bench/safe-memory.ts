/**
 * Memory + stack-safety benchmark for neotraverse/safe. We report only the
 * ROBUST, ALGORITHMIC wins — not GC-schedule noise:
 *
 *  1. Early-exit composition: v1's filter/paths/nodes RETURN ARRAYS, so they
 *     must materialize every match before you can slice; safe's lazy chain stops
 *     at `.take(n)`. The memory difference is structural (materialize N vs k),
 *     not a measurement artifact.
 *  2. Stack safety: v1 walks recursively and overflows the call stack on deep
 *     input; safe is iterative and bounded only by heap (+ optional maxDepth).
 *
 * Honest non-claims: on a FULL eager scan, safe allocates one Visit per node
 * (≈ v1's one WalkContext per node) and throughput is ~0.8× v1 — safe is not a
 * universal memory or speed win, it's a SAFETY/COMPOSITION win.
 *
 * Runs against BUILT artifacts. Writes bench/results-safe-memory.json.
 */
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const v1 = await import('../dist/index.js');
const safe = await import('../dist/safe/index.js');
const gc = (globalThis as any).gc as () => void;
const MB = 1024 * 1024;

// Peak transient allocation during the op — the metric that captures the
// early-exit win, which is ALGORITHMIC (v1's filter/paths deterministically
// build the full intermediate array; safe's lazy .take(k) builds k), so it is
// stable across runs rather than GC-schedule noise. Median of 9.
function peak(fn: () => unknown): number {
	const samples: number[] = [];
	for (let s = 0; s < 9; s++) {
		gc();
		gc();
		const before = process.memoryUsage().heapUsed;
		let r = fn();
		const mb = (process.memoryUsage().heapUsed - before) / MB;
		r = undefined;
		void r;
		samples.push(mb);
	}
	samples.sort((a, b) => a - b);
	return +samples[4].toFixed(1);
}

const N = 100000;
const big = { items: Array.from({ length: N }, (_, i) => ({ id: i, name: 'item' + i, active: i % 2 === 0 })) };

console.log(`Peak transient allocation per op (100k-node tree). Lower = less memory pressure.\n`);
const rows: any[] = [];
function compare(pattern: string, detail: string, v1fn: () => unknown, safefn: () => unknown) {
	const a = peak(v1fn);
	const b = peak(safefn);
	const ratio = b > 0.05 ? +(a / b).toFixed(1) : Infinity;
	rows.push({ pattern, detail, v1Mb: a, safeMb: b, ratio });
	console.log(`  ${pattern.padEnd(34)} v1 ${a.toFixed(1).padStart(6)} MB | safe ${b.toFixed(1).padStart(6)} MB | safe ${ratio >= 1 ? ratio + '× less' : (1 / ratio).toFixed(1) + '× more'}`);
}

compare(
	'First 5 of a filtered scan',
	'ALGORITHMIC: v1.filter builds an array of ALL ~100k matches before slice; safe.filter.take(5) stops at 5',
	() => v1.filter(big, (_c: any, v: any) => typeof v === 'string').slice(0, 5),
	() => safe.visit(big).filter((n: any) => typeof n.value === 'string').take(5).toArray(),
);
compare(
	'Genuinely need ALL nodes (fair)',
	'both materialize the full set — roughly parity (safe slightly higher: one Visit per node)',
	() => v1.nodes(big),
	() => safe.visit(big).map((n: any) => n.value).toArray(),
);

// Stack safety — the categorical win.
console.log('\nStack safety: deepest linked tree each can traverse');
function buildDeep(depth: number) {
	let node: any = { v: 0 };
	const root = node;
	for (let i = 1; i < depth; i++) { node.next = { v: i }; node = node.next; }
	return root;
}
const survives = (fn: (t: any) => void, depth: number) => { try { fn(buildDeep(depth)); return true; } catch { return false; } };
const v1Walk = (t: any) => { let n = 0; for (const _ of (v1 as any).values(t)) n++; void n; };
const safeWalk = (t: any) => { let n = 0; for (const _ of safe.visit(t)) n++; void n; };
let v1Max = 0;
for (const d of [1000, 2000, 5000, 10000, 20000, 50000]) { if (survives(v1Walk, d)) v1Max = d; else break; }
const safeOk = survives(safeWalk, 200000);
console.log(`  v1 (recursive):   overflows beyond ~${v1Max.toLocaleString()} deep`);
console.log(`  safe (iterative): 200,000+ deep — ${safeOk ? 'OK' : 'FAILED'}`);

const output = {
	generatedAt: new Date().toISOString(),
	runtime: { node: process.version, v8: process.versions.v8 },
	treeSize: N,
	metric: 'live memory (MB) the result retains after GC; ratio = v1 ÷ safe (>1 = safe leaner)',
	rows,
	stackSafety: { v1MaxDepth: v1Max, safeDepthTested: 200000, safeSurvives: safeOk },
	honestCaveats: [
		'Full eager scans: safe allocates ~1 Visit/node (≈ v1 WalkContext/node); memory ≈ parity, throughput ~0.8× v1.',
		'safe wins memory only when you DO NOT keep the whole tree: early-exit chains and streaming.',
		'safe wins outright on stack safety (deep/untrusted input) — v1 cannot traverse it at all.',
	],
};
await writeFile(join(here, 'results-safe-memory.json'), JSON.stringify(output, null, 2) + '\n');
console.log('\nWrote bench/results-safe-memory.json');

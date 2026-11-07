/**
 * Markdown summary of one Heisenbench report: the steps of every case, the function and line
 * that do the most work in it, and its growth class when `bench:growth` ran. The PR workflow
 * puts it under the diff, so the comment has the head's own numbers even when nothing changed.
 *
 *   node bench/summary.ts head.json [base.json] > summary.md
 *
 * With the base report too, it first says how many cases ran on both sides, and which bench
 * files did not load on either side (the diff lists their cases as new or removed).
 */
import { readFileSync } from 'node:fs';

interface Line {
	line: number;
	steps: number;
}
interface Fn {
	id: string;
	module: string;
	self_steps: number;
	lines: Line[];
}
interface Case {
	name: string;
	error: string | null;
	totals: { steps: number; allocations: number; bytes: number };
	functions: Fn[];
}
interface Report {
	cases: Case[];
	load_errors?: { file: string; error: string }[];
	growth?: { cases: { name: string; class: string | null; exponent: number }[] };
}

const read = (path: string): Report => JSON.parse(readFileSync(path, 'utf8'));
const report = read(process.argv[2]);
const base = process.argv[3] ? read(process.argv[3]) : null;
const growth = new Map((report.growth?.cases ?? []).map((g) => [g.name, g]));
const n = (x: number) => Math.round(x).toLocaleString('en-US');
const pct = (part: number, whole: number) =>
	whole > 0 ? `${Math.round((part / whole) * 100)}%` : '';
const cell = (s: string) => s.replace(/\|/g, '\\|');

function heaviest(c: Case) {
	let fn: Fn | null = null;
	let line: { where: string; steps: number } | null = null;
	for (const f of c.functions) {
		if (!fn || f.self_steps > fn.self_steps) fn = f;
		for (const l of f.lines) {
			if (!line || l.steps > line.steps) line = { where: `${f.module}:${l.line}`, steps: l.steps };
		}
	}
	return { fn, line };
}

const rows = report.cases
	.filter((c) => !c.error)
	.map((c) => {
		const { fn, line } = heaviest(c);
		const g = growth.get(c.name);
		return [
			cell(c.name),
			n(c.totals.steps),
			n(c.totals.allocations),
			fn ? `\`${fn.id}\` ${pct(fn.self_steps, c.totals.steps)}` : '',
			line ? `\`${line.where}\` ${pct(line.steps, c.totals.steps)}` : '',
			g?.class ? `${g.class} (${g.exponent})` : '',
		];
	});

const failed = report.cases.filter((c) => c.error);
const by_steps = [...rows].sort(
	(a, b) => Number(b[1].replace(/,/g, '')) - Number(a[1].replace(/,/g, '')),
);
const header =
	'| Case | Steps | Allocations | Heaviest function (share of steps) | Heaviest line | Growth |\n' +
	'| --- | ---: | ---: | --- | --- | --- |\n';
const table = (list: string[][]) => header + list.map((r) => `| ${r.join(' | ')} |`).join('\n');

const out: string[] = [];
if (base) {
	const on_base = new Set(base.cases.filter((c) => !c.error).map((c) => c.name));
	const both = report.cases.filter((c) => !c.error && on_base.has(c.name)).length;
	out.push(`**${both}** cases ran on both sides and are compared above.`);
	for (const [side, r] of [
		['base', base],
		['PR', report],
	] as const) {
		for (const e of r.load_errors ?? []) {
			out.push(
				`- \`${e.file}\` did not load on the ${side}, so its cases are not compared: ${cell(e.error)}`,
			);
		}
	}
	out.push('');
}
out.push(`### This PR's counts`);
out.push('');
out.push(
	`${rows.length} cases counted${failed.length ? `, ${failed.length} failed` : ''}. ` +
		'Steps are exact counts of the work each case does, the same on every run.' +
		(growth.size ? ' Growth is the curve from `bench:growth`.' : ''),
);
out.push('');
out.push('The ten heaviest cases:');
out.push('');
out.push(table(by_steps.slice(0, 10)));
out.push('');
const super_linear = rows.filter((r) => /quadratic|cubic|exponential/.test(r[5]));
if (super_linear.length) {
	out.push(`**Grows faster than linear** (${super_linear.length}):`);
	out.push('');
	out.push(table(super_linear));
	out.push('');
}
out.push(`<details><summary>Every case (${rows.length})</summary>`);
out.push('');
out.push(table(rows));
out.push('');
out.push('</details>');
for (const c of failed) out.push(`\n- \`${cell(c.name)}\` failed: ${cell(c.error ?? '')}`);
console.log(out.join('\n'));

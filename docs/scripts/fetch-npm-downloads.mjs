/**
 * Fetch all-time npm download counts (sum of daily stats from registry API).
 * Writes docs/.vitepress/data/npm-downloads.json, run before `vitepress build` or via prebuild.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, '.vitepress/data/npm-downloads.json');
const PACKAGE = 'neotraverse';
const RANGE_START = '2015-01-01';

function todayUtc() {
	return new Date().toISOString().slice(0, 10);
}

/** @param {{ package?: string, outFile?: string, quiet?: boolean }} [opts] */
export async function fetchNpmDownloads(opts = {}) {
	const pkg = opts.package ?? PACKAGE;
	const outFile = opts.outFile ?? OUT;
	const end = todayUtc();
	const url = `https://api.npmjs.org/downloads/range/${RANGE_START}:${end}/${pkg}`;

	const res = await fetch(url);
	if (!res.ok) {
		throw new Error(`npm downloads API ${res.status}: ${await res.text()}`);
	}

	const data = await res.json();
	const total = data.downloads.reduce((sum, row) => sum + row.downloads, 0);

	const report = {
		package: pkg,
		total,
		start: data.start,
		end: data.end,
		days: data.downloads.length,
		measuredAt: new Date().toISOString(),
		source: url,
	};

	mkdirSync(dirname(outFile), { recursive: true });
	writeFileSync(outFile, JSON.stringify(report, null, 2) + '\n');

	if (!opts.quiet) {
		console.log(
			`npm downloads: ${total.toLocaleString('en-US')} (${data.start} → ${data.end}) → ${outFile}`,
		);
	}

	return report;
}

if (process.argv[1]?.endsWith('fetch-npm-downloads.mjs')) {
	fetchNpmDownloads().catch((err) => {
		console.error(err);
		process.exit(1);
	});
}

/**
 * Discover GitHub repos using neotraverse (code search + package.json).
 * Writes neotraverse-users.json only (machine report for maintainer review).
 *
 * Run: GITHUB_TOKEN=… node docs/scripts/discover-neotraverse-users.mjs
 * Optional: --write-used-by  overwrites used-by.json (normally hand-curated)
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '../.vitepress/data');
const OUT = join(DATA_DIR, 'neotraverse-users.json');
const USED_BY_OUT = join(DATA_DIR, 'used-by.json');

/** Also show on homepage when direct dep (package.json / source) but &lt;500★ */
const HOMEPAGE_EXTRA = [
	'loopbackio/loopback-datasource-juggler',
	'feathersjs-ecosystem/feathers-hooks-common',
	'thim81/openapi-format',
	'es-tooling/module-replacements-codemods',
	'mapbox/geojson-extent',
];

const DISPLAY_NAMES = {
	'withastro/astro': 'Astro',
	'renovatebot/renovate': 'Renovate',
	'BuilderIO/mitosis': 'Mitosis',
	'compodoc/compodoc': 'Compodoc',
	'textlint/textlint': 'textlint',
	'swagger-api/swagger-js': 'Swagger JS',
	'dwyl/aws-sdk-mock': 'aws-sdk-mock',
	'postmanlabs/openapi-to-postman': 'openapi-to-postman',
	'apideck-libraries/portman': 'Portman',
	'sverweij/state-machine-cat': 'state-machine-cat',
	'loopbackio/loopback-datasource-juggler': 'LoopBack Juggler',
	'feathersjs-ecosystem/feathers-hooks-common': 'feathers-hooks-common',
	'thim81/openapi-format': 'openapi-format',
	'es-tooling/module-replacements-codemods': 'module-replacements',
	'mapbox/geojson-extent': 'geojson-extent',
};

function displayName(repo) {
	return DISPLAY_NAMES[repo] ?? repo.split('/')[1] ?? repo;
}

const QUERIES = [
	'"neotraverse" in:file filename:package.json',
	'"neotraverse/modern" in:file',
	'from "neotraverse" in:file extension:ts',
	'from "neotraverse" in:file extension:js',
	"require('neotraverse') in:file",
	'"neotraverse" in:file filename:pnpm-lock.yaml',
];

const SKIP_REPO = new Set([
	'PuruVJ/neotraverse',
	'ljharb/js-traverse',
	'DavidWells/stars',
	'wooorm/npm-high-impact',
	'e18e/module-replacements',
	'e18e/awesome-e18e',
	'Buildstarted/linksfordevs',
	'costinEEST/almanacs',
	'lqhuang/awesome',
]);

const SKIP_PATH =
	/(?:^|\/)(node_modules|vendor|dist|build)(\/|$)|node_modules copy|nod_modules|modules\.backup/i;
const LOCK_ONLY = /^(package-lock\.json|pnpm-lock\.yaml|bun\.lockb?|yarn\.lock)$/;

function classifyHit(item) {
	const path = item.path;
	const repo = item.repository.full_name;
	if (SKIP_REPO.has(repo)) return null;
	if (SKIP_PATH.test(path)) return null;

	const base = path.split('/').pop() ?? '';
	const isLock = LOCK_ONLY.test(base);
	const isPkg = /package\.json$/i.test(path);
	const isSource = /\.(t|j)sx?$/.test(path) || /\.mjs$/.test(path) || /\.cjs$/.test(path);

	if (isLock && !isPkg && !isSource) return { repo, path, kind: 'lockfile' };
	if (isPkg) return { repo, path, kind: 'package.json' };
	if (isSource) return { repo, path, kind: 'source' };
	if (/README|CHANGELOG|NOTICE|LICENSE|THIRD-PARTY|\.md$/i.test(path)) return null;
	return { repo, path, kind: 'other' };
}

async function ghSearch(q, page, headers) {
	const url = new URL('https://api.github.com/search/code');
	url.searchParams.set('q', q);
	url.searchParams.set('per_page', '100');
	url.searchParams.set('page', String(page));
	const res = await fetch(url, { headers });
	if (!res.ok) throw new Error(`GitHub ${res.status}: ${await res.text()}`);
	return res.json();
}

async function ghRepo(fullName, headers) {
	const res = await fetch(`https://api.github.com/repos/${fullName}`, { headers });
	if (!res.ok) return null;
	return res.json();
}

function sleep(ms) {
	return new Promise((r) => setTimeout(r, ms));
}

async function runQuery(q, headers, repoMap) {
	let page = 1;
	let total = 0;
	while (page <= 10) {
		const data = await ghSearch(q, page, headers);
		total = data.total_count;
		if (!data.items?.length) break;
		for (const item of data.items) {
			const hit = classifyHit(item);
			if (!hit) continue;
			let entry = repoMap.get(hit.repo);
			if (!entry) {
				entry = {
					repo: hit.repo,
					url: `https://github.com/${hit.repo}`,
					kinds: new Set(),
					paths: [],
					stars: item.repository.stargazers_count ?? null,
				};
				repoMap.set(hit.repo, entry);
			}
			entry.kinds.add(hit.kind);
			if (entry.paths.length < 6) entry.paths.push(hit.path);
		}
		if (data.items.length < 100) break;
		page++;
		await sleep(2200);
	}
	return total;
}

async function main() {
	const tok = process.env.GITHUB_TOKEN ?? '';
	const headers = {
		Accept: 'application/vnd.github+json',
		'X-GitHub-Api-Version': '2022-11-28',
		...(tok ? { Authorization: `Bearer ${tok}` } : {}),
	};

	const repoMap = new Map();
	const queryStats = [];

	for (const q of QUERIES) {
		process.stderr.write(`search: ${q}\n`);
		try {
			const total = await runQuery(q, headers, repoMap);
			queryStats.push({ q, total });
		} catch (err) {
			queryStats.push({ q, error: String(err) });
			if (String(err).includes('403')) break;
		}
		await sleep(2500);
	}

	for (const e of repoMap.values()) {
		if (e.stars != null) continue;
		const repo = await ghRepo(e.repo, headers);
		if (repo) e.stars = repo.stargazers_count;
		await sleep(80);
	}

	const score = (kinds, stars) => {
		let s = stars ?? 0;
		if (kinds.has('package.json')) s += 500;
		if (kinds.has('source')) s += 200;
		if (kinds.has('lockfile')) s += 50;
		return s;
	};

	const repos = [...repoMap.values()]
		.map((e) => {
			const stars = e.stars ?? 0;
			const tier =
				e.kinds.has('package.json') || e.kinds.has('source')
					? stars >= 500
						? 'featured'
						: 'confirmed'
					: 'lockfile-only';
			return {
				repo: e.repo,
				url: e.url,
				stars,
				kinds: [...e.kinds],
				samplePaths: e.paths,
				tier,
			};
		})
		.sort((a, b) => score(new Set(b.kinds), b.stars) - score(new Set(a.kinds), a.stars));

	const featured = repos.filter((r) => r.tier === 'featured');
	const confirmed = repos.filter((r) => r.tier === 'confirmed');
	const lockfileOnly = repos.filter((r) => r.tier === 'lockfile-only');

	const report = {
		generatedAt: new Date().toISOString(),
		method: 'GitHub code search',
		queryStats,
		summary: { totalRepos: repos.length, featured: featured.length, confirmed: confirmed.length },
		featured,
		confirmed,
		lockfileOnly: lockfileOnly.slice(0, 150),
	};

	const homepagePool = [...featured, ...confirmed.filter((r) => HOMEPAGE_EXTRA.includes(r.repo))];
	const seen = new Set();
	const homepage = homepagePool
		.filter((r) => {
			if (seen.has(r.repo)) return false;
			seen.add(r.repo);
			return true;
		})
		.sort((a, b) => b.stars - a.stars)
		.slice(0, 24)
		.map((r) => ({
			name: displayName(r.repo),
			repo: r.repo,
			url: r.url,
			stars: r.stars,
		}));

	const usedBy = {
		generatedAt: report.generatedAt,
		source: 'neotraverse-users.json (GitHub code search)',
		summary: report.summary,
		moreUrl: 'https://github.com/search?q=neotraverse+in%3Afile+filename%3Apackage.json&type=code',
		projects: homepage,
	};

	const writeUsedBy = process.argv.includes('--write-used-by');

	mkdirSync(DATA_DIR, { recursive: true });
	writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n');
	console.log(JSON.stringify(report.summary, null, 2));
	console.log(`wrote ${OUT}`);
	if (writeUsedBy) {
		writeFileSync(USED_BY_OUT, JSON.stringify(usedBy, null, 2) + '\n');
		console.log(`homepage: ${homepage.length} projects → ${USED_BY_OUT}`);
	} else {
		console.log(
			`skipped ${USED_BY_OUT} (hand-curated; pass --write-used-by to overwrite from discovery)`,
		);
	}
	for (const r of featured.slice(0, 30)) console.log(`${r.stars}★ ${r.repo}`);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});

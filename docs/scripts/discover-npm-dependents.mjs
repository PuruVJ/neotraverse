/**
 * Discover npm packages that directly depend on neotraverse.
 * Sources: deps.dev counts, registry verification, GitHub users JSON + package.json fetch.
 * Run: node docs/scripts/discover-npm-dependents.mjs
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, '.vitepress/data/neotraverse-npm-dependents.json');
const USERS_JSON = join(ROOT, '.vitepress/data/neotraverse-users.json');
const PKG_JSON = join(ROOT, '../packages/neotraverse/package.json');

/** GitHub repo → npm package name (monorepos / renamed packages). */
const KNOWN_REPO_NPM = {
	'withastro/astro': 'astro',
	'swagger-api/swagger-js': 'swagger-client',
	'textlint/textlint': '@textlint/markdown-to-ast',
	'compodoc/compodoc': '@compodoc/compodoc',
	'BuilderIO/mitosis': '@builder.io/mitosis',
	'postmanlabs/openapi-to-postman': 'openapi-to-postmanv2',
	'apideck-libraries/portman': '@apideck/portman',
	'thim81/openapi-format': 'openapi-format',
	'loopbackio/loopback-datasource-juggler': 'loopback-datasource-juggler',
	'feathersjs-ecosystem/feathers-hooks-common': 'feathers-hooks-common',
	'dwyl/aws-sdk-mock': 'aws-sdk-mock',
	'sverweij/state-machine-cat': 'state-machine-cat',
	'renovatebot/renovate': 'renovate',
};

/** Extra npm names to verify (not always linked 1:1 in GitHub discovery). */
const SEED_NPM = [
	'astro',
	'swagger-client',
	'@compodoc/compodoc',
	'@textlint/markdown-to-ast',
	'@builder.io/mitosis',
	'openapi-to-postmanv2',
	'@apideck/portman',
	'openapi-format',
	'loopback-datasource-juggler',
	'feathers-hooks-common',
	'aws-sdk-mock',
	'state-machine-cat',
];

const EXCLUDE_NPM = new Set(['neotraverse']);

function sleep(ms) {
	return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url, opts) {
	const res = await fetch(url, opts);
	if (!res.ok) throw new Error(`${url} → ${res.status}`);
	return res.json();
}

async function depsDevDefaultVersion() {
	try {
		const pkg = await fetchJson('https://api.deps.dev/v3alpha/systems/npm/packages/neotraverse');
		const def = pkg.versions?.find((v) => v.isDefault);
		return def?.versionKey?.version ?? pkg.versions?.at(-1)?.versionKey?.version ?? null;
	} catch {
		return null;
	}
}

async function depsDevCounts(version) {
	for (const v of [version, await depsDevDefaultVersion()].filter(Boolean)) {
		const url = `https://api.deps.dev/v3alpha/systems/npm/packages/neotraverse/versions/${v}:dependents`;
		try {
			const data = await fetchJson(url);
			return { ...data, version: v };
		} catch {
			/* try next version */
		}
	}
	return null;
}

async function npmRegistry(name) {
	const url = `https://registry.npmjs.org/${encodeURIComponent(name)}`;
	try {
		return await fetchJson(url);
	} catch {
		return null;
	}
}

function hasNeotraverseDep(meta) {
	if (!meta?.versions) return false;
	const latest = meta['dist-tags']?.latest;
	if (!latest) return false;
	const v = meta.versions[latest];
	if (!v) return false;
	const buckets = [v.dependencies, v.devDependencies, v.optionalDependencies, v.peerDependencies];
	for (const deps of buckets) {
		if (!deps) continue;
		if (deps.neotraverse) return true;
		for (const val of Object.values(deps)) {
			if (typeof val === 'string' && val.includes('neotraverse')) return true;
		}
	}
	return false;
}

async function weeklyDownloads(name) {
	const url = `https://api.npmjs.org/downloads/point/last-week/${encodeURIComponent(name)}`;
	try {
		const data = await fetchJson(url);
		return data.downloads ?? null;
	} catch {
		return null;
	}
}

async function resolveNpmFromGithub(repo, samplePaths) {
	if (KNOWN_REPO_NPM[repo]) return KNOWN_REPO_NPM[repo];

	const pkgPath = samplePaths?.find((p) => /package\.json$/i.test(p));
	if (!pkgPath) return null;

	const branches = ['main', 'master'];
	for (const branch of branches) {
		const url = `https://raw.githubusercontent.com/${repo}/${branch}/${pkgPath}`;
		try {
			const res = await fetch(url);
			if (!res.ok) continue;
			const pkg = await res.json();
			if (pkg?.name && typeof pkg.name === 'string') return pkg.name;
		} catch {
			/* try next branch */
		}
	}
	return null;
}

function loadGithubCandidates() {
	if (!existsSync(USERS_JSON)) return [];
	const data = JSON.parse(readFileSync(USERS_JSON, 'utf-8'));
	const tiers = [...(data.featured ?? []), ...(data.confirmed ?? [])];
	return tiers.filter((r) => r.kinds?.includes('package.json'));
}

/** @param {{ package?: string, outFile?: string, usersFile?: string, quiet?: boolean }} [opts] */
export async function discoverNpmDependents(opts = {}) {
	const outFile = opts.outFile ?? OUT;
	const usersFile = opts.usersFile ?? USERS_JSON;
	const localPkg = JSON.parse(readFileSync(opts.packageJson ?? PKG_JSON, 'utf-8'));
	const version = localPkg.version;

	const candidates = new Set(SEED_NPM);

	if (existsSync(usersFile)) {
		const data = JSON.parse(readFileSync(usersFile, 'utf-8'));
		const tiers = [...(data.featured ?? []), ...(data.confirmed ?? [])];
		for (const row of tiers) {
			if (!row.kinds?.includes('package.json')) continue;
			if (KNOWN_REPO_NPM[row.repo]) {
				candidates.add(KNOWN_REPO_NPM[row.repo]);
				continue;
			}
			const name = await resolveNpmFromGithub(row.repo, row.samplePaths);
			if (name) candidates.add(name);
			await sleep(120);
		}
	}

	const depsDev = await depsDevCounts(version);

	const verified = [];
	const rejected = [];

	for (const name of [...candidates].sort()) {
		if (EXCLUDE_NPM.has(name)) continue;
		const meta = await npmRegistry(name);
		if (!meta) {
			rejected.push({ name, reason: 'not on npm registry' });
			continue;
		}
		if (!hasNeotraverseDep(meta)) {
			rejected.push({ name, reason: 'no direct neotraverse dependency in latest' });
			continue;
		}
		const downloads = await weeklyDownloads(name);
		const repoEntry = Object.entries(KNOWN_REPO_NPM).find(([, npm]) => npm === name);
		verified.push({
			name,
			url: `https://www.npmjs.com/package/${encodeURIComponent(name)}`,
			github: repoEntry ? `https://github.com/${repoEntry[0]}` : meta.repository?.url?.replace(/^git\+/, '').replace(/\.git$/, '') ?? null,
			weeklyDownloads: downloads,
			latestVersion: meta['dist-tags']?.latest ?? null,
		});
		await sleep(200);
	}

	verified.sort((a, b) => (b.weeklyDownloads ?? 0) - (a.weeklyDownloads ?? 0));

	const report = {
		generatedAt: new Date().toISOString(),
		package: 'neotraverse',
		version,
		sources: {
			depsDev: depsDev
				? {
						version: depsDev.version,
						dependentCount: depsDev.dependentCount,
						directDependentCount: depsDev.directDependentCount,
						indirectDependentCount: depsDev.indirectDependentCount,
					}
				: null,
			githubUsersJson: existsSync(usersFile),
			registryVerification: true,
		},
		summary: {
			verifiedDirect: verified.length,
			depsDevDirectCount: depsDev?.directDependentCount ?? null,
			candidatesChecked: candidates.size,
		},
		verified,
		rejected: rejected.slice(0, 80),
	};

	mkdirSync(dirname(outFile), { recursive: true });
	writeFileSync(outFile, JSON.stringify(report, null, 2) + '\n');

	if (!opts.quiet) {
		console.log(JSON.stringify(report.summary, null, 2));
		for (const p of verified.slice(0, 20)) {
			const dl = p.weeklyDownloads != null ? `${p.weeklyDownloads.toLocaleString('en-US')}/wk` : '?';
			console.log(`  ${dl.padStart(12)} ${p.name}`);
		}
	}

	return report;
}

if (process.argv[1]?.endsWith('discover-npm-dependents.mjs')) {
	discoverNpmDependents().catch((err) => {
		console.error(err);
		process.exit(1);
	});
}

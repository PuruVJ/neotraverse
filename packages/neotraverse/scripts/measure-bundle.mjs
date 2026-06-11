import { brotliCompressSync, constants as zlibConstants } from 'node:zlib';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const esbuild = require(join(root, '../../node_modules/.pnpm/esbuild@0.28.0/node_modules/esbuild'));

const modern = join(root, 'src/modern.ts');
const brotliOpts = { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11 } };

const scenarios = {
	get_has_set: `import { get, has, set } from '${modern}'; export { get, has, set };`,
	getPath: `import { getPath } from '${modern}'; export { getPath };`,
	forEach: `import { forEach } from '${modern}'; export { forEach };`,
	size: `import { size } from '${modern}'; export { size };`,
	map: `import { map } from '${modern}'; export { map };`,
	clone: `import { clone } from '${modern}'; export { clone };`,
	allFns: `export {
    walk, breadthFirst, mapBfs, skipWhere, groupBy, merge, dereference,
    get, has, set, map, forEach, reduce, find, filter, some, every,
    paths, nodes, clone, entries, values, forEachAsync, mapAsync, getType,
    parsePath, parseDotPath, parseJsonPointer, pointerPath,
    getPath, hasPath, setPath, findPaths, filterPaths, count, size,
    deleteWhere, prune, pruneDeep, freeze, deepEqual, toJSON, diff, patch,
    parseGlob, select,
  } from '${modern}';`,
};

const outDir = join(root, 'scripts/bundle-out');
mkdirSync(outDir, { recursive: true });

const results = {};
for (const [name, code] of Object.entries(scenarios)) {
	const entry = join(outDir, `${name}-entry.ts`);
	writeFileSync(entry, code);
	const out = join(outDir, `${name}.js`);
	await esbuild.build({
		entryPoints: [entry],
		outfile: out,
		bundle: true,
		minify: true,
		format: 'esm',
		platform: 'browser',
		target: 'es2022',
		treeShaking: true,
		legalComments: 'none',
	});
	const js = readFileSync(out);
	results[name] = { minified: js.length, brotli: brotliCompressSync(js, brotliOpts).length };
}

const fullMin = readFileSync(join(root, 'dist/modern/min/modern.js'));
results._fullMinDist = {
	minified: fullMin.length,
	brotli: brotliCompressSync(fullMin, brotliOpts).length,
};

const summary = {
	brotliKb: {
		walkTerminalMin: Math.round((results.forEach.brotli / 1024) * 10) / 10,
		walkTerminalMax:
			Math.round(
				(Math.max(results.forEach.brotli, results.map.brotli, results.size.brotli) / 1024) * 10,
			) / 10,
		allFunctionsMax: Math.round((results.allFns.brotli / 1024) * 10) / 10,
		pathOnlyMin:
			Math.round((Math.min(results.get_has_set.brotli, results.getPath.brotli) / 1024) * 10) / 10,
	},
	rangeLabel: '~2–6 KB brotli (tree-shaken)',
};

const report = {
	method: 'esbuild bundle (browser, es2022, minify) + brotli quality 11 from source ESM',
	package: 'neotraverse/modern',
	sideEffects: false,
	measured: new Date().toISOString().slice(0, 10),
	scenarios: {
		get_has_set: { ...results.get_has_set, note: 'path helpers — no tree walk' },
		getPath: { ...results.getPath, note: 'string paths — no tree walk' },
		forEach: { ...results.forEach, note: 'single DFS walk terminal' },
		map: results.map,
		size: results.size,
		clone: { ...results.clone, note: 'clone_node only — no walk callback' },
		allFunctionsExceptTraverse: results.allFns,
		fullMinDistFile: {
			...results._fullMinDist,
			note: 'entire dist/modern/min without consumer tree-shake',
		},
	},
	summary,
};

writeFileSync(join(root, 'bench/bundle-sizes.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report.scenarios, null, 2));
console.log('\nsummary:', report.summary);

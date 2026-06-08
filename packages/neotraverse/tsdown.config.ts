import { readFile, writeFile } from 'node:fs/promises';
import { defineConfig } from 'tsdown';

export default defineConfig([
	// default (`.`) + modern (`./modern`) built together so `modern.js` REUSES `index.js`
	// instead of re-bundling the whole functional API — `src/modern.ts` is just
	// `export * from './index.js'` + the deprecated `Traverse` class. Full, with types.
	{
		entry: ['src/index.ts', 'src/modern.ts'],
		format: ['esm'],
		dts: true,
		sourcemap: false,
		clean: true,
		platform: 'browser',
		target: 'es2026',
	},
	// legacy build — CJS + ESM, ES2015 (rolldown's lowest target), drop-in `traverse` replacement
	{
		entry: ['src/legacy/legacy.cts'],
		format: ['cjs', 'esm'],
		dts: true,
		sourcemap: false,
		clean: false,
		platform: 'neutral',
		target: 'es2015',
		minify: false,
		outDir: 'dist/legacy',
		outExtensions: ({ format }) => ({
			js: format === 'cjs' ? '.cjs' : '.mjs',
			dts: format === 'cjs' ? '.d.cts' : '.d.ts',
		}),
		onSuccess: async () => {
			const file = await readFile('dist/legacy/legacy.mjs', 'utf-8');
			await writeFile('dist/legacy/legacy.mjs', file.replace(/module\.exports = (.+);/, ''));
		},
	},
]);

import { readFile, writeFile } from 'node:fs/promises';
import { defineConfig } from 'tsdown';

export default defineConfig([
	// default build — full, with types
	{
		entry: ['src/index.ts'],
		format: ['esm'],
		dts: true,
		sourcemap: false,
		clean: true,
		platform: 'browser',
		target: 'es2022',
	},
	// default build — minified
	{
		entry: ['src/index.ts'],
		format: ['esm'],
		dts: false,
		sourcemap: false,
		clean: false,
		platform: 'browser',
		target: 'es2022',
		minify: true,
		outDir: 'dist/min',
	},
	// modern build — full, with types
	{
		entry: ['src/modern.ts'],
		format: ['esm'],
		dts: true,
		sourcemap: false,
		clean: false,
		platform: 'browser',
		target: 'es2022',
		outDir: 'dist/modern',
	},
	// modern build — minified
	{
		entry: ['src/modern.ts'],
		format: ['esm'],
		dts: false,
		sourcemap: false,
		clean: false,
		platform: 'browser',
		target: 'es2022',
		minify: true,
		outDir: 'dist/modern/min',
	},
	// legacy build — CJS + ESM, ES2015 (rolldown's lowest target), drop-in `traverse` replacement
	{
		entry: ['src/legacy.cts'],
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

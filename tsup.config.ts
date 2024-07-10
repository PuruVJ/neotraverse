import { defineConfig } from 'tsup';

export default defineConfig([
	{
		entry: ['src/index.ts'],
		format: ['esm'],
		dts: true,
		sourcemap: false,
		clean: true,
		platform: 'browser',
		target: 'es2022',
	},
	{
		entry: ['src/index.ts'],
		format: ['esm'],
		dts: false,
		sourcemap: false,
		clean: true,
		platform: 'browser',
		target: 'es2022',
		minify: 'terser',
		outDir: 'dist/min',
	},
	{
		entry: ['src/index.ts'],
		format: ['cjs', 'esm'],
		dts: false,
		sourcemap: false,
		clean: true,
		platform: 'neutral',
		target: 'es2015',
		minify: false,
		outDir: 'dist/legacy',
	},
]);

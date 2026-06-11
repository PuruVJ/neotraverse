import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { defineConfig } from 'vite-plus';

// Unified Vite+ config for the whole monorepo.
//   vp test   → Vitest (the `test` block)
//   vp check  → Oxfmt + Oxlint + type-check (the `fmt` / `lint` blocks)
//   vp pack   → tsdown build (the `pack` block) — replaces the old tsdown.config.ts
// The library build (tsdown) is kept; it just lives here now under `pack`.
export default defineConfig({
	// In-source unit tests live behind `if (import.meta.vitest)`; Vitest sets
	// import.meta.vitest truthy at test time, and this strips the block from any
	// non-test build of the source.
	define: { 'import.meta.vitest': 'undefined' },

	// ── Vitest ────────────────────────────────────────────────────────────────
	test: {
		// integration tests in test/, in-source unit tests in src/ via includeSource
		includeSource: ['packages/neotraverse/src/**/*.ts'],
		coverage: {
			provider: 'v8',
			include: ['packages/neotraverse/src/**/*.ts'],
		},
		// type-level tests (expectTypeOf) — `vp test` / vitest typecheck
		typecheck: {
			include: ['packages/neotraverse/test/**/*.test-d.ts'],
		},
	},

	// ── Oxfmt (replaces .prettierrc) ───────────────────────────────────────────
	fmt: {
		useTabs: true,
		tabWidth: 2,
		printWidth: 100,
		singleQuote: true,
		semi: true,
		trailingComma: 'all',
		arrowParens: 'always',
		sortPackageJson: true,
		ignorePatterns: [
			'**/dist/**',
			'**/node_modules/**',
			'docs/.vitepress/cache/**',
			'docs/.vitepress/data/**', // generated npm-stats data
			'**/coverage/**',
			'.claude/**', // local editor/agent settings
		],
		overrides: [
			{
				// Markdown: spaces, no trailing commas, don't reflow prose (matches the old .prettierrc md override)
				files: ['**/*.md'],
				options: { useTabs: false, tabWidth: 2, trailingComma: 'none', proseWrap: 'never' },
			},
		],
	},

	// ── Oxlint ─────────────────────────────────────────────────────────────────
	lint: {
		// Lint the library source + tests; skip generated, example, bench, legacy, and docs files.
		ignorePatterns: [
			'**/dist/**',
			'**/node_modules/**',
			'**/coverage/**',
			'**/bench/**',
			'**/scripts/**',
			'**/examples/**',
			'docs/**',
			'packages/neotraverse/legacy.*',
			'packages/neotraverse/src/legacy/**',
		],
		plugins: ['typescript'],
		// Type-aware linting stays OFF: this codebase is deliberately loose
		// (noImplicitAny: false, hot prototype-method references) and types are
		// owned by `tsc --noEmit` / the CI typecheck gate, not the linter. Oxlint
		// still catches real correctness/style issues fast.
		options: { typeAware: false, typeCheck: false },
		rules: {
			'no-sparse-arrays': 'off', // tests deliberately construct sparse arrays
			'typescript/no-this-alias': 'off', // intentional in the v1 lazy-path getter (context.ts)
		},
	},

	// ── tsdown build (replaces tsdown.config.ts) ───────────────────────────────
	// Two builds: the ESM core (default + modern + safe entries), and the legacy
	// drop-in (CJS + ESM, ES2015, custom extensions, with the mjs `module.exports` strip).
	pack: [
		{
			entry: [
				'packages/neotraverse/src/index.ts',
				'packages/neotraverse/src/modern.ts',
				'packages/neotraverse/src/safe/index.ts',
			],
			outDir: 'packages/neotraverse/dist',
			format: ['esm'],
			dts: true,
			sourcemap: false,
			clean: true,
			platform: 'browser',
			target: 'es2026',
			// Strip the in-source `if (import.meta.vitest)` unit tests from the build
			// (the top-level Vite `define` only applies to Vite/Vitest, not the pack/tsdown build).
			define: { 'import.meta.vitest': 'undefined' },
		},
		{
			entry: ['packages/neotraverse/src/legacy/legacy.cts'],
			outDir: 'packages/neotraverse/dist/legacy',
			format: ['cjs', 'esm'],
			dts: true,
			sourcemap: false,
			clean: false,
			platform: 'neutral',
			target: 'es2015',
			minify: false,
			outExtensions: ({ format }) => ({
				js: format === 'cjs' ? '.cjs' : '.mjs',
				dts: format === 'cjs' ? '.d.cts' : '.d.ts',
			}),
			onSuccess: async () => {
				const dir = 'packages/neotraverse';
				const mjs = `${dir}/dist/legacy/legacy.mjs`;
				await writeFile(mjs, (await readFile(mjs, 'utf-8')).replace(/module\.exports = (.+);/, ''));
				// copy the legacy CJS drop-in + its types to the package root (listed in `files`)
				await copyFile(`${dir}/dist/legacy/legacy.cjs`, `${dir}/legacy.js`);
				await copyFile(`${dir}/dist/legacy/legacy.d.cts`, `${dir}/legacy.d.ts`);
			},
		},
	],
});

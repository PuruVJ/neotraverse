import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		// In-source unit tests live behind `if (import.meta.vitest)` in src/**,
		// so we can test internals without exporting them. Integration tests that
		// exercise the public API live in test/ and are picked up by default.
		includeSource: ['src/**/*.ts'],
		coverage: {
			provider: 'v8',
			include: ['src/**/*.ts'],
		},
	},
	// Strip the in-source test blocks from any non-test consumer of the source.
	define: {
		'import.meta.vitest': 'undefined',
	},
});

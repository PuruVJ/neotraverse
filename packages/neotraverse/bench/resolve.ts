/**
 * Preload for `pnpm bench:count`. The source imports its siblings as `./clone.js` (the
 * TypeScript convention for files that compile to `.js`), but Heisenbench counts the `.ts`
 * source as it is, so a `./x.js` import that has a `./x.ts` next to it is resolved to the
 * `.ts` file. Loaded with `NODE_OPTIONS=--import=./bench/resolve.ts`.
 */
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';

registerHooks({
	resolve(specifier, context, next_resolve) {
		if (specifier.startsWith('.') && specifier.endsWith('.js') && context.parentURL) {
			const ts_url = new URL(specifier.slice(0, -3) + '.ts', context.parentURL);
			if (existsSync(fileURLToPath(ts_url))) return next_resolve(ts_url.href, context);
		}
		return next_resolve(specifier, context);
	},
});

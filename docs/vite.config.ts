import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sveltekit } from '@sveltejs/kit/vite';
import { content } from '@ogygia/content/vite';
import { ogygia } from 'ogygia/vite';
import { defineConfig, type Plugin } from 'vite';
import { fetchNpmDownloads } from './scripts/fetch-npm-downloads.mjs';

const DOCS_DIR = dirname(fileURLToPath(import.meta.url));
const NPM_DOWNLOADS_JSON = join(DOCS_DIR, 'src/lib/data/npm-downloads.json');

// Re-fetch the npm download total at build time, so the daily redeploy bakes a fresh number.
// Offline builds fall back to the committed JSON.
function npmDownloads(): Plugin {
	// Kit builds two environments (server, client), and each runs buildStart: fetch once.
	let fetched: Promise<unknown> | undefined;
	return {
		name: 'npm-downloads-fetch',
		apply: 'build',
		async buildStart() {
			await (fetched ??= fetchNpmDownloads({ outFile: NPM_DOWNLOADS_JSON, quiet: true }).catch(
				(err) => {
					if (!existsSync(NPM_DOWNLOADS_JSON)) throw err;
					console.warn(
						'[npm-downloads] fetch failed; using committed data:',
						(err as Error).message,
					);
				},
			));
		},
	};
}

export default defineConfig({
	// the benchmarks page imports bench/*.json and package.json from the library package
	server: { fs: { allow: ['..'] } },
	plugins: [npmDownloads(), ogygia(), content({ markdown: {} }), sveltekit()],
});

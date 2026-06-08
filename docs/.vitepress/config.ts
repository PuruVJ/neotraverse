import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitepress';
import { fetchNpmDownloads } from '../scripts/fetch-npm-downloads.mjs';

const DOCS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..'); // the docs/ root
const NPM_DOWNLOADS_JSON = join(DOCS_DIR, '.vitepress/data/npm-downloads.json');

// Strip VitePress/Vue-specific syntax to plain Markdown for llms.txt.
function toPlain(md: string): string {
	return md
		.replace(/^---\n[\s\S]*?\n---\n/, '') // frontmatter
		.replace(/<script[\s\S]*?<\/script>/g, '') // <script setup>
		.replace(/<style[\s\S]*?<\/style>/g, '') // <style>
		.replace(/<BenchChart\s*\/>/g, '_(interactive benchmark charts at https://neotraverse.puruvj.dev/benchmarks)_')
		.replace(/^::: ?code-group\s*$/gm, '') // code-group fences
		.replace(/^:::\s*\w+.*$/gm, '') // ::: tip/warning/danger open
		.replace(/^:::\s*$/gm, '') // ::: close
		.replace(/\{#[\w-]+\}/g, '') // heading anchors {#id}
		.replace(/ \[\d+\]$/gm, '') // code-group tab labels left on fences
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

// Combine the docs into a single plain-Markdown llms.txt.
const GUIDE_PAGES = [
	'guide.md',
	'guide/vs-traverse.md',
	'guide/options.md',
	'guide/security.md',
	'guide/types.md',
	'guide/context.md',
	'guide/api/core.md',
	'guide/api/paths.md',
	'guide/api/structural.md',
	'guide/api/walk.md',
	'guide/api/query.md',
	'guide/api/iteration.md',
	'guide/api/async.md',
];

function generate_llms(): string {
	const files = [...GUIDE_PAGES, 'legacy.md', 'migration.md', 'benchmarks.md'];
	const parts = [
		'# neotraverse',
		'',
		'> Traverse and transform objects by visiting every node on a recursive walk: zero-dependency, hardened, ~5× faster and ~6× leaner with the functional API (up to ~10× / ~11×). Drop-in replacement for `traverse`.',
		'',
		'Docs: https://neotraverse.puruvj.dev · npm: https://www.npmjs.com/package/neotraverse',
	];
	for (const f of files) {
		const p = join(DOCS_DIR, f);
		if (existsSync(p)) parts.push('\n\n---\n\n' + toPlain(readFileSync(p, 'utf-8')));
	}
	return parts.join('\n') + '\n';
}

export default defineConfig({
	title: 'neotraverse',
	description:
		'Traverse and transform objects by visiting every node on a recursive walk, zero-dependency, hardened, ~5× faster and ~6× leaner functional API (up to ~10× / ~11×).',
	cleanUrls: true,
	lastUpdated: true,
	head: [
		['link', { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
		['meta', { name: 'theme-color', content: '#13c08a' }],
		['meta', { property: 'og:type', content: 'website' }],
		['meta', { property: 'og:url', content: 'https://neotraverse.puruvj.dev/' }],
		['meta', { property: 'og:title', content: 'neotraverse' }],
		['meta', { property: 'og:image', content: 'https://neotraverse.puruvj.dev/og.png' }],
		['meta', { property: 'og:image:width', content: '1200' }],
		['meta', { property: 'og:image:height', content: '630' }],
		['meta', { name: 'twitter:card', content: 'summary_large_image' }],
		['meta', { name: 'twitter:title', content: 'neotraverse' }],
		['meta', { name: 'twitter:image', content: 'https://neotraverse.puruvj.dev/og.png' }],
		[
			'meta',
			{
				property: 'og:description',
				content: 'Zero-dependency, hardened, ~5× faster and ~6× leaner functional API (up to ~10× / ~11×). Drop-in for traverse.',
			},
		],
	],
	themeConfig: {
		logo: '/logo.svg',
		siteTitle: false,
		nav: [
			{ text: 'Docs', link: '/guide' },
			{ text: 'Benchmarks', link: '/benchmarks' },
			{ text: 'Blog', link: 'https://puruvj.dev/blog/neotraverse-1-0' },
			{ text: 'npm', link: 'https://www.npmjs.com/package/neotraverse' },
		],
		sidebar: [
			{
				text: 'Getting started',
				items: [
					{ text: 'Introduction', link: '/guide' },
					{ text: 'neotraverse vs traverse', link: '/guide/vs-traverse' },
				],
			},
			{
				text: 'Core concepts',
				items: [
					{ text: 'The context object', link: '/guide/context' },
					{ text: 'Options', link: '/guide/options' },
					{ text: 'Types & traversal', link: '/guide/types' },
					{ text: 'Security & untrusted input', link: '/guide/security' },
				],
			},
			{
				text: 'API reference',
				collapsed: false,
				items: [
					{ text: 'Core traversal', link: '/guide/api/core' },
					{ text: 'Walks', link: '/guide/api/walk' },
					{ text: 'Queries', link: '/guide/api/query' },
					{ text: 'Paths & selection', link: '/guide/api/paths' },
					{ text: 'Structural helpers', link: '/guide/api/structural' },
					{ text: 'Lazy iteration', link: '/guide/api/iteration' },
					{ text: 'Async traversal', link: '/guide/api/async' },
				],
			},
			{
				text: 'Migrating from traverse',
				items: [
					{ text: 'Migration guide', link: '/migration' },
					{ text: 'Legacy / Classic API', link: '/legacy' },
				],
			},
			{
				text: 'Reference',
				items: [
					{ text: 'Benchmarks', link: '/benchmarks' },
					{ text: 'llms.txt', link: '/llms.txt', target: '_blank' },
				],
			},
		],
		socialLinks: [{ icon: 'github', link: 'https://github.com/PuruVJ/neotraverse' }],
		search: { provider: 'local' },
		editLink: {
			pattern: 'https://github.com/PuruVJ/neotraverse/edit/main/docs/:path',
			text: 'Edit this page on GitHub',
		},
		footer: {
			message: 'Released under the MIT License.',
			copyright: 'Copyright © <a href="https://puruvj.dev" target="_blank" rel="noreferrer">Puru Vijay</a>',
		},
	},
	vite: {
		// allow importing bench/results.json from the sibling package
		server: { fs: { allow: ['..'] } },
		plugins: [
			{
				name: 'npm-downloads-fetch',
				async buildStart() {
					try {
						await fetchNpmDownloads({ outFile: NPM_DOWNLOADS_JSON, quiet: true });
					} catch (err) {
						if (!existsSync(NPM_DOWNLOADS_JSON)) throw err;
						console.warn('[npm-downloads] fetch failed; using committed data:', (err as Error).message);
					}
				},
			},
			{
				// Serve /llms.txt as a live endpoint in dev (no file on disk).
				name: 'llms-txt-endpoint',
				configureServer(server) {
					server.middlewares.use((req, res, next) => {
						if ((req.url || '').split('?')[0] === '/llms.txt') {
							res.setHeader('Content-Type', 'text/plain; charset=utf-8');
							res.end(generate_llms());
						} else {
							next();
						}
					});
				},
			},
		],
	},

	// In the static build, emit the same content into dist/ so the host serves
	// /llms.txt directly.
	buildEnd: (siteConfig) => {
		writeFileSync(join(siteConfig.outDir, 'llms.txt'), generate_llms());
	},
});

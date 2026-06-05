import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from 'vitepress';

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

export default defineConfig({
	title: 'neotraverse',
	description:
		'Traverse and transform objects by visiting every node on a recursive walk — zero-dependency, hardened, ~3× faster drop-in for traverse.',
	cleanUrls: true,
	lastUpdated: true,
	head: [
		['link', { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
		['meta', { name: 'theme-color', content: '#13c08a' }],
		['meta', { property: 'og:title', content: 'neotraverse' }],
		[
			'meta',
			{
				property: 'og:description',
				content: 'Zero-dependency, hardened, ~3× faster drop-in for traverse.',
			},
		],
	],
	themeConfig: {
		logo: '/logo.svg',
		siteTitle: false,
		nav: [
			{ text: 'Docs', link: '/guide' },
			{ text: 'Benchmarks', link: '/benchmarks' },
			{ text: 'Blog ↗', link: 'https://puruvj.dev/blog/neotraverse-0-7' },
			{ text: 'npm', link: 'https://www.npmjs.com/package/neotraverse' },
		],
		sidebar: [
			{
				text: 'Guide',
				items: [
					{ text: 'Documentation', link: '/guide' },
					{ text: 'Migrating from traverse', link: '/migration' },
					{ text: 'Benchmarks', link: '/benchmarks' },
				],
			},
			{
				text: 'Reference',
				items: [{ text: 'llms.txt ↗', link: '/llms.txt', target: '_blank' }],
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
			copyright: 'Copyright © Puru Vijay & James Halliday',
		},
	},
	vite: {
		// allow importing bench/results.json from the sibling package
		server: { fs: { allow: ['..'] } },
	},

	// Generate a single /llms.txt that combines the docs as plain Markdown.
	buildEnd: async (siteConfig) => {
		const src = siteConfig.srcDir;
		const files = ['guide.md', 'migration.md', 'benchmarks.md'];
		const parts = [
			'# neotraverse',
			'',
			'> Traverse and transform objects by visiting every node on a recursive walk — a zero-dependency, prototype-pollution-safe, ~3× faster drop-in replacement for `traverse`.',
			'',
			'Docs: https://neotraverse.puruvj.dev · npm: https://www.npmjs.com/package/neotraverse',
		];
		for (const f of files) {
			const p = join(src, f);
			if (existsSync(p)) parts.push('\n\n---\n\n' + toPlain(readFileSync(p, 'utf-8')));
		}
		writeFileSync(join(siteConfig.outDir, 'llms.txt'), parts.join('\n') + '\n');
	},
});

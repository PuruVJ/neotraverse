<script lang="ts">
	import DocsShell from '@ogygia/content/docs-shell';
	// The shell's own sidebar island, mounted from our code: ogygia scans src/ before it builds the
	// runtime, so the `keep` mark is seen in time (inside DocsShell it is found too late).
	import { Sidebar } from '@ogygia/content' with { wake: 'load', keep: 'og-sidebar' };
	import '@fontsource-variable/inter/index.css';
	import '@ogygia/content/theme.css';
	import '@ogygia/content/shell.css';
	import '$lib/theme.css';
	import { meta } from '$lib/docs.remote';
	import pkg from '../../../packages/neotraverse/package.json';

	let { children } = $props();

	const shellMeta = await meta();

	const links = [
		{ text: 'Docs', href: '/guide/introduction' },
		{ text: 'Benchmarks', href: '/reference/benchmarks' },
		{ text: 'Blog', href: 'https://puruvj.dev/blog/neotraverse-1-0' },
		{ text: 'npm', href: 'https://www.npmjs.com/package/neotraverse' },
	];
</script>

<DocsShell meta={shellMeta} base="" home="/" title="neotraverse" {links}>
	{#snippet brand()}
		<a class="og-cheader-brand nt-brand" href="/" aria-label="neotraverse home">
			<img src="/logo.svg" alt="neotraverse" height="26" />
			<span class="nt-version">v{pkg.version}</span>
		</a>
	{/snippet}
	{#snippet sidebar(tree, base)}
		<Sidebar nav={tree} {base} />
	{/snippet}
	{#snippet actions()}
		<a
			class="og-cheader-github nt-github"
			href="https://github.com/PuruVJ/neotraverse"
			target="_blank"
			rel="noreferrer"
			aria-label="neotraverse on GitHub"
		>
			<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
				<path
					fill="currentColor"
					d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2 0 1.9 1.2 1.9 1.2 1 1.8 2.8 1.3 3.5 1 0-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.2.5-2.3 1.3-3.1-.2-.4-.6-1.6 0-3.2 0 0 1-.3 3.4 1.2a11.5 11.5 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.6 1.6.2 2.8 0 3.2.9.8 1.3 1.9 1.3 3.2 0 4.6-2.8 5.6-5.5 5.9.5.4.9 1 .9 2.2v3.3c0 .3.1.7.8.6A12 12 0 0 0 12 .3"
				/>
			</svg>
		</a>
	{/snippet}
	{@render children()}
</DocsShell>

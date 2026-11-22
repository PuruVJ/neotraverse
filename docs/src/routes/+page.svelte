<script lang="ts">
	import UsedBy from '$lib/components/UsedBy.svelte';

	// The hero sample, hand-highlighted (k: keyword, s: string, n: number, c: comment).
	const example = [
		`<span class="k">import</span> { map } <span class="k">from</span> <span class="s">'neotraverse'</span>;`,
		``,
		`<span class="k">const</span> input = { a: <span class="n">1</span>, nested: { b: <span class="n">2</span> } };`,
		`<span class="k">const</span> out = map(input, (ctx, x) =&gt; {`,
		`  <span class="k">if</span> (<span class="k">typeof</span> x === <span class="s">'number'</span>) ctx.update(x * <span class="n">10</span>);`,
		`});`,
		`<span class="c">// out → { a: 10, nested: { b: 20 } }</span>`,
	].join('\n');

	const features = [
		{
			icon: '🤌',
			title: 'Tree-shakeable',
			details:
				'Utility-first named imports, ~2 KB brotli for one walk (<code>forEach</code>), up to ~6 KB for the full functional API (no deprecated class). Zero dependencies.',
		},
		{
			icon: '🛡️',
			title: 'Hardened',
			details:
				'Prototype-pollution & injection safe on untrusted input, with an opt-in <code>maxDepth</code> DoS guard.',
			href: '/concepts/security',
		},
		{
			icon: '⚡',
			title: 'Fast',
			details:
				'The functional API (the default <code>neotraverse</code> export) averages ~5× throughput and ~6× less heap per walk vs traverse, peaks around ~10× speed and ~11× memory on core shapes.',
			href: '/reference/benchmarks',
		},
		{
			icon: '🎹',
			title: 'TypeScript',
			details: 'Types included by default. Throw away the <code>@types/traverse</code> package.',
		},
		{
			icon: '🛸',
			title: 'ESM-first',
			details:
				'Modern ESM + a legacy ES2015 CJS/ESM drop-in. Works in browsers, Node and Deno.',
		},
		{
			icon: '🔁',
			title: 'Drop-in',
			details:
				'Same API as traverse via <code>neotraverse/legacy</code>, or adopt the default export for named, tree-shakeable functions. See differences from traverse.',
			href: '/guide/vs-traverse',
		},
	];
</script>

<svelte:head>
	<title>neotraverse · Traverse & transform objects</title>
	<meta
		name="description"
		content="Traverse and transform objects by visiting every node on a recursive walk, zero-dependency, hardened, ~5× faster and ~6× leaner functional API (up to ~10× / ~11×)."
	/>
</svelte:head>

<div class="nt-home">
	<section class="nt-hero">
		<div class="nt-hero__copy">
			<h1 class="nt-hero__name">neotraverse</h1>
			<p class="nt-hero__text">Traverse &amp; transform objects</p>
			<p class="nt-hero__tagline">
				Zero-dependency, TypeScript-first, prototype-pollution-safe, ~5× faster and ~6× leaner
				with the functional API (up to ~10× / ~11× peaks). Still a drop-in for traverse.
			</p>
			<div class="nt-hero__actions">
				<a class="nt-btn nt-btn--brand" href="/guide/introduction">Get started</a>
				<a class="nt-btn" href="/reference/benchmarks">Benchmarks</a>
				<a class="nt-btn" href="https://puruvj.dev/blog/neotraverse-1-0">Blog</a>
			</div>
		</div>
		<div class="nt-hero__code" aria-label="Example">
			<div class="nt-hero__code-bar"><span>example.ts</span></div>
			<pre><code>{@html example}</code></pre>
			<pre class="nt-hero__install"><code><span class="d">$</span> npm i neotraverse</code></pre>
		</div>
	</section>

	<section class="nt-features" aria-label="Features">
		{#each features as f (f.title)}
			<svelte:element
				this={f.href ? 'a' : 'div'}
				class={['nt-feature', f.href && 'nt-feature--link']}
				href={f.href}
			>
				<span class="nt-feature__icon" aria-hidden="true">{f.icon}</span>
				<h2 class="nt-feature__title">{f.title}</h2>
				<p class="nt-feature__details">{@html f.details}</p>
			</svelte:element>
		{/each}
	</section>

	<UsedBy />
</div>

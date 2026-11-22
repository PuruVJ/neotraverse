<!--
@component
The total npm downloads. `footer` / `hero` are a static link. `band` counts up once it scrolls into
view, so the home page imports it as an island.
-->
<script lang="ts">
	import stats from '../data/npm-downloads.json';

	let { variant = 'hero' }: { variant?: 'hero' | 'footer' | 'band' } = $props();

	const npmUrl = `https://www.npmjs.com/package/${stats.package}`;
	const target = stats.total;

	// svelte-ignore state_referenced_locally
	let display = $state(variant === 'band' ? 0 : target);

	const totalLabel = new Intl.NumberFormat('en-US', {
		notation: 'compact',
		maximumFractionDigits: 2,
	}).format(stats.total);
	const totalExact = stats.total.toLocaleString('en-US');
	const sinceLabel = new Date(stats.start + 'T00:00:00Z').toLocaleDateString('en-US', {
		month: 'short',
		year: 'numeric',
		timeZone: 'UTC',
	});

	const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

	function countUp() {
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
			display = target;
			return;
		}
		const duration = 2400;
		const startAt = performance.now();
		const tick = (now: number) => {
			const p = Math.min(1, (now - startAt) / duration);
			display = Math.round(target * easeOutCubic(p));
			if (p < 1) requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
	}

	function onView(el: HTMLElement) {
		const io = new IntersectionObserver(
			(entries) => {
				if (entries.some((e) => e.isIntersecting)) {
					countUp();
					io.disconnect();
				}
			},
			{ threshold: 0.2, rootMargin: '0px 0px -8% 0px' },
		);
		io.observe(el);
		return () => io.disconnect();
	}
</script>

{#if variant === 'band'}
	<p {@attach onView} class="nt-downloads--band">
		<span class="nt-downloads__count nt-downloads__count--full" aria-live="polite"
			>{display.toLocaleString('en-US')}</span
		>
		<span class="nt-downloads__label">total npm downloads</span>
	</p>
{:else}
	<a
		class={['nt-downloads', `nt-downloads--${variant}`]}
		href={npmUrl}
		target="_blank"
		rel="noreferrer"
		title="{totalExact} total npm downloads since {sinceLabel}"
	>
		<span class="nt-downloads__count">{totalLabel}</span>
		<span class="nt-downloads__label">total npm downloads</span>
		<span class="nt-downloads__since">since {sinceLabel}</span>
	</a>
{/if}

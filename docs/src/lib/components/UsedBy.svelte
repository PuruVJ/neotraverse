<!--
@component
The "used in production" band on the home page: headline, the download counter, a logo marquee
(CSS only) and the list of direct npm dependents. Static HTML; only the counter is an island.
-->
<script lang="ts">
	import usedBy from '../data/used-by.json';
	import npmDependents from '../data/npm-dependents-curated.json';
	import NpmDownloads from './NpmDownloads.svelte' with { wake: 'visible' };

	type Company = (typeof usedBy.companies)[number] & { logoSlug?: string; logoUrl?: string };

	const LOGO_GREY = '6b7280';
	const companies = usedBy.companies as Company[];

	const spotlight = companies
		.filter((c) => c.tier === 'enterprise' || c.tier === 'featured')
		.sort((a, b) => (b.weeklyDownloads ?? 0) - (a.weeklyDownloads ?? 0));

	const withLogo = spotlight.filter((c) => c.logoSlug || c.logoUrl);

	const textOnly = [
		...spotlight.filter((c) => !c.logoSlug && !c.logoUrl),
		...companies.filter((c) => c.tier === 'community'),
	];

	/** Twice over, so the marquee loops without a seam. */
	const marqueeItems = [...withLogo, ...withLogo];

	const enterprise = companies
		.filter((c) => c.tier === 'enterprise')
		.slice(0, 3)
		.map((c) => c.company);
	const headlineNames = enterprise.length ? enterprise.join(', ') : 'open-source teams';

	function logoSrc(c: Company) {
		if (c.logoUrl) return c.logoUrl;
		if (c.logoSlug) return `https://cdn.simpleicons.org/${c.logoSlug}/${LOGO_GREY}`;
		return '';
	}

	function cardLabel(c: Company) {
		const parts: (string | undefined)[] = [c.company, c.product, c.subtitle, c.npm];
		if (c.weeklyDownloads)
			parts.push(`${c.weeklyDownloads.toLocaleString('en-US')} downloads/wk on npm`);
		return parts.filter(Boolean).join(' · ');
	}

	/** Short name under the logo: the brand people know, not the full evidence line. */
	function logoLabel(c: Company) {
		if (c.company === 'SmartBear') return 'Swagger';
		return c.company;
	}
</script>

<section class="nt-used-by" aria-labelledby="used-by-heading">
	<div class="nt-used-by__band">
		<p class="nt-used-by__eyebrow">Used in production</p>
		<h2 id="used-by-heading" class="nt-used-by__title">Trusted by {headlineNames}, and more</h2>
		<p class="nt-used-by__lead">
			Each link points to a verified direct <code>neotraverse</code> entry in
			<code>package.json</code>.
		</p>

		<NpmDownloads variant="band" />

		<ul class="nt-used-by__stats" aria-label="Adoption summary">
			<li class="nt-used-by__stat">
				<span class="nt-used-by__stat-value">{usedBy.summary.directNpmDependents}</span>
				<span class="nt-used-by__stat-label">direct npm dependents</span>
			</li>
			<li class="nt-used-by__stat-divider" aria-hidden="true">·</li>
			<li class="nt-used-by__stat">
				<span class="nt-used-by__stat-value">{usedBy.summary.totalRepos}+</span>
				<span class="nt-used-by__stat-label">GitHub repos</span>
			</li>
		</ul>
	</div>

	{#if withLogo.length}
		<div class="nt-used-by__marquee" role="region" aria-label="Projects using neotraverse">
			<div class="nt-used-by__marquee-viewport">
				<div class="nt-used-by__marquee-track">
					{#each marqueeItems as c, i (`${c.repo}-${i}`)}
						<a
							class="nt-used-by__logo-link"
							href={c.evidenceUrl}
							target="_blank"
							rel="noreferrer"
							aria-label={cardLabel(c)}
							aria-hidden={i >= withLogo.length ? 'true' : undefined}
							tabindex={i >= withLogo.length ? -1 : undefined}
						>
							<span class="nt-used-by__logo-cell">
								<img
									class="nt-used-by__logo"
									src={logoSrc(c)}
									alt=""
									width="120"
									height="32"
									loading="lazy"
									decoding="async"
								/>
								<span class="nt-used-by__logo-label">{logoLabel(c)}</span>
							</span>
						</a>
					{/each}
				</div>
			</div>
		</div>
	{/if}

	<div class="nt-used-by__band nt-used-by__band--after-marquee">
		{#if textOnly.length}
			<p class="nt-used-by__also">
				Also used by
				{#each textOnly as c, idx (c.repo)}<a
						class="nt-used-by__text-link"
						href={c.evidenceUrl}
						target="_blank"
						rel="noreferrer"
						title={cardLabel(c)}
						>{c.company}{#if c.product !== c.company}&nbsp;({c.product}){/if}</a
					>{#if idx < textOnly.length - 1}<span class="nt-used-by__also-sep">{" · "}</span>{/if}{/each}
			</p>
		{/if}

		<div class="nt-used-by__npm-section" aria-labelledby="npm-dependents-heading">
			<h3 id="npm-dependents-heading" class="nt-used-by__npm-title">Direct npm dependents</h3>
			<p class="nt-used-by__npm-lead">
				{npmDependents.directCount} direct dependents on npm (last manual audit,
				{npmDependents.lastReviewed}).
			</p>
			<div class="nt-used-by__npm-panel">
				<ul class="nt-used-by__npm-list">
					{#each npmDependents.packages as pkg (pkg.name)}
						<li><a href={pkg.npmUrl} target="_blank" rel="noreferrer">{pkg.name}</a></li>
					{/each}
				</ul>
			</div>
		</div>

		<p class="nt-used-by__more">
			<a href={usedBy.moreUrl} target="_blank" rel="noreferrer">Browse on GitHub</a>
			<span aria-hidden="true">·</span>
			<a
				href="https://www.npmjs.com/package/neotraverse?activeTab=dependents"
				target="_blank"
				rel="noreferrer">All npm dependents</a
			>
		</p>
	</div>
</section>

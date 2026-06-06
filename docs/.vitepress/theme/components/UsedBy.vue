<script setup lang="ts">
import { computed } from 'vue';
import usedBy from '../../data/used-by.json';
import npmDependents from '../../data/npm-dependents-curated.json';
import NpmDownloads from './NpmDownloads.vue';

type Company = (typeof usedBy.companies)[number] & { logoSlug?: string; logoUrl?: string };

const LOGO_GREY = '6b7280';

const spotlight = computed(() =>
	[...usedBy.companies]
		.filter((c) => c.tier === 'enterprise' || c.tier === 'featured')
		.sort((a, b) => (b.weeklyDownloads ?? 0) - (a.weeklyDownloads ?? 0)),
);

const withLogo = computed(() => spotlight.value.filter((c) => c.logoSlug || c.logoUrl));

const textOnly = computed(() => [
	...spotlight.value.filter((c) => !c.logoSlug && !c.logoUrl),
	...usedBy.companies.filter((c) => c.tier === 'community'),
]);

/** Duplicated for seamless marquee loop */
const marqueeItems = computed(() => [...withLogo.value, ...withLogo.value]);

const headlineNames = computed(() => {
	const names = usedBy.companies
		.filter((c) => c.tier === 'enterprise')
		.slice(0, 3)
		.map((c) => c.company);
	return names.length ? names.join(', ') : 'open-source teams';
});

function logoSrc(c: Company) {
	if (c.logoUrl) return c.logoUrl;
	if (c.logoSlug) return `https://cdn.simpleicons.org/${c.logoSlug}/${LOGO_GREY}`;
	return '';
}

function cardLabel(c: Company) {
	const parts = [c.company, c.product, c.subtitle, c.npm];
	if (c.weeklyDownloads) parts.push(`${c.weeklyDownloads.toLocaleString('en-US')} downloads/wk on npm`);
	return parts.filter(Boolean).join(' · ');
}

/** Short name under the logo, recognizable brand, not full evidence line */
function logoLabel(c: Company) {
	if (c.company === 'SmartBear') return 'Swagger';
	if (c.company === 'Builder.io') return 'Builder.io';
	return c.company;
}
</script>

<template>
	<section class="nt-used-by" aria-labelledby="used-by-heading">
		<div class="nt-used-by__band">
			<p class="nt-used-by__eyebrow">Used in production</p>
			<h2 id="used-by-heading" class="nt-used-by__title">
				Trusted by {{ headlineNames }}, and more
			</h2>
			<p class="nt-used-by__lead">
				Each link points to a verified direct <code>neotraverse</code> entry in
				<code>package.json</code>.
			</p>

			<NpmDownloads variant="band" />

			<ul class="nt-used-by__stats" aria-label="Adoption summary">
				<li class="nt-used-by__stat">
					<span class="nt-used-by__stat-value">{{ usedBy.summary.directNpmDependents }}</span>
					<span class="nt-used-by__stat-label">direct npm dependents</span>
				</li>
				<li class="nt-used-by__stat-divider" aria-hidden="true">·</li>
				<li class="nt-used-by__stat">
					<span class="nt-used-by__stat-value">{{ usedBy.summary.totalRepos }}+</span>
					<span class="nt-used-by__stat-label">GitHub repos</span>
				</li>
			</ul>
		</div>

		<div
			v-if="withLogo.length"
			class="nt-used-by__marquee"
			role="region"
			aria-label="Projects using neotraverse"
		>
			<div class="nt-used-by__marquee-viewport">
				<div class="nt-used-by__marquee-track">
					<a
						v-for="(c, i) in marqueeItems"
						:key="`${c.repo}-${i}`"
						class="nt-used-by__logo-link"
						:href="c.evidenceUrl"
						target="_blank"
						rel="noreferrer"
						:aria-label="cardLabel(c)"
					>
						<span class="nt-used-by__logo-cell">
							<img
								class="nt-used-by__logo"
								:src="logoSrc(c)"
								alt=""
								width="120"
								height="32"
								loading="lazy"
								decoding="async"
							/>
							<span class="nt-used-by__logo-label">{{ logoLabel(c) }}</span>
						</span>
					</a>
				</div>
			</div>
		</div>

		<div class="nt-used-by__band nt-used-by__band--after-marquee">
			<p v-if="textOnly.length" class="nt-used-by__also">
				Also used by
				<template v-for="(c, idx) in textOnly" :key="c.repo">
					<a
						class="nt-used-by__text-link"
						:href="c.evidenceUrl"
						target="_blank"
						rel="noreferrer"
						:title="cardLabel(c)"
						>{{ c.company }}<span v-if="c.product !== c.company"> ({{ c.product }})</span></a
					><span v-if="idx < textOnly.length - 1" class="nt-used-by__also-sep"> · </span>
				</template>
			</p>

			<div class="nt-used-by__npm-section" aria-labelledby="npm-dependents-heading">
				<h3 id="npm-dependents-heading" class="nt-used-by__npm-title">Direct npm dependents</h3>
				<p class="nt-used-by__npm-lead">
					{{ npmDependents.directCount }} direct dependents on npm (last manual audit,
					{{ npmDependents.lastReviewed }}).
				</p>
				<div class="nt-used-by__npm-panel">
					<ul class="nt-used-by__npm-list">
						<li v-for="pkg in npmDependents.packages" :key="pkg.name">
							<a :href="pkg.npmUrl" target="_blank" rel="noreferrer">{{ pkg.name }}</a>
						</li>
					</ul>
				</div>
			</div>

			<p class="nt-used-by__more">
				<a :href="usedBy.moreUrl" target="_blank" rel="noreferrer">Browse on GitHub</a>
				<span aria-hidden="true">·</span>
				<a
					href="https://www.npmjs.com/package/neotraverse?activeTab=dependents"
					target="_blank"
					rel="noreferrer"
					>All npm dependents</a
				>
			</p>
		</div>
	</section>
</template>

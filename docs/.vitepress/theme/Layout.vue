<script setup lang="ts">
import DefaultTheme from 'vitepress/theme';
import pkg from '../../../packages/neotraverse/package.json';

const { Layout } = DefaultTheme;
</script>

<template>
	<Layout>
		<template #nav-bar-title-after>
			<a
				class="nt-version"
				href="https://www.npmjs.com/package/neotraverse"
				target="_blank"
				rel="noreferrer"
				:title="`neotraverse v${pkg.version} on npm`"
			>
				v{{ pkg.version }}
			</a>
		</template>
	</Layout>
</template>

<style scoped>
.nt-version {
	margin-left: 0.5rem;
	font-family: var(--vp-font-family-mono);
	font-size: 0.74rem;
	font-weight: 600;
	color: var(--vp-c-text-3);
	text-decoration: none;
	transition: color 0.12s ease;
}
.nt-version:hover {
	color: var(--vp-c-brand-1);
}
</style>

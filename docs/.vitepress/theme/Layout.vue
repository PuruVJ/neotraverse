<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import pkg from '../../../packages/neotraverse/package.json';
import NpmDownloads from './components/NpmDownloads.vue';
import UsedBy from './components/UsedBy.vue';

const { Layout } = DefaultTheme;
const route = useRoute();
const isHome = computed(() => route.path === '/' || route.path === '/index.html');
</script>

<template>
	<Layout>
		<template #nav-bar-title-after>
			<span class="nt-version">v{{ pkg.version }}</span>
		</template>
		<template #home-features-after>
			<UsedBy v-if="isHome" />
		</template>
		<template #layout-bottom>
			<NpmDownloads v-if="!isHome" variant="footer" />
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

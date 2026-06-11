<script setup lang="ts">
import { useData } from 'vitepress';
import { ref, watchPostEffect } from 'vue';

const { isDark, theme } = useData();

const switchTitle = ref('');

watchPostEffect(() => {
	switchTitle.value = isDark.value
		? theme.value.lightModeSwitchTitle || 'Switch to light theme'
		: theme.value.darkModeSwitchTitle || 'Switch to dark theme';
});

function toggle() {
	isDark.value = !isDark.value;
}
</script>

<template>
	<button
		type="button"
		class="nt-theme"
		role="switch"
		:aria-checked="isDark"
		:aria-label="switchTitle"
		:title="switchTitle"
		@click="toggle"
	>
		<span class="nt-theme__icons" aria-hidden="true">
			<svg class="nt-theme__icon nt-theme__icon--sun" viewBox="0 0 24 24" fill="none">
				<circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="2" />
				<path
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="square"
					d="M12 3v2M12 19v2M5 12H3M21 12h-2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"
				/>
			</svg>
			<svg class="nt-theme__icon nt-theme__icon--moon" viewBox="0 0 24 24" fill="none">
				<path
					stroke="currentColor"
					stroke-width="2"
					stroke-linejoin="miter"
					d="M20 13.2A8 8 0 1 1 10.8 4 6.5 6.5 0 0 0 20 13.2Z"
				/>
			</svg>
		</span>
	</button>
</template>

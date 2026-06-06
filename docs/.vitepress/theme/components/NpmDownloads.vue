<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import stats from '../../data/npm-downloads.json';

const props = withDefaults(
	defineProps<{
		variant?: 'hero' | 'footer' | 'band';
	}>(),
	{ variant: 'hero' },
);

const npmUrl = `https://www.npmjs.com/package/${stats.package}`;
const targetTotal = stats.total;

const root = ref<HTMLElement | null>(null);
const displayTotal = ref(props.variant === 'band' ? 0 : targetTotal);
const hasAnimated = ref(false);

const totalLabel = computed(() =>
	new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(
		stats.total,
	),
);

const countDisplay = computed(() => displayTotal.value.toLocaleString('en-US'));

const totalExact = computed(() => stats.total.toLocaleString('en-US'));

const sinceLabel = computed(() => {
	const d = new Date(stats.start + 'T00:00:00Z');
	return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
});

function easeOutCubic(t: number) {
	return 1 - (1 - t) ** 3;
}

function runCountUp() {
	if (hasAnimated.value) return;
	hasAnimated.value = true;

	if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
		displayTotal.value = targetTotal;
		return;
	}

	const duration = 2400;
	const startAt = performance.now();

	const tick = (now: number) => {
		const progress = Math.min(1, (now - startAt) / duration);
		displayTotal.value = Math.round(targetTotal * easeOutCubic(progress));
		if (progress < 1) requestAnimationFrame(tick);
		else displayTotal.value = targetTotal;
	};

	requestAnimationFrame(tick);
}

let observer: IntersectionObserver | undefined;

onMounted(() => {
	if (props.variant !== 'band') return;

	const el = root.value;
	if (!el) return;

	observer = new IntersectionObserver(
		(entries) => {
			if (entries.some((e) => e.isIntersecting)) {
				runCountUp();
				observer?.disconnect();
			}
		},
		{ threshold: 0.2, rootMargin: '0px 0px -8% 0px' },
	);
	observer.observe(el);
});

onUnmounted(() => observer?.disconnect());
</script>

<template>
	<p v-if="variant === 'band'" ref="root" class="nt-downloads--band">
		<span class="nt-downloads__count nt-downloads__count--full" aria-live="polite">{{ countDisplay }}</span>
		<span class="nt-downloads__label">total npm downloads</span>
	</p>

	<a
		v-else
		:class="['nt-downloads', `nt-downloads--${variant}`]"
		:href="npmUrl"
		target="_blank"
		rel="noreferrer"
		:title="`${totalExact} total npm downloads since ${sinceLabel}`"
	>
		<span class="nt-downloads__count">{{ totalLabel }}</span>
		<span class="nt-downloads__label">total npm downloads</span>
		<span class="nt-downloads__since">since {{ sinceLabel }}</span>
	</a>
</template>

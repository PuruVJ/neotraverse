<script setup>
import { ref, computed } from 'vue';
import results from '../../../../packages/neotraverse/bench/results.json';

const metric = ref('throughput'); // 'throughput' | 'memory'

const ORDER = ['traverse', 'neotraverse legacy', 'neotraverse modern'];
const COLOR = {
	traverse: 'var(--vp-c-text-3)',
	'neotraverse legacy': 'color-mix(in oklch, var(--vp-c-brand-1) 62%, var(--vp-c-text-3))',
	'neotraverse modern': 'var(--vp-c-brand-1)',
};

// compact label: a boxed `n` mark (the neotraverse logo) + build name
const libDisplay = (name) =>
	name === 'traverse'
		? { logo: false, text: 'traverse' }
		: { logo: true, text: name.replace('neotraverse ', '') };

const groups = computed(() => {
	const out = [];
	for (const s of results.suites) {
		let g = out.find((x) => x.operation === s.operation);
		if (!g) {
			g = { operation: s.operation, suites: [] };
			out.push(g);
		}
		g.suites.push(s);
	}
	return out;
});

const fmtOps = (n) => {
	if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 1 : 2) + 'M';
	if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + 'K';
	return String(Math.round(n));
};
const fmtMem = (b) => {
	if (b == null) return '-';
	if (b >= 1024) return (b / 1024).toFixed(b >= 1024 * 100 ? 0 : 1) + ' KB';
	return Math.round(b) + ' B';
};

function rows(suite) {
	const isThroughput = metric.value === 'throughput';
	const traverse = suite.results.find((x) => x.name === 'traverse');
	const vals = ORDER.map((name) => {
		const r = suite.results.find((x) => x.name === name);
		return isThroughput ? r.opsPerSec : (r.bytesPerOp ?? 0);
	});
	const max = Math.max(...vals, 1);

	// winner: most throughput, or least memory (ignoring zero/▫ measurements)
	let winnerIdx;
	if (isThroughput) {
		winnerIdx = vals.indexOf(Math.max(...vals));
	} else {
		winnerIdx = 0;
		let best = Infinity;
		vals.forEach((v, i) => {
			if (v > 0 && v < best) {
				best = v;
				winnerIdx = i;
			}
		});
	}

	return ORDER.map((name, i) => {
		const r = suite.results.find((x) => x.name === name);
		// multiplier vs traverse (both: higher × = better)
		let mult = null;
		if (isThroughput) {
			mult = suite.speedupVsTraverse[name];
		} else if (traverse.bytesPerOp && r.bytesPerOp) {
			mult = +(traverse.bytesPerOp / r.bytesPerOp).toFixed(2); // × less memory
		}
		return {
			name,
			pct: Math.max(2, (vals[i] / max) * 100),
			label: isThroughput ? fmtOps(r.opsPerSec) : fmtMem(r.bytesPerOp),
			speed: mult,
			fastest: i === winnerIdx,
			color: COLOR[name],
		};
	});
}
</script>

<template>
	<div class="bench">
		<div class="bench-toggle">
			<button :class="{ on: metric === 'throughput' }" @click="metric = 'throughput'">
				Throughput <span class="hint">▲ higher is better</span>
			</button>
			<button :class="{ on: metric === 'memory' }" @click="metric = 'memory'">
				Memory <span class="hint">▼ lower is better</span>
			</button>
		</div>

		<div v-for="g in groups" :key="g.operation" class="bench-group">
			<h3 class="bench-op">{{ g.operation }}</h3>
			<div v-for="s in g.suites" :key="s.label" class="bench-suite">
				<div class="bench-shape">{{ s.dataset }}, {{ s.description }}</div>
				<div
					v-for="row in rows(s)"
					:key="row.name"
					class="bench-row"
					:class="{ win: row.fastest }"
				>
					<span class="bench-lib"
						><img v-if="libDisplay(row.name).logo" src="/logo.svg" class="logo-n" alt="" />{{ libDisplay(row.name).text }}</span
					>
					<span class="bench-track">
						<span class="bench-fill" :style="{ width: row.pct + '%', '--bar': row.color }"></span>
					</span>
					<span class="bench-val">
						{{ row.label }}<span
							v-if="row.name !== 'traverse' && row.speed != null"
							class="bench-x"
						> · {{ row.speed }}×</span><span v-if="row.fastest" class="bench-crown"> 🏆</span>
					</span>
				</div>
			</div>
		</div>
	</div>
</template>

<style scoped>
.bench {
	margin: 1.25rem 0;
}
.bench-toggle {
	display: flex;
	gap: 0.5rem;
	margin-bottom: 1.5rem;
}
.bench-toggle button {
	font-family: var(--vp-font-family-mono);
	font-size: 0.8rem;
	text-transform: uppercase;
	letter-spacing: 0.08em;
	font-weight: 700;
	padding: 0.5rem 0.9rem;
	border: 1px solid var(--vp-c-border);
	border-radius: var(--radius);
	background: var(--vp-c-bg-soft);
	color: var(--vp-c-text-2);
	cursor: pointer;
	transition: all 0.12s ease;
}
.bench-toggle button.on {
	border-color: var(--vp-c-brand-1);
	color: var(--vp-c-brand-1);
	box-shadow: 3px 3px 0 0 color-mix(in oklch, var(--vp-c-brand-1) 30%, transparent);
}
.bench-toggle .hint {
	opacity: 0.6;
	font-weight: 400;
}
.bench-group {
	margin: 1.75rem 0;
}
.bench-op {
	font-family: var(--vp-font-family-mono);
	text-transform: uppercase;
	letter-spacing: 0.14em;
	font-size: 0.95rem;
	font-weight: 700;
	color: var(--vp-c-brand-1);
	border-bottom: 1px solid var(--vp-c-divider);
	padding-bottom: 0.4rem;
	margin: 0 0 1.1rem;
}
.bench-suite {
	margin: 0 0 1.35rem;
}
.bench-shape {
	font-size: 0.82rem;
	color: var(--vp-c-text-3);
	margin-bottom: 0.45rem;
}
.bench-row {
	display: grid;
	grid-template-columns: 7rem 1fr 9rem;
	align-items: center;
	gap: 0.7rem;
	margin: 0.3rem 0;
}
.bench-lib {
	display: flex;
	align-items: center;
	font-family: var(--vp-font-family-mono);
	font-size: 0.84rem;
	color: var(--vp-c-text-2);
	white-space: nowrap;
}
.logo-n {
	width: 1.4em;
	height: 1.4em;
	margin-right: 0.45em;
	flex: none;
}
.bench-row.win .bench-lib {
	color: var(--vp-c-brand-1);
	font-weight: 700;
}
.bench-track {
	position: relative;
	height: 16px;
	background: var(--vp-c-bg-soft);
	border: 1px solid var(--vp-c-divider);
	border-radius: 3px;
	overflow: hidden;
}
.bench-fill {
	position: absolute;
	inset: 0 auto 0 0;
	background: var(--bar);
	border-right: 1px solid color-mix(in oklch, var(--bar) 60%, black);
	transition: width 0.35s ease;
}
.bench-val {
	font-family: var(--vp-font-family-mono);
	font-size: 0.84rem;
	white-space: nowrap;
	color: var(--vp-c-text-1);
	text-align: right;
}
.bench-x {
	color: var(--vp-c-brand-1);
	font-weight: 700;
}

@media (max-width: 640px) {
	.bench-row {
		grid-template-columns: 7rem 1fr 6.5rem;
		gap: 0.4rem;
	}
}
</style>

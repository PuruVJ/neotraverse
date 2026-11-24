<!--
@component
The benchmark bars, one group per operation, with a throughput / memory toggle. An island: it
wakes when it scrolls into view, the rest of the page is static HTML.
-->
<script lang="ts">
	import results from '../../../../packages/neotraverse/bench/results.json';

	type Suite = (typeof results.suites)[number];
	type Lib = 'traverse' | 'neotraverse legacy' | 'neotraverse modern';

	let metric = $state<'throughput' | 'memory'>('throughput');

	const ORDER: Lib[] = ['traverse', 'neotraverse legacy', 'neotraverse modern'];
	const COLOR: Record<Lib, string> = {
		traverse: 'var(--nt-text-3)',
		'neotraverse legacy': 'color-mix(in oklch, var(--nt-brand-1) 62%, var(--nt-text-3))',
		'neotraverse modern': 'var(--nt-brand-1)',
	};

	// compact label: a boxed `n` mark (the neotraverse logo) + build name
	const libDisplay = (name: Lib) =>
		name === 'traverse'
			? { logo: false, text: 'traverse' }
			: { logo: true, text: name.replace('neotraverse ', '') };

	const groups = (() => {
		const out: { operation: string; suites: Suite[] }[] = [];
		for (const s of results.suites) {
			let g = out.find((x) => x.operation === s.operation);
			if (!g) {
				g = { operation: s.operation, suites: [] };
				out.push(g);
			}
			g.suites.push(s);
		}
		return out;
	})();

	const fmtOps = (n: number) => {
		if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 1 : 2) + 'M';
		if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + 'K';
		return String(Math.round(n));
	};
	const fmtMem = (b: number | null | undefined) => {
		if (b == null) return '-';
		if (b >= 1024) return (b / 1024).toFixed(b >= 1024 * 100 ? 0 : 1) + ' KB';
		return Math.round(b) + ' B';
	};

	function rows(suite: Suite, m: typeof metric) {
		const isThroughput = m === 'throughput';
		const find = (name: Lib) => suite.results.find((x) => x.name === name)!;
		const traverse = find('traverse');
		const vals = ORDER.map((name) => {
			const r = find(name);
			return isThroughput ? r.opsPerSec : (r.bytesPerOp ?? 0);
		});
		const max = Math.max(...vals, 1);

		// winner: most throughput, or least memory (ignoring zero measurements)
		let winnerIdx = 0;
		if (isThroughput) {
			winnerIdx = vals.indexOf(Math.max(...vals));
		} else {
			let best = Infinity;
			vals.forEach((v, i) => {
				if (v > 0 && v < best) {
					best = v;
					winnerIdx = i;
				}
			});
		}

		return ORDER.map((name, i) => {
			const r = find(name);
			// multiplier vs traverse (both: higher × = better)
			let mult: number | null = null;
			if (isThroughput) {
				mult = (suite.speedupVsTraverse as Record<string, number>)[name] ?? null;
			} else if (traverse.bytesPerOp && r.bytesPerOp) {
				mult = +(traverse.bytesPerOp / r.bytesPerOp).toFixed(2); // × less memory
			}
			return {
				name,
				pct: Math.max(2, (vals[i]! / max) * 100),
				label: isThroughput ? fmtOps(r.opsPerSec) : fmtMem(r.bytesPerOp),
				speed: mult,
				fastest: i === winnerIdx,
				color: COLOR[name],
			};
		});
	}
</script>

<div class="bench">
	<div class="bench-toggle">
		<button class:on={metric === 'throughput'} onclick={() => (metric = 'throughput')}>
			Throughput <span class="hint">▲ higher is better</span>
		</button>
		<button class:on={metric === 'memory'} onclick={() => (metric = 'memory')}>
			Memory <span class="hint">▼ lower is better</span>
		</button>
	</div>

	{#each groups as g (g.operation)}
		<div class="bench-group">
			<h3 class="bench-op">{g.operation}</h3>
			{#each g.suites as s (s.label)}
				<div class="bench-suite">
					<div class="bench-shape">{s.dataset}, {s.description}</div>
					{#each rows(s, metric) as row (row.name)}
						{@const lib = libDisplay(row.name)}
						<div class="bench-row" class:win={row.fastest}>
							<span class="bench-lib"
								>{#if lib.logo}<img src="/logo.svg" class="logo-n" alt="" />{/if}{lib.text}</span
							>
							<span class="bench-track">
								<span class="bench-fill" style:width="{row.pct}%" style:--bar={row.color}></span>
							</span>
							<span class="bench-val">
								{row.label}{#if row.name !== 'traverse' && row.speed != null}<span class="bench-x">
										· {row.speed}×</span
									>{/if}{#if row.fastest}<span class="bench-crown"> 🏆</span>{/if}
							</span>
						</div>
					{/each}
				</div>
			{/each}
		</div>
	{/each}
</div>

<style>
.bench {
	margin: 1.25rem 0;
}
.bench-toggle {
	display: flex;
	gap: 0.5rem;
	margin-bottom: 1.5rem;
}
.bench-toggle button {
	font-family: var(--nt-mono);
	font-size: 0.8rem;
	text-transform: uppercase;
	letter-spacing: 0.08em;
	font-weight: 700;
	padding: 0.5rem 0.9rem;
	border: 1px solid var(--nt-border);
	border-radius: var(--nt-radius);
	background: var(--nt-bg-soft);
	color: var(--nt-text-2);
	cursor: pointer;
	transition: all 0.12s ease;
}
.bench-toggle button.on {
	border-color: var(--nt-brand-1);
	color: var(--nt-brand-1);
	box-shadow: 3px 3px 0 0 color-mix(in oklch, var(--nt-brand-1) 30%, transparent);
}
.bench-toggle .hint {
	opacity: 0.6;
	font-weight: 400;
}
.bench-group {
	margin: 1.75rem 0;
}
.bench-op {
	font-family: var(--nt-mono);
	text-transform: uppercase;
	letter-spacing: 0.14em;
	font-size: 0.95rem;
	font-weight: 700;
	color: var(--nt-brand-1);
	border-bottom: 1px solid var(--nt-divider);
	padding-bottom: 0.4rem;
	margin: 0 0 1.1rem;
}
.bench-suite {
	margin: 0 0 1.35rem;
}
.bench-shape {
	font-size: 0.82rem;
	color: var(--nt-text-3);
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
	font-family: var(--nt-mono);
	font-size: 0.84rem;
	color: var(--nt-text-2);
	white-space: nowrap;
}
.logo-n {
	width: 1.4em;
	height: 1.4em;
	margin-right: 0.45em;
	flex: none;
}
.bench-row.win .bench-lib {
	color: var(--nt-brand-1);
	font-weight: 700;
}
.bench-track {
	position: relative;
	height: 16px;
	background: var(--nt-bg-soft);
	border: 1px solid var(--nt-divider);
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
	font-family: var(--nt-mono);
	font-size: 0.84rem;
	white-space: nowrap;
	color: var(--nt-text-1);
	text-align: right;
}
.bench-x {
	color: var(--nt-brand-1);
	font-weight: 700;
}

@media (max-width: 640px) {
	.bench-row {
		grid-template-columns: 7rem 1fr 6.5rem;
		gap: 0.4rem;
	}
}
</style>

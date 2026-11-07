/**
 * Heisenbench cases for `neotraverse/safe`, counted from `src/safe/`. The same operations
 * and datasets as the `neotraverse/safe` contender of `run-safe.ts`, its v2-only suites, and
 * the async transform and `patch` it does not reach. Run with `pnpm bench:count`.
 */
import { bench } from 'heisenbench/bench';
import {
	clone,
	diff,
	equal,
	get,
	has,
	merge,
	patch,
	resolveRefs,
	set,
	transform,
	transformAsync,
	visit,
} from '../src/safe/index.ts';
import {
	DEEP_PATH,
	build_array,
	build_realistic,
	build_refs,
	dataset_options,
	datasets,
} from './data.ts';

let sink = 0;

const operations: Record<string, (d: any) => unknown> = {
	forEach: (d) => {
		for (const node of visit(d)) if (typeof node.value === 'number') sink += node.value as number;
	},
	map: (d) =>
		transform(d, (node: any, edit: any) => {
			if (typeof node.value === 'number') return edit.replace(node.value + 1);
			if (typeof node.value === 'string') return edit.replace(node.value.toUpperCase());
		}),
	clone: (d) => clone(d),
	reduce: (d) => {
		let n = 0;
		for (const node of visit(d)) if (node.isLeaf) n++;
		return n;
	},
	paths: (d) => {
		let n = 0;
		for (const node of visit(d)) {
			sink += node.path.length;
			n++;
		}
		return n;
	},
	nodes: (d) => {
		let n = 0;
		for (const _ of visit(d)) n++;
		return n;
	},
};

for (const [operation, fn] of Object.entries(operations)) {
	for (const [name, dataset] of Object.entries(datasets)) {
		bench(`safe ${operation} · ${name}`, ({ d }) => fn(d), dataset_options(dataset));
	}
}

bench('safe get · json', ({ d }) => get(d, DEEP_PATH), { setup: () => ({ d: build_realistic() }) });
bench('safe has · json', ({ d }) => has(d, DEEP_PATH), { setup: () => ({ d: build_realistic() }) });
bench('safe set · json, in place', ({ d }) => set(d, DEEP_PATH, 1, { mutate: true }), {
	setup: () => ({ d: build_realistic() as any }),
});

// The v2-only suites of `run-safe.ts`.
const big = () => {
	const a = build_array(2000);
	const b = structuredClone(a);
	b[1000].name = 'changed';
	return { a, b };
};
bench('safe transform · no-op identity (2000)', ({ a }) => transform(a, () => {}), {
	setup: big,
});
bench(
	'safe transform · single sparse edit (2000)',
	({ a }) =>
		transform(a, (n: any, e: any) =>
			n.key === 'name' && n.value === 'item-1000' ? e.replace('x') : undefined,
		),
	{ setup: big },
);
bench('safe merge · json', ({ d }) => merge(d, { profile: { age: 42 } }), {
	setup: () => ({ d: build_realistic() }),
});
bench('safe diff · array(2000) one change', ({ a, b }) => diff(a, b).length, { setup: big });
bench('safe equal · json', ({ a, b }) => equal(a, b), {
	setup: () => ({ a: build_realistic(), b: build_realistic() }),
});
bench('safe resolveRefs · refs', ({ d }) => resolveRefs(d), { setup: () => ({ d: build_refs() }) });
bench('safe visit match · posts.*.id', ({ d }) => visit(d, 'posts.*.id').toArray().length, {
	setup: () => ({ d: build_realistic() }),
});

// Not in `run-safe.ts`.
bench('safe patch · array(2000) one change', ({ a, ops }) => patch(a, ops), {
	setup: () => {
		const { a, b } = big();
		return { a, ops: diff(a, b) };
	},
});
bench(
	'safe transformAsync · json',
	({ d }) =>
		transformAsync(d, async (node: any, edit: any) => {
			if (typeof node.value === 'number') return edit.replace(node.value + 1);
		}),
	{ setup: () => ({ d: build_realistic() }) },
);

export { sink };

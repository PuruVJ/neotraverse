/**
 * Heisenbench cases for the default functional API (`neotraverse`), counted from `src/`.
 * The same operations and datasets as `run.ts` (its `neotraverse modern` contender), plus
 * the walks and path helpers `run.ts` does not reach. Run with `pnpm bench:count`.
 */
import { bench } from 'heisenbench/bench';
import {
	breadthFirst,
	clone,
	deepEqual,
	dereference,
	diff,
	filter,
	find,
	forEach,
	get,
	has,
	map,
	merge,
	nodes,
	parseDotPath,
	parseJsonPointer,
	patch,
	paths,
	reduce,
	select,
	set,
} from '../src/index.ts';
import {
	DEEP_PATH,
	build_array,
	build_circular,
	build_map_set,
	build_realistic,
	build_refs,
	dataset_options,
	datasets,
} from './data.ts';

let sink = 0;

const operations: Record<string, (d: any) => unknown> = {
	forEach: (d) =>
		forEach(d, (_c: any, n: any) => {
			if (typeof n === 'number') sink += n;
		}),
	map: (d) =>
		map(d, (c: any, n: any) => {
			if (typeof n === 'number') c.update(n + 1);
			else if (typeof n === 'string') c.update(n.toUpperCase());
		}),
	clone: (d) => clone(d),
	reduce: (d) =>
		reduce(
			d,
			(c: any, acc: any[], n: any) => {
				if (c.isLeaf) acc.push(n);
				return acc;
			},
			[],
		).length,
	paths: (d) => paths(d).length,
	nodes: (d) => nodes(d).length,
};

for (const [operation, fn] of Object.entries(operations)) {
	for (const [name, dataset] of Object.entries(datasets)) {
		bench(`${operation} · ${name}`, ({ d }) => fn(d), dataset_options(dataset));
	}
}

bench('get · json', ({ d }) => get(d, DEEP_PATH), { setup: () => ({ d: build_realistic() }) });
bench('has · json', ({ d }) => has(d, DEEP_PATH), { setup: () => ({ d: build_realistic() }) });
bench('set · json', ({ d }) => set(d, DEEP_PATH, 1), { setup: () => ({ d: build_realistic() }) });

// The modern-only suites of `run.ts`.
// The generic scaler follows `self` round the cycle, so this case grows its own post count.
bench('clone · circular', ({ d }) => clone(d), {
	setup: () => ({ d: build_circular() }),
	scale: (_ctx, factor) => ({ d: build_circular(8 * factor) }),
});
bench('clone · map+set', ({ d }) => clone(d), { setup: () => ({ d: build_map_set() }) });
bench('deepEqual · json', ({ a, b }) => deepEqual(a, b), {
	setup: () => ({ a: build_realistic(), b: build_realistic() }),
});
bench('diff · array(256)', ({ a, b }) => diff(a, b).length, {
	setup: () => ({
		a: build_array(256),
		b: build_array(256).map((o, i) => (i % 5 === 0 ? { ...o, name: `${o.name}!` } : o)),
	}),
});
bench('merge · json', ({ a, b }) => merge(a, b), {
	setup: () => {
		const b = build_realistic();
		b.profile.age = 42;
		b.posts[0].likes = 999;
		return { a: build_realistic(), b };
	},
});
bench('select · json', ({ d }) => select(d, 'posts[*].id').length, {
	setup: () => ({ d: build_realistic() }),
});
bench('dereference · refs', ({ d }) => dereference(d), { setup: () => ({ d: build_refs() }) });

// Not in `run.ts`: early exit, breadth-first, applying a diff, and parsing string paths.
bench('find · array(256), hit near the end', ({ d }) => find(d, (_c, v) => v === 'item-250'), {
	setup: () => ({ d: build_array(256) }),
});
bench('filter · array(256)', ({ d }) => filter(d, (_c, v) => typeof v === 'number').length, {
	setup: () => ({ d: build_array(256) }),
});
bench(
	'breadthFirst · json',
	({ d }) =>
		breadthFirst(d, (_c: any, n: any) => {
			if (typeof n === 'number') sink += n;
		}),
	{ setup: () => ({ d: build_realistic() }) },
);
bench('patch · array(256), every fifth name', ({ d, ops }) => patch(d, ops), {
	setup: () => {
		const a = build_array(256);
		const b = build_array(256).map((o, i) => (i % 5 === 0 ? { ...o, name: `${o.name}!` } : o));
		return { d: a, ops: diff(a, b) };
	},
});
bench('parseDotPath · a.b[3].c', () => parseDotPath('profile.posts[3].meta.tags[0]'));
bench('parseJsonPointer · /a/b/3/c', () => parseJsonPointer('/profile/posts/3/meta/tags/0'));

export { sink };

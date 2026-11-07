/**
 * Heisenbench cases for the `traverse`-compatible build (`neotraverse/legacy`), counted from
 * `src/legacy/index.ts`. The same operations and datasets as the `neotraverse legacy`
 * contender of `run.ts`. Run with `pnpm bench:count`.
 */
import { bench } from 'heisenbench/bench';
import traverse from '../src/legacy/index.ts';
import { DEEP_PATH, build_realistic, dataset_options, datasets } from './data.ts';

let sink = 0;

const operations: Record<string, (d: any) => unknown> = {
	forEach: (d) =>
		traverse(d).forEach(function (n: any) {
			if (typeof n === 'number') sink += n;
		}),
	map: (d) =>
		traverse(d).map(function (this: any, n: any) {
			if (typeof n === 'number') this.update(n + 1);
			else if (typeof n === 'string') this.update(n.toUpperCase());
		}),
	clone: (d) => traverse(d).clone(),
	reduce: (d) =>
		traverse(d).reduce(function (this: any, acc: any[], n: any) {
			if (this.isLeaf) acc.push(n);
			return acc;
		}, []).length,
	paths: (d) => traverse(d).paths().length,
	nodes: (d) => traverse(d).nodes().length,
};

for (const [operation, fn] of Object.entries(operations)) {
	for (const [name, dataset] of Object.entries(datasets)) {
		bench(`legacy ${operation} · ${name}`, ({ d }) => fn(d), dataset_options(dataset));
	}
}

bench('legacy get · json', ({ d }) => traverse(d).get(DEEP_PATH), {
	setup: () => ({ d: build_realistic() }),
});
bench('legacy has · json', ({ d }) => traverse(d).has(DEEP_PATH), {
	setup: () => ({ d: build_realistic() }),
});
bench('legacy set · json', ({ d }) => traverse(d).set(DEEP_PATH, 1), {
	setup: () => ({ d: build_realistic() }),
});

export { sink };

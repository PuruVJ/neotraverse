/**
 * The datasets of `run.ts` and `run-safe.ts`, shared by the Heisenbench bench files
 * (`*.bench.ts`). Each `setup` takes a fresh copy, so a case that mutates (`set`, `map`)
 * never changes the input of the next run.
 */
export const build_wide = (n: number) => {
	const o: Record<string, unknown> = {};
	for (let i = 0; i < n; i++) o['k' + i] = i % 3 === 0 ? `v${i}` : i;
	return o;
};

export const build_deep = (n: number) => {
	const root: any = {};
	let cur = root;
	for (let i = 0; i < n; i++) cur = cur.child = { i, label: 'node' + i };
	return root;
};

export const build_array = (n: number) =>
	Array.from({ length: n }, (_, i) => ({
		id: i,
		name: `item-${i}`,
		active: i % 2 === 0,
		tags: [i, i + 1],
	}));

export const build_realistic = (posts = 8) => ({
	id: 'u_123',
	name: 'Ada',
	roles: ['admin', 'user'],
	profile: {
		age: 41,
		address: { city: 'London', geo: { lat: 51.5, lng: -0.12 } },
		prefs: { theme: 'dark', langs: ['en', 'fr'] },
	},
	posts: Array.from({ length: posts }, (_, i) => ({
		id: i,
		title: `Post ${i}`,
		likes: i * 3,
		meta: { pinned: i === 0, tags: ['a', 'b'] },
	})),
});

/**
 * `grow(factor)` is the dataset at `factor` times its size, for `heisenbench growth`: more keys,
 * more levels, more items. Without it the generic scaler lengthens the strings and arrays it
 * finds, which does not grow a flat object's key count or a chain's depth.
 */
export const datasets: Record<
	string,
	{ description: string; make: () => any; grow?: (factor: number) => any }
> = {
	small: { description: '{ a, b, c:[…] }', make: () => ({ a: 1, b: 2, c: [3, 4] }) },
	wide: {
		description: 'flat object, 64 keys',
		make: () => build_wide(64),
		grow: (factor) => build_wide(64 * factor),
	},
	deep: {
		description: '32-level nested',
		make: () => build_deep(32),
		grow: (factor) => build_deep(32 * factor),
	},
	array: {
		description: 'array of 256 objects',
		make: () => build_array(256),
		grow: (factor) => build_array(256 * factor),
	},
	json: { description: 'realistic API response', make: build_realistic },
};

/** The `bench` options of a dataset case: a fresh copy per run, and its scaler when it has one. */
export const dataset_options = (dataset: (typeof datasets)[string]) => ({
	setup: () => ({ d: dataset.make() }),
	scale: dataset.grow
		? (_ctx: { d: any }, factor: number) => ({ d: dataset.grow!(factor) })
		: undefined,
});

export const DEEP_PATH = ['profile', 'address', 'geo', 'lat'];

export const build_refs = () => ({
	defs: { Foo: { type: 'string' } },
	items: Array.from({ length: 32 }, () => ({ $ref: '#/defs/Foo' })),
});

export const build_circular = (posts = 8) => {
	const circular: any = build_realistic(posts);
	circular.self = circular;
	return circular;
};

export const build_map_set = () => ({
	m: new Map(Array.from({ length: 32 }, (_, i) => [`k${i}`, { i, v: `v${i}` }])),
	s: new Set(Array.from({ length: 32 }, (_, i) => i)),
});

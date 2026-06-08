import { describe, expect, test } from 'vitest';
import {
	clone,
	entries,
	every,
	filter,
	find,
	forEach,
	forEachAsync,
	map,
	mapAsync,
	nodes,
	paths,
	some,
	values,
} from '../src/index';

// Modern functional API: query helpers, lazy iteration, async traversal, Map/Set clone
// support. (These used to live on the `Traverse` class; the class is now legacy-parity only,
// so the canonical home — and this coverage — is the standalone functions.)

describe('query helpers', () => {
	const obj = { a: 1, b: { c: 2, d: 3 }, e: 4 };

	test('find returns the first matching node (by walk order)', () => {
		expect(find(obj, (_, x) => x === 3)).toBe(3);
		expect(find(obj, (ctx) => ctx.isLeaf && (ctx.node as number) > 1)).toBe(2);
	});

	test('find returns undefined when nothing matches', () => {
		expect(find(obj, (_, x) => x === 999)).toBeUndefined();
	});

	test('find stops walking as soon as it matches', () => {
		let visits = 0;
		find(obj, (_, x) => {
			visits++;
			return x === 2;
		});
		// root, a=1, b={…}, c=2 → 4 visits, then stop (d=3, e=4 never seen)
		expect(visits).toBe(4);
	});

	test('filter returns every matching node', () => {
		expect(filter(obj, (ctx) => ctx.isLeaf)).toEqual([1, 2, 3, 4]);
	});

	test('some / every', () => {
		expect(some(obj, (_, x) => x === 3)).toBe(true);
		expect(some(obj, (_, x) => x === 99)).toBe(false);
		expect(every(obj, (ctx) => ctx.isRoot || ctx.notLeaf || (ctx.node as number) > 0)).toBe(true);
		expect(every(obj, (ctx) => !ctx.isLeaf || (ctx.node as number) > 2)).toBe(false);
	});

	test('some short-circuits at the first match', () => {
		let visits = 0;
		some(obj, (_, x) => {
			visits++;
			return x === 1;
		});
		expect(visits).toBe(2); // root, a=1 → stop
	});

	test('the root node is considered', () => {
		expect(find({ x: 1 }, (ctx) => ctx.isRoot)).toEqual({ x: 1 });
	});
});

describe('lazy iteration', () => {
	const obj = { a: 1, b: [2, 3], c: { d: 4, e: { f: 5 } } };

	test('values() yields every node, equal to nodes()', () => {
		expect([...values(obj)]).toEqual(nodes(obj));
	});

	test('for…of over values() iterates the nodes', () => {
		const seen: any[] = [];
		for (const node of values(obj)) seen.push(node);
		expect(seen).toEqual(nodes(obj));
	});

	test('entries() yields [path, node], matching paths()/nodes()', () => {
		const entryList = [...entries(obj)];
		expect(entryList.map((e) => e[0])).toEqual(paths(obj));
		expect(entryList.map((e) => e[1])).toEqual(nodes(obj));
	});

	test('terminates on a circular reference (visited once, not descended)', () => {
		const o: any = { a: 1 };
		o.self = o;
		const ns = [...values(o)];
		expect(ns).toHaveLength(3); // root, 1, self(=root, not descended)
		expect(ns[2]).toBe(o);
	});

	test('honors includeSymbols', () => {
		const sym = Symbol('s');
		const withSym = { a: 1, [sym]: 2 };
		expect([...entries(withSym)]).toHaveLength(2); // root, a
		expect([...entries(withSym, { includeSymbols: true })]).toHaveLength(3); // + sym
	});

	test('honors maxDepth (throws while iterating)', () => {
		const deep = { a: { b: { c: 1 } } };
		expect(() => [...entries(deep, { maxDepth: 1 })]).toThrow(RangeError);
	});

	test('a Map/Set is a leaf — only the container is yielded', () => {
		expect([...values(new Map([['k', 1]]))]).toHaveLength(1);
	});
});

describe('async traversal', () => {
	const base = { a: 1, b: { c: 2 }, d: [3, 4] };

	test('forEachAsync mutates in place and matches sync forEach', async () => {
		const syncObj = structuredClone(base);
		forEach(syncObj, (ctx, x) => {
			if (typeof x === 'number') ctx.update(x + 100);
		});

		const asyncObj = structuredClone(base);
		const ret = await forEachAsync(asyncObj, async (ctx, x) => {
			if (typeof x === 'number') {
				await Promise.resolve();
				ctx.update(x + 100);
			}
		});

		expect(asyncObj).toEqual(syncObj);
		expect(ret).toBe(asyncObj);
	});

	test('mapAsync matches sync map and leaves the original intact', async () => {
		const sync = map(structuredClone(base), (ctx, x) => {
			if (typeof x === 'number') ctx.update(x * 10);
		});

		const original = structuredClone(base);
		const out = await mapAsync(original, async (ctx, x) => {
			if (typeof x === 'number') {
				await Promise.resolve();
				ctx.update(x * 10);
			}
		});

		expect(out).toEqual(sync);
		expect(original).toEqual(base); // untouched
	});

	test('an already-aborted signal rejects the walk', async () => {
		const controller = new AbortController();
		controller.abort();
		await expect(forEachAsync({ a: 1 }, async () => {}, { signal: controller.signal })).rejects.toThrow();
	});

	test('aborting mid-walk stops the walk', async () => {
		const controller = new AbortController();
		let count = 0;
		await expect(
			forEachAsync(
				{ a: 1, b: 2, c: 3, d: 4 },
				async () => {
					count++;
					if (count === 2) controller.abort();
				},
				{ signal: controller.signal },
			),
		).rejects.toThrow();
		expect(count).toBeLessThan(5);
	});

	test('maxDepth still throws in async walks', async () => {
		const deep = { a: { b: { c: { d: 1 } } } };
		await expect(forEachAsync(deep, async () => {}, { maxDepth: 2 })).rejects.toThrow(RangeError);
	});
});

describe('Map & Set clone support', () => {
	test('clone deep-clones a Map and its entries', () => {
		const inner = { n: 1 };
		const src = new Map<string, unknown>([
			['k', inner],
			['m', 2],
		]);
		const cloned = clone(src);

		expect(cloned).toBeInstanceOf(Map);
		expect(cloned).not.toBe(src);
		expect(cloned.get('m')).toBe(2);
		expect(cloned.get('k')).toEqual({ n: 1 });
		expect(cloned.get('k')).not.toBe(inner); // deep, not shared
	});

	test('clone deep-clones a Set and its entries', () => {
		const inner = { n: 1 };
		const cloned = clone(new Set<unknown>([inner, 2]));

		expect(cloned).toBeInstanceOf(Set);
		expect([...cloned]).toHaveLength(2);
		const clonedInner = [...cloned].find((x) => typeof x === 'object');
		expect(clonedInner).toEqual({ n: 1 });
		expect(clonedInner).not.toBe(inner);
	});

	test('clone deep-clones object keys of a Map', () => {
		const key = { id: 1 };
		const cloned = clone(new Map([[key, 'v']]));
		const clonedKey = [...cloned.keys()][0];

		expect(clonedKey).toEqual({ id: 1 });
		expect(clonedKey).not.toBe(key);
	});

	test('clone handles a Map nested inside a plain object', () => {
		const src = { m: new Map([['a', { x: 1 }]]) };
		const cloned = clone(src);

		expect(cloned.m).toBeInstanceOf(Map);
		expect(cloned.m).not.toBe(src.m);
		expect(cloned.m.get('a')).toEqual({ x: 1 });
		expect(cloned.m.get('a')).not.toBe(src.m.get('a'));
	});

	test('clone terminates on a circular Map', () => {
		const m = new Map<string, unknown>();
		m.set('self', m);
		const cloned = clone(m);

		expect(cloned).toBeInstanceOf(Map);
		expect(cloned).not.toBe(m);
		expect(cloned.get('self')).toBe(cloned); // cycle points at the clone
	});

	test('map shallow-copies a Map (new instance, shared entries)', () => {
		const inner = { n: 1 };
		const src = new Map([['k', inner]]);
		const mapped = map(src, () => {});

		expect(mapped).toBeInstanceOf(Map);
		expect(mapped).not.toBe(src);
		expect(mapped.get('k')).toBe(inner); // shallow — same ref
	});
});

import { expect, test } from 'vitest';
import {
	breadthFirst, dereference, forEach, forEachAsync, groupBy, mapBfs, merge, paths, skipWhere, walk } from '../src/index';

test('skipWhere blocks subtrees', () => {
	const obj = { a: { b: 1 }, c: 2 };
	const seen: PropertyKey[][] = [];
	forEach(
		obj,
		(ctx, v) => {
			skipWhere((c) => c.key === 'a')(ctx, v);
			seen.push(ctx.path.slice());
		},
	);
	expect(seen.some((p) => p[0] === 'a' && p.length === 1)).toBe(true);
	expect(seen.some((p) => p[0] === 'a' && p[1] === 'b')).toBe(false);
});

test('groupBy buckets values', () => {
	const obj = { a: 1, b: 2, c: 3 };
	const m = groupBy(obj, (ctx, v) => (ctx.isLeaf && typeof v === 'number' ? (v % 2 === 0 ? 'even' : 'odd') : 'skip'));
	expect(m.get('odd')?.sort()).toEqual([1, 3]);
	expect(m.get('even')).toEqual([2]);
});

test('merge deep object and replace arrays by default', () => {
	const target = { a: { x: 1 }, arr: [1, 2] };
	const source = { a: { y: 2 }, arr: [9] };
	const out = merge(target, source);
	expect(out).toEqual({ a: { x: 1, y: 2 }, arr: [9] });
	expect(target.a).toEqual({ x: 1 });
});

test('merge array concat option', () => {
	expect(merge({ arr: [1] }, { arr: [2, 3] }, { array: 'concat' })).toEqual({ arr: [1, 2, 3] });
});

test('dereference local JSON pointer', () => {
	const doc = {
		defs: { Foo: { type: 'string' } },
		node: { $ref: '#/defs/Foo' },
	};
	const out = dereference(doc);
	expect(out.node).toEqual({ type: 'string' });
});

test('breadthFirst visits shallower nodes first', () => {
	const obj = { a: { b: 1 }, c: 2 };
	const order: PropertyKey[][] = [];
	breadthFirst(obj, (ctx) => {
		order.push(ctx.path.slice());
	});
	const depth = (p: PropertyKey[]) => p.length;
	const depths = order.map(depth);
	for (let i = 1; i < depths.length; i++) {
		expect(depths[i]).toBeGreaterThanOrEqual(depths[i - 1]);
	}
	expect(order[0]).toEqual([]);
	expect(order.some((p) => p[0] === 'a' && p.length === 1)).toBe(true);
});

test('mapBfs returns immutable clone', () => {
	const obj = { a: 1 };
	const out = mapBfs(obj, (ctx) => {
		if (ctx.key === 'a') ctx.update(2);
	});
	expect(out).toEqual({ a: 2 });
	expect(obj.a).toBe(1);
});

test('walk is exported and matches forEach root return', () => {
	const obj = { a: 1 };
	expect(walk(obj, () => {})).toBe(obj);
});

test('descendIntoMapSet visits map entries', () => {
	const m = new Map([['k', { v: 1 }]]);
	const leafPaths = paths(m, { descendIntoMapSet: true }).filter((p) => p.length === 2);
	expect(leafPaths.length).toBeGreaterThan(0);
});

test('forEachAsync concurrency runs siblings in parallel', async () => {
	const obj = { a: 0, b: 0, c: 0 };
	let maxActive = 0;
	let active = 0;
	await forEachAsync(
		obj,
		async () => {
			active++;
			maxActive = Math.max(maxActive, active);
			await new Promise((r) => setTimeout(r, 5));
			active--;
		},
		{ concurrency: 3 },
	);
	expect(maxActive).toBeGreaterThan(1);
});

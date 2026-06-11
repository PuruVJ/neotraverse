import { describe, expect, test } from 'vite-plus/test';
import { breadthFirst, forEach, mapBfs, paths } from '../src/index';

/**
 * Behavior spec for nextSibling/prevSibling context integrity (C-4) and BFS.
 * RED until the sibling-context fix lands.
 */

describe('nextSibling / prevSibling — context integrity (C-4)', () => {
	test('object siblings expose a fully-formed context', () => {
		const obj = { a: 1, b: 2, c: 3 };
		let report: any;
		forEach(obj, (ctx) => {
			if (ctx.key === 'b') {
				const next = ctx.nextSibling()!;
				const prev = ctx.prevSibling()!;
				report = {
					nextNode: next.node,
					nextKey: next.key,
					nextLevel: next.level,
					nextPath: next.path, // must not throw
					prevNode: prev.node,
					prevKey: prev.key,
				};
			}
		});
		expect(report).toEqual({
			nextNode: 3,
			nextKey: 'c',
			nextLevel: 1,
			nextPath: ['c'],
			prevNode: 1,
			prevKey: 'a',
		});
	});

	test('array siblings use numeric keys/paths', () => {
		const arr = [10, 20, 30];
		let report: any;
		forEach(arr, (ctx) => {
			if (ctx.key === 1) {
				const next = ctx.nextSibling()!;
				report = { node: next.node, key: next.key, path: next.path };
			}
		});
		expect(report).toEqual({ node: 30, key: 2, path: [2] });
	});

	test('first has no prev, last has no next', () => {
		const obj = { a: 1, b: 2 };
		const ends: any = {};
		forEach(obj, (ctx) => {
			if (ctx.key === 'a') ends.prevOfFirst = ctx.prevSibling();
			if (ctx.key === 'b') ends.nextOfLast = ctx.nextSibling();
		});
		expect(ends.prevOfFirst).toBeUndefined();
		expect(ends.nextOfLast).toBeUndefined();
	});
});

describe('breadthFirst', () => {
	test('visits shallower nodes first', () => {
		const order: PropertyKey[][] = [];
		breadthFirst({ a: { b: 1 }, c: 2 }, (ctx) => {
			order.push(ctx.path);
		});
		expect(order.length).toBeGreaterThan(3);
		const depths = order.map((p) => p.length);
		for (let i = 1; i < depths.length; i++) expect(depths[i]).toBeGreaterThanOrEqual(depths[i - 1]);
	});

	test('circular graph terminates and visits the back-edge once', () => {
		const o: any = { a: 1 };
		o.self = o;
		let count = 0;
		expect(() =>
			breadthFirst(o, () => {
				count++;
			}),
		).not.toThrow();
		expect(count).toBe(3); // root, a, self
	});

	test('mapBfs immutably updates array elements; original untouched', () => {
		const obj = { list: [{ n: 1 }, { n: 2 }] };
		const out = mapBfs(obj, (ctx, v) => {
			if (ctx.key === 'n') ctx.update(v * 10);
		});
		expect(out).toEqual({ list: [{ n: 10 }, { n: 20 }] });
		expect(obj.list[0].n).toBe(1);
	});

	test('descendIntoMapSet visits map entries breadth-first', () => {
		const m = new Map([['k', { v: 1 }]]);
		const leaf = paths(m, { descendIntoMapSet: true }).filter((p) => p.length === 2);
		expect(leaf.length).toBeGreaterThan(0);
	});
});

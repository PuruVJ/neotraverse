import { describe, expect, test } from 'vitest';
import { forEachAsync, mapAsync, paths } from '../src/index';
import { Traverse } from '../src/modern';

const base = { a: 1, b: { c: 2 }, d: [3, 4] };

describe('functional async', () => {
	test('forEachAsync mutates in place', async () => {
		const syncObj = structuredClone(base);
		new Traverse(syncObj).forEach((ctx, x) => {
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

	test('mapAsync leaves the original intact', async () => {
		const sync = new Traverse(structuredClone(base)).map((ctx, x) => {
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
		expect(original).toEqual(base);
	});

	test('signal abort before and during walk', async () => {
		const early = new AbortController();
		early.abort();
		await expect(forEachAsync({ a: 1 }, async () => {}, { signal: early.signal })).rejects.toThrow();

		const mid = new AbortController();
		let count = 0;
		await expect(
			forEachAsync({ a: 1, b: 2, c: 3, d: 4 }, async () => {
				count++;
				if (count === 2) mid.abort();
			}, { signal: mid.signal }),
		).rejects.toThrow();
		expect(count).toBeLessThan(5);
	});

	test('maxDepth in async walks', async () => {
		const deep = { a: { b: { c: { d: 1 } } } };
		await expect(forEachAsync(deep, async () => {}, { maxDepth: 2 })).rejects.toThrow(RangeError);
	});
});

describe('functional async — concurrency robustness (A-1)', () => {
	const collect = async (concurrency: any) => {
		const seen: PropertyKey[] = [];
		await forEachAsync(
			{ a: 1, b: 2, c: 3, d: 4 },
			async (ctx) => {
				if (!ctx.isRoot) seen.push(ctx.key!);
			},
			{ concurrency },
		);
		return seen.sort();
	};

	test('NaN / fractional / zero concurrency still visit every node', async () => {
		expect(await collect(NaN)).toEqual(['a', 'b', 'c', 'd']);
		expect(await collect(1.5)).toEqual(['a', 'b', 'c', 'd']);
		expect(await collect(0)).toEqual(['a', 'b', 'c', 'd']);
		expect(await collect(2.9)).toEqual(['a', 'b', 'c', 'd']);
	});

	test('concurrency > 1 actually overlaps siblings', async () => {
		let active = 0;
		let max = 0;
		await forEachAsync(
			{ a: 0, b: 0, c: 0 },
			async () => {
				active++;
				max = Math.max(max, active);
				await new Promise((r) => setTimeout(r, 5));
				active--;
			},
			{ concurrency: 3 },
		);
		expect(max).toBeGreaterThan(1);
	});
});

describe('functional async — circular, map/set, error (A-2)', () => {
	test('circular graph visits the back-edge once and terminates', async () => {
		const o: any = { a: 1 };
		o.self = o;
		let count = 0;
		await forEachAsync(o, async () => {
			count++;
		});
		expect(count).toBe(3);
	});

	test('descendIntoMapSet visits map entries', async () => {
		const m = new Map([['k', { v: 1 }]]);
		let leaves = 0;
		await forEachAsync(
			m,
			async (ctx) => {
				if (ctx.path.length === 2) leaves++;
			},
			{ descendIntoMapSet: true },
		);
		expect(leaves).toBeGreaterThan(0);
		// sanity: sync paths agree on shape
		expect(paths(m, { descendIntoMapSet: true }).some((p) => p.length === 2)).toBe(true);
	});

	test('a throwing callback rejects the walk', async () => {
		await expect(
			forEachAsync({ a: 1, b: 2 }, async (ctx) => {
				if (ctx.key === 'a') throw new Error('boom');
			}),
		).rejects.toThrow('boom');
	});

	test('mapAsync leaves the original intact and applies updates', async () => {
		const original = { a: 1, b: { c: 2 } };
		const out = await mapAsync(original, async (ctx, x) => {
			if (typeof x === 'number') ctx.update(x * 10);
		});
		expect(out).toEqual({ a: 10, b: { c: 20 } });
		expect(original).toEqual({ a: 1, b: { c: 2 } });
	});
});

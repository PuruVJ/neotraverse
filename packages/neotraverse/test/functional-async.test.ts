import { describe, expect, test } from 'vitest';
import { forEachAsync, mapAsync, Traverse } from '../src/modern';

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

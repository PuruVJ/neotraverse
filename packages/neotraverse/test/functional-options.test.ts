import { describe, expect, test } from 'vite-plus/test';
import { clone, entries, forEach, get, has, map } from '../src/index';
import { Traverse } from '../src/modern';

describe('functional options', () => {
	test('map forces immutable; forEach with immutable matches class', () => {
		const base = { a: 1, b: { c: 2 } };
		const mapped = map(structuredClone(base), (ctx, x) => {
			if (typeof x === 'number') ctx.update(x * 2);
		});
		expect(base).toEqual({ a: 1, b: { c: 2 } });
		expect(mapped.b.c).toBe(4);

		const immFn = structuredClone(base);
		forEach(
			immFn,
			(ctx, x) => {
				if (typeof x === 'number') ctx.update(x * 2);
			},
			{ immutable: true },
		);
		const immClass = structuredClone(base);
		new Traverse(immClass, { immutable: true }).forEach((ctx, x) => {
			if (typeof x === 'number') ctx.update(x * 2);
		});
		expect(immFn).toEqual(immClass);
		expect(base).toEqual({ a: 1, b: { c: 2 } });
	});

	test('includeSymbols', () => {
		const sym = Symbol('s');
		const withSym = { a: 1, [sym]: 2 };
		expect([...entries(withSym)]).toHaveLength(2);
		expect([...entries(withSym, { includeSymbols: true })]).toHaveLength(3);

		let fnCount = 0;
		forEach(
			withSym,
			() => {
				fnCount++;
			},
			{ includeSymbols: true },
		);
		let classCount = 0;
		new Traverse(withSym, { includeSymbols: true }).forEach(() => {
			classCount++;
		});
		expect(fnCount).toBe(classCount);

		const cloned = clone(withSym, { includeSymbols: true });
		expect(Object.getOwnPropertySymbols(cloned)).toHaveLength(1);
		expect(get(withSym, [sym], { includeSymbols: true })).toBe(2);
		expect(has(withSym, [sym], { includeSymbols: true })).toBe(true);
	});

	test('maxDepth throws on forEach, clone, and mid-entries iteration', () => {
		const deep = { a: { b: { c: 1 } } };
		expect(() => forEach(deep, () => {}, { maxDepth: 1 })).toThrow(RangeError);
		expect(() => clone(deep, { maxDepth: 1 })).toThrow(RangeError);
		expect(() => [...entries(deep, { maxDepth: 1 })]).toThrow(RangeError);
	});
});

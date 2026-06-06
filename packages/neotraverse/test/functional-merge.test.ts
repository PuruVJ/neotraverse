import { afterEach, describe, expect, test } from 'vitest';
import { merge } from '../src/modern';

/**
 * Behavior spec for merge (audit C-12, C-14) + the documented merge contracts.
 * RED until the maxDepth/proto fixes land.
 */

afterEach(() => {
	delete (Object.prototype as any).x;
});

describe('merge — base contracts', () => {
	test('deep-merges plain objects, does not mutate target', () => {
		const target = { a: { x: 1 }, arr: [1, 2] };
		const out = merge(target, { a: { y: 2 }, arr: [9] });
		expect(out).toEqual({ a: { x: 1, y: 2 }, arr: [9] });
		expect(target.a).toEqual({ x: 1 });
	});

	test('array concat option', () => {
		expect(merge({ arr: [1] }, { arr: [2, 3] }, { array: 'concat' })).toEqual({ arr: [1, 2, 3] });
	});

	test('result shares no references with target or source (full independence, P-3)', () => {
		const target = { kept: { deep: { n: 1 } }, list: [{ a: 1 }], both: { x: 1 } };
		const source = { both: { y: 2 }, extra: { z: 3 } };
		const out = merge(target, source);

		// mutating the result must not touch the inputs anywhere
		out.kept.deep.n = 999;
		out.list[0].a = 999;
		out.both.x = 999;
		out.extra.z = 999;
		expect(target.kept.deep.n).toBe(1);
		expect(target.list[0].a).toBe(1);
		expect(target.both.x).toBe(1);
		expect(source.extra.z).toBe(3);

		// kept-from-target branches are clones, not the same reference
		const out2 = merge(target, {});
		expect(out2.kept).not.toBe(target.kept);
		expect(out2.list).not.toBe(target.list);
		expect(out2.list[0]).not.toBe(target.list[0]);
	});

	test('concat clones elements from both sides (no aliasing)', () => {
		const target = { arr: [{ a: 1 }] };
		const out = merge(target, { arr: [{ b: 2 }] }, { array: 'concat' });
		expect(out.arr).toEqual([{ a: 1 }, { b: 2 }]);
		out.arr[0].a = 999;
		expect(target.arr[0].a).toBe(1); // concat element is a clone, not aliased
	});

	test('preserves target key order; source-only keys appended', () => {
		const out = merge({ a: 1, b: 2, c: 3 }, { b: 20, d: 4 });
		expect(Object.keys(out)).toEqual(['a', 'b', 'c', 'd']);
	});

	test('Maps deep-merge by key; Sets are replaced wholesale', () => {
		const m = merge({ m: new Map([['a', { x: 1 }]]) }, { m: new Map([['a', { y: 2 }]]) });
		expect([...m.m]).toEqual([['a', { x: 1, y: 2 }]]);

		const s = merge({ s: new Set([1, 2]) }, { s: new Set([3]) });
		expect([...s.s]).toEqual([3]);
	});
});

describe('merge — maxDepth degrades, does not throw (C-12)', () => {
	test('past the depth limit, the source subtree replaces (whole, cloned)', () => {
		const target = { a: { b: { c: { d: 1 } } } };
		const source = { a: { b: { c: { d: 2, e: 3 } } } };
		let out: any;
		expect(() => {
			out = merge(target, source, { maxDepth: 2 });
		}).not.toThrow();
		expect(out.a.b).toEqual({ c: { d: 2, e: 3 } });
	});
});

describe('merge — hostile source (C-14)', () => {
	test('does not pollute the global prototype', () => {
		const out = merge({ a: 1 }, JSON.parse('{"__proto__":{"x":1},"b":2}'));
		expect(({} as any).x).toBeUndefined();
		expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
		expect(out.b).toBe(2);
	});

	test('keeps an injected __proto__ as an inert own data key (parity with clone, not silently dropped)', () => {
		const out = merge({ a: 1 }, JSON.parse('{"__proto__":{"x":1},"b":2}'));
		expect(Object.prototype.hasOwnProperty.call(out, '__proto__')).toBe(true);
		expect((out as any).x).toBeUndefined();
	});
});

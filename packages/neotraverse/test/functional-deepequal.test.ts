import { describe, expect, test } from 'vitest';
import { deepEqual } from '../src/index';

/**
 * Behavior spec for deepEqual (audit C-17 SameValueZero, C-15, S-1).
 * RED until SameValueZero + depth bound land.
 */

describe('deepEqual — SameValueZero (C-17)', () => {
	test('NaN equals NaN', () => {
		expect(deepEqual(NaN, NaN)).toBe(true);
		expect(deepEqual({ a: NaN }, { a: NaN })).toBe(true);
		expect(deepEqual([NaN], [NaN])).toBe(true);
		expect(deepEqual(new Float64Array([NaN]), new Float64Array([NaN]))).toBe(true);
	});

	test('-0 equals 0', () => {
		expect(deepEqual(-0, 0)).toBe(true);
		expect(deepEqual({ a: -0 }, { a: 0 })).toBe(true);
	});

	test('still distinguishes genuinely different values', () => {
		expect(deepEqual(NaN, 0)).toBe(false);
		expect(deepEqual(1, 2)).toBe(false);
		expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
	});
});

describe('deepEqual — collections & cycles', () => {
	test('Maps with primitive keys compare values deeply', () => {
		expect(deepEqual(new Map([['a', { x: 1 }]]), new Map([['a', { x: 1 }]]))).toBe(true);
		expect(deepEqual(new Map([['a', { x: 1 }]]), new Map([['a', { x: 2 }]]))).toBe(false);
	});

	test('Sets compare structurally', () => {
		expect(deepEqual(new Set([{ x: 1 }, { x: 2 }]), new Set([{ x: 2 }, { x: 1 }]))).toBe(true);
		expect(deepEqual(new Set([{ x: 1 }]), new Set([{ x: 2 }]))).toBe(false);
	});

	test('circular graphs do not infinite-loop', () => {
		const a: any = {};
		a.self = a;
		const b: any = {};
		b.self = b;
		expect(deepEqual(a, b)).toBe(true);
	});

	test('custom compareFn short-circuits', () => {
		expect(deepEqual(1, 2, { compareFn: () => true })).toBe(true);
	});

	test('boxed primitives', () => {
		expect(deepEqual(new String('a'), new String('a'))).toBe(true);
		expect(deepEqual(new String('a'), 'a')).toBe(false);
	});
});

describe('deepEqual — depth bounding (S-1)', () => {
	function deep(n: number): any {
		const root: any = {};
		let cur = root;
		for (let i = 0; i < n; i++) cur = cur.next = {};
		return root;
	}
	test('honors maxDepth instead of overflowing the stack', () => {
		expect(() => deepEqual(deep(5000), deep(5000), { maxDepth: 50 } as any)).toThrow(/maximum traversal depth/);
	});
});

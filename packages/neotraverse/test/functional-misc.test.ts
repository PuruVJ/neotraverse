import { describe, expect, test } from 'vitest';
import { clone, freeze, getType, map, parseDotPath, parsePath, toJSON } from '../src/modern';

/**
 * Behavior spec for assorted contracts (audit C-9, C-13, C-18, getType).
 */

describe('immutable writeback into Map/Set entries (C-9)', () => {
	test('map() updates a Map entry under descendIntoMapSet; original untouched', () => {
		const src = { mp: new Map([['k', 1]]) };
		const out = map(
			src,
			(ctx, x) => {
				if (ctx.key === 'k') ctx.update((x as number) * 99);
			},
			{ descendIntoMapSet: true },
		);
		expect(out.mp.get('k')).toBe(99);
		expect(src.mp.get('k')).toBe(1);
	});

	test('map() rewrites Set members under descendIntoMapSet', () => {
		const src = { st: new Set([1, 2]) };
		const out = map(
			src,
			(ctx, x) => {
				if (typeof x === 'number') ctx.update(x * 10);
			},
			{ descendIntoMapSet: true },
		);
		expect([...out.st].sort((a, b) => a - b)).toEqual([10, 20]);
		expect([...src.st]).toEqual([1, 2]);
	});
});

describe('getType', () => {
	test('errors classify as error (consistent with clone)', () => {
		expect(getType(new Error('x'))).toBe('error');
		expect(getType(new TypeError('x'))).toBe('error');
		expect(getType(clone(new TypeError('x')))).toBe('error');
	});
});

describe('toJSON', () => {
	test('serializes bigint as a string and drops functions/symbols', () => {
		expect(JSON.parse(toJSON({ n: 10n, f: () => {}, ok: 1 }))).toEqual({ n: '10', ok: 1 });
	});

	test('does not throw on cycles (replaces with null by default)', () => {
		const o: any = { a: 1 };
		o.self = o;
		expect(JSON.parse(toJSON(o))).toEqual({ a: 1, self: null });
	});

	test('Map/Set serialize as {} (documented JSON.stringify behavior)', () => {
		expect(JSON.parse(toJSON({ m: new Map([['a', 1]]) }))).toEqual({ m: {} });
	});
});

describe('freeze', () => {
	test('deeply freezes plain object/array structure', () => {
		const obj = { a: { b: [1, 2] } };
		freeze(obj);
		expect(Object.isFrozen(obj)).toBe(true);
		expect(Object.isFrozen(obj.a)).toBe(true);
		expect(Object.isFrozen(obj.a.b)).toBe(true);
	});
});

describe('coerceKey — numeric precision (C-13)', () => {
	test('canonical small integers coerce to number', () => {
		expect(parseDotPath('a.8.b')).toEqual(['a', 8, 'b']);
		expect(parsePath('/a/0')).toEqual(['a', 0]);
	});

	test('leading-zero and oversized numeric segments stay strings (no corruption)', () => {
		expect(parseDotPath('a.08.b')).toEqual(['a', '08', 'b']);
		expect(parseDotPath('a.007')).toEqual(['a', '007']);
		expect(parseDotPath('a.' + '9'.repeat(20))).toEqual(['a', '9'.repeat(20)]);
	});
});

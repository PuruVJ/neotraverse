import { afterEach, describe, expect, test } from 'vite-plus/test';
import { filterPaths, findPaths, get, has, paths, select, set } from '../src/index';

/**
 * Behavior spec for path navigation/representation (audit C-2, C-10, C-11, S-3).
 * RED until the fixes land.
 */

const PROBE_KEYS = ['polluted', 'x'] as const;
afterEach(() => {
	for (const k of PROBE_KEYS) delete (Object.prototype as any)[k];
});

describe('get/has — falsy intermediate node (C-2)', () => {
	test('a falsy value mid-path is not a match for deeper keys', () => {
		expect(has({ a: 0 }, ['a', 'b'])).toBe(false);
		expect(get({ a: 0 }, ['a', 'b'])).toBeUndefined();
		expect(has({ a: null }, ['a', 'b'])).toBe(false);
		expect(has({ a: '' }, ['a', 'b', 'c'])).toBe(false);
		expect(has({ a: false }, ['a', 'b'])).toBe(false);
	});

	test('a falsy LEAF is still found', () => {
		expect(has({ a: 0 }, ['a'])).toBe(true);
		expect(get({ a: 0 }, ['a'])).toBe(0);
		expect(get({ a: { b: 0 } }, ['a', 'b'])).toBe(0);
		expect(has({ a: { b: false } }, ['a', 'b'])).toBe(true);
	});

	test('missing key returns false/undefined', () => {
		expect(has({ a: { b: 1 } }, ['a', 'z'])).toBe(false);
		expect(get({ a: { b: 1 } }, ['a', 'z'])).toBeUndefined();
	});
});

describe('paths — array indices are numbers (C-10)', () => {
	test('walk/paths emit numeric array indices', () => {
		expect(paths([10, 20])).toEqual([[], [0], [1]]);
		expect(paths({ list: [{ n: 1 }] })).toEqual([[], ['list'], ['list', 0], ['list', 0, 'n']]);
	});

	test('object keys that merely look numeric stay strings', () => {
		expect(paths({ '0': 'x' })).toEqual([[], ['0']]);
	});

	test('select / findPaths / filterPaths report numeric indices', () => {
		const tree = { users: [{ email: 'a@x.com' }, { email: 'b@x.com' }] };
		const hits = select(tree, 'users[*].email');
		expect(hits[1].path).toEqual(['users', 1, 'email']);
		expect(findPaths(tree, (_, v) => v === 'b@x.com')).toEqual(['users', 1, 'email']);
		expect(filterPaths(tree, (ctx) => ctx.key === 'email').map((p) => p.path)).toEqual([
			['users', 0, 'email'],
			['users', 1, 'email'],
		]);
	});
});

describe('set — autovivification + safety (C-11, S-3)', () => {
	test('numeric path segment creates an array, string creates an object', () => {
		const o: any = {};
		set(o, ['a', 0, 'x'], 1);
		expect(Array.isArray(o.a)).toBe(true);
		expect(o.a[0]).toEqual({ x: 1 });

		const p: any = {};
		set(p, ['a', 'b', 'c'], 1);
		expect(p).toEqual({ a: { b: { c: 1 } } });
	});

	test('a rejected unsafe path performs NO partial mutation and does not pollute', () => {
		const o: any = {};
		set(o, ['a', '__proto__', 'x'], 9);
		expect(o).toEqual({}); // nothing written, not even the intermediate `a`
		expect(({} as any).x).toBeUndefined();
		expect((Object.prototype as any).polluted).toBeUndefined();
	});

	test('safe paths still write', () => {
		const o: any = { a: { b: 1 } };
		set(o, ['a', 'c'], 2);
		expect(o.a).toEqual({ b: 1, c: 2 });
	});
});

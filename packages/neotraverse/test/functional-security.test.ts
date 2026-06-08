import { afterEach, describe, expect, test } from 'vitest';
import { clone, deepEqual, diff, get, has, merge, set } from '../src/index';

const PROBE_KEYS = ['polluted', 'isAdmin', 'pp'] as const;

function protoIsClean(): boolean {
	const proto = Object.prototype as any;
	return PROBE_KEYS.every((k) => proto[k] === undefined) && ({} as any).polluted === undefined;
}

afterEach(() => {
	for (const k of PROBE_KEYS) delete (Object.prototype as any)[k];
});

describe('functional security', () => {
	test('set refuses prototype pollution keys', () => {
		const o: any = {};
		expect(set(o, ['__proto__', 'polluted'], 'yes')).toBe('yes');
		expect(({} as any).polluted).toBeUndefined();
		expect(set(o, ['constructor', 'prototype', 'pp'], 'yes')).toBe('yes');
		expect(protoIsClean()).toBe(true);
	});

	test('clone of hostile JSON keeps real prototype', () => {
		const evil = JSON.parse('{"user":"bob","__proto__":{"isAdmin":true}}');
		const safe = clone(evil);
		expect(({} as any).isAdmin).toBeUndefined();
		expect((safe as any).isAdmin).toBeUndefined();
		expect(Object.getPrototypeOf(safe)).toBe(Object.prototype);
		expect(safe.user).toBe('bob');
		expect(protoIsClean()).toBe(true);
	});

	test('get/has follow own properties only', () => {
		const inherited = Object.create({ secret: 1 });
		expect(get(inherited, ['secret'])).toBeUndefined();
		expect(has(inherited, ['secret'])).toBe(false);
		expect(has({ a: 1 }, ['a'])).toBe(true);
	});

	test('set with a rejected unsafe path performs NO partial mutation (S-3)', () => {
		const o: any = {};
		set(o, ['a', '__proto__', 'x'], 9);
		expect(o).toEqual({});
		expect(({} as any).x).toBeUndefined();
		expect(protoIsClean()).toBe(true);
	});

	test('merge of hostile JSON never pollutes the prototype (C-14)', () => {
		merge({ a: 1 }, JSON.parse('{"__proto__":{"polluted":"yes"},"b":2}'));
		expect(({} as any).polluted).toBeUndefined();
		expect(protoIsClean()).toBe(true);
	});
});

describe('functional DoS bounding (S-1)', () => {
	function deep(n: number): any {
		const root: any = {};
		let cur = root;
		for (let i = 0; i < n; i++) cur = cur.next = {};
		return root;
	}

	test('deepEqual bounds depth instead of overflowing the native stack', () => {
		expect(() => deepEqual(deep(8000), deep(8000), { maxDepth: 100 } as any)).toThrow(/maximum traversal depth/);
	});

	test('diff bounds depth instead of overflowing the native stack', () => {
		expect(() => diff(deep(8000), deep(8000), { maxDepth: 100 } as any)).toThrow(/maximum traversal depth/);
	});
});

import { afterEach, describe, expect, test } from 'vitest';
import { clone, get, has, set } from '../src/modern';

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
});

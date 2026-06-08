import { describe, expect, test } from 'vitest';
import { clone, getType } from '../src/index';

/**
 * Behavior spec for clone() of exotic types (audit C-8, C-16, P-1).
 * RED until Error-preservation / RegExp-lastIndex / single-read clone land.
 */

describe('clone(Error) — preserve type (C-8)', () => {
	test('keeps instanceof, name, message, stack, and own props', () => {
		const e: any = new TypeError('boom');
		e.code = 42;
		const c: any = clone(e);
		expect(c).toBeInstanceOf(TypeError);
		expect(c).toBeInstanceOf(Error);
		expect(c.name).toBe('TypeError');
		expect(c.message).toBe('boom');
		expect(typeof c.stack).toBe('string');
		expect(c.code).toBe(42);
		expect(getType(c)).toBe('error');
	});

	test('preserves cause', () => {
		const c: any = clone(new Error('x', { cause: 42 }));
		expect(c.cause).toBe(42);
	});
});

describe('clone(RegExp) — preserve lastIndex (C-16)', () => {
	test('copies source, flags, and lastIndex', () => {
		const re = /ab/g;
		re.lastIndex = 3;
		const c = clone(re);
		expect(c.source).toBe('ab');
		expect(c.flags).toBe('g');
		expect(c.lastIndex).toBe(3);
		expect(c).not.toBe(re);
	});
});

describe('clone — reads each property exactly once (P-1)', () => {
	test('getters fire once', () => {
		let reads = 0;
		const src: any = {};
		for (let i = 0; i < 5; i++) {
			Object.defineProperty(src, 'k' + i, {
				enumerable: true,
				configurable: true,
				get() {
					reads++;
					return i;
				},
			});
		}
		clone(src);
		expect(reads).toBe(5);
	});
});

describe('clone — binary & sparse', () => {
	test('preserves array holes (sparseness)', () => {
		const c = clone([1, , 3] as any);
		expect(c.length).toBe(3);
		expect(1 in c).toBe(false);
	});

	test('DataView with a byteOffset clones bytes independently', () => {
		const buf = new Uint8Array([1, 2, 3, 4]).buffer;
		const view = new DataView(buf, 1, 2);
		const c = clone(view);
		expect(c).not.toBe(view);
		expect(c.byteLength).toBe(2);
		expect(c.getUint8(0)).toBe(2);
		c.setUint8(0, 99);
		expect(view.getUint8(0)).toBe(2); // original untouched
	});

	test('typed array clones independently', () => {
		const ta = new Uint8Array([1, 2, 3]);
		const c = clone(ta);
		c[0] = 9;
		expect(ta[0]).toBe(1);
	});
});

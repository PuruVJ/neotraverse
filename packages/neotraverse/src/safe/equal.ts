// Structural equality with an explicit per-type contract. SameValueZero leaves
// (NaN equals NaN, -0 equals 0), fixed contracts for Date/RegExp/Error/typed
// arrays/Map/Set, cycle-safe via a pair memo. Keeps the `compare` escape hatch
// (cheaper than normalize-then-equal). Ported from the v1 engine.

import { assert_depth, has_own, same_value_zero, type_tag } from './kernel/keys.js';

export interface EqualOptions {
	/** Per-pair override; return a boolean to decide, or `undefined` to fall through. */
	compare?: (a: unknown, b: unknown) => boolean | undefined;
	/** Include own enumerable symbol keys. @default false */
	symbols?: boolean;
	/** Max comparison depth; RangeError beyond. Unlimited when omitted. */
	maxDepth?: number;
}

const get_symbols = Object.getOwnPropertySymbols;
const is_enumerable = Object.prototype.propertyIsEnumerable;

function is_boxed(obj: unknown): boolean {
	const tag = Object.prototype.toString.call(obj);
	if (tag !== '[object Boolean]' && tag !== '[object Number]' && tag !== '[object String]') return false;
	try {
		return typeof (obj as { valueOf(): unknown }).valueOf() !== 'object';
	} catch {
		return false;
	}
}

function own_keys(obj: object, symbols: boolean): PropertyKey[] {
	const keys: PropertyKey[] = Object.keys(obj);
	if (symbols) {
		const syms = get_symbols(obj);
		for (let i = 0; i < syms.length; i++) {
			if (is_enumerable.call(obj, syms[i])) keys.push(syms[i]);
		}
	}
	return keys;
}

function equal_pair(
	a: any,
	b: any,
	compare: ((a: any, b: any) => boolean | undefined) | undefined,
	symbols: boolean,
	seen: Map<any, Set<any>>,
	maxDepth: number | undefined,
	depth: number,
): boolean {
	if (a === b) return true;
	assert_depth(depth, maxDepth);
	if (compare) {
		const custom = compare(a, b);
		if (custom !== undefined) return custom;
	}
	if (typeof a !== typeof b) return false;
	if (a === null || b === null) return a === b;
	if (is_boxed(a) || is_boxed(b)) {
		if (!is_boxed(a) || !is_boxed(b)) return false;
		return same_value_zero(Object(a).valueOf(), Object(b).valueOf());
	}
	const ta = type_tag(a);
	const tb = type_tag(b);
	if (ta !== tb) return false;
	if (ta === 'primitive' || ta === 'null') return same_value_zero(a, b);

	if (typeof a === 'object') {
		let bs = seen.get(a);
		if (bs?.has(b)) return true;
		if (!bs) {
			bs = new Set();
			seen.set(a, bs);
		}
		bs.add(b);
	}

	switch (ta) {
		case 'date':
			return (a as Date).getTime() === (b as Date).getTime();
		case 'regexp':
			return a.source === b.source && a.flags === b.flags;
		case 'error':
			return a.message === b.message && a.name === b.name;
		case 'arraybuffer': {
			if (a.byteLength !== b.byteLength) return false;
			const va = new Uint8Array(a);
			const vb = new Uint8Array(b);
			for (let i = 0; i < va.length; i++) if (va[i] !== vb[i]) return false;
			return true;
		}
		case 'dataview': {
			if (a.byteLength !== b.byteLength) return false;
			for (let i = 0; i < a.byteLength; i++) if (a.getUint8(i) !== b.getUint8(i)) return false;
			return true;
		}
		case 'typed-array': {
			if (a.length !== b.length) return false;
			for (let i = 0; i < a.length; i++) if (!same_value_zero(a[i], b[i])) return false;
			return true;
		}
		case 'map': {
			if (a.size !== b.size) return false;
			for (const [k, v] of a) {
				if (!b.has(k) || !equal_pair(v, b.get(k), compare, symbols, seen, maxDepth, depth + 1)) return false;
			}
			return true;
		}
		case 'set': {
			if (a.size !== b.size) return false;
			let allPrimitive = true;
			for (const v of a) {
				if (v !== null && (typeof v === 'object' || typeof v === 'function')) {
					allPrimitive = false;
					break;
				}
			}
			if (allPrimitive) {
				for (const v of a) if (!b.has(v)) return false;
				return true;
			}
			const used = new Set<number>();
			for (const v of a) {
				let matched = false;
				let i = 0;
				for (const w of b) {
					if (!used.has(i) && equal_pair(v, w, compare, symbols, seen, maxDepth, depth + 1)) {
						used.add(i);
						matched = true;
						break;
					}
					i++;
				}
				if (!matched) return false;
			}
			return true;
		}
		case 'weakmap':
		case 'weakset':
		case 'function':
			return a === b;
		case 'array': {
			if (a.length !== b.length) return false;
			for (let i = 0; i < a.length; i++) {
				if (!equal_pair(a[i], b[i], compare, symbols, seen, maxDepth, depth + 1)) return false;
			}
			return true;
		}
		default: {
			const ka = own_keys(a, symbols);
			const kb = own_keys(b, symbols);
			if (ka.length !== kb.length) return false;
			for (let i = 0; i < ka.length; i++) {
				const k = ka[i];
				if (!has_own.call(b, k)) return false;
				if (!equal_pair(a[k], b[k], compare, symbols, seen, maxDepth, depth + 1)) return false;
			}
			return true;
		}
	}
}

/**
 * Structural equality.
 *
 * @example
 * ```js
 * equal({ a: [1] }, { a: [1] }); // true
 * equal(new Date(0), new Date(0)); // true
 * ```
 */
export function equal(a: unknown, b: unknown, options?: EqualOptions): boolean {
	return equal_pair(a, b, options?.compare, !!options?.symbols, new Map(), options?.maxDepth, 0);
}

// ---------------------------------------------------------------------------
// In-source unit tests.
// ---------------------------------------------------------------------------
if (import.meta.vitest) {
	const { describe, it, expect } = import.meta.vitest;

	describe('equal: structural', () => {
		it('deep objects and arrays', () => {
			expect(equal({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
			expect(equal({ a: 1 }, { a: 2 })).toBe(false);
			expect(equal({ a: 1 }, { a: 1, b: 2 })).toBe(false);
		});
		it('SameValueZero leaves', () => {
			expect(equal(NaN, NaN)).toBe(true);
			expect(equal(-0, 0)).toBe(true);
		});
		it('per-type contracts', () => {
			expect(equal(new Date(0), new Date(0))).toBe(true);
			expect(equal(/x/g, /x/g)).toBe(true);
			expect(equal(/x/g, /x/i)).toBe(false);
			expect(equal(new Map([['a', 1]]), new Map([['a', 1]]))).toBe(true);
			expect(equal(new Set([1, 2]), new Set([2, 1]))).toBe(true);
			expect(equal(new Uint8Array([1, 2]), new Uint8Array([1, 2]))).toBe(true);
		});
		it('cycle-safe', () => {
			const a: any = {};
			a.self = a;
			const b: any = {};
			b.self = b;
			expect(equal(a, b)).toBe(true);
		});
		it('compare hook overrides, undefined falls through', () => {
			const compare = (x: any, y: any) => (typeof x === 'number' && typeof y === 'number' ? Math.abs(x - y) < 0.01 : undefined);
			expect(equal({ n: 1.0001 }, { n: 1.0 }, { compare })).toBe(true);
			expect(equal({ n: 1 }, { n: 2 }, { compare })).toBe(false);
		});
	});
}

// v2 kernel — THE single definition of "children", plus the shared low-level
// semantics every operation consumes: key listing, child access, type tags,
// shallow shells for copy-on-write, pollution-safe writes, and depth bounds.
// Leaf module: depends on nothing else in the package. Every export is
// independently tree-shakeable; importing one helper never pulls the cursor.

/** Shared option bits understood by every traversing op (law 4). */
export interface KeyOptions {
	/** Include own enumerable symbol keys. @default false */
	symbols?: boolean;
	/** Descend into Map/Set recursively at every level. @default false */
	mapSet?: boolean;
	/** RangeError past this depth — the untrusted-input bound. Unlimited when omitted. */
	maxDepth?: number;
}

export const object_keys = Object.keys;
export const has_own = Object.prototype.hasOwnProperty;
export const get_proto = Object.getPrototypeOf;
export const object_proto = Object.prototype;
export const is_array = Array.isArray;
const get_symbols = Object.getOwnPropertySymbols;
const is_enumerable = Object.prototype.propertyIsEnumerable;
const to_string = (x: unknown) => Object.prototype.toString.call(x);

// SameValueZero: `===` plus NaN equals NaN (-0 equals 0 via `===`).
export const same_value_zero = (x: any, y: any): boolean => x === y || (x !== x && y !== y);

/** Locked type-tag union (carried over from v1 `getType`, internal in v2). */
export type TypeTag =
	| 'null'
	| 'primitive'
	| 'function'
	| 'array'
	| 'object'
	| 'date'
	| 'regexp'
	| 'map'
	| 'set'
	| 'weakmap'
	| 'weakset'
	| 'typed-array'
	| 'arraybuffer'
	| 'dataview'
	| 'error';

// Exclude DataView by tag, not instanceof, so a cross-realm DataView isn't
// misread as a typed array.
export const is_typed_array = (value: unknown): boolean =>
	ArrayBuffer.isView(value) && to_string(value) !== '[object DataView]';

export function type_tag(value: unknown): TypeTag {
	if (value === null) return 'null';
	const t = typeof value;
	if (t === 'function') return 'function';
	if (t !== 'object') return 'primitive';
	if (is_array(value)) return 'array';
	if (value instanceof Date) return 'date';
	if (value instanceof RegExp) return 'regexp';
	if (value instanceof Map) return 'map';
	if (value instanceof Set) return 'set';
	if (value instanceof WeakMap) return 'weakmap';
	if (value instanceof WeakSet) return 'weakset';
	if (is_typed_array(value)) return 'typed-array';
	if (value instanceof ArrayBuffer) return 'arraybuffer';
	if (value instanceof DataView) return 'dataview';
	if (value instanceof Error) return 'error';
	return 'object';
}

// ---------------------------------------------------------------------------
// Security: prototype-pollution guards (law 6)
// ---------------------------------------------------------------------------

// A boxed/object key string-coerces on assignment, so it must be coerced ONCE
// up-front or it could dodge a strict check while still firing the __proto__
// setter (TOCTOU).
export const is_unsafe_key = (key: PropertyKey): boolean => {
	const k = typeof key === 'object' && key !== null ? String(key) : key;
	return k === '__proto__' || k === 'constructor' || k === 'prototype';
};

/**
 * Assign without ever triggering the `__proto__` setter or mutating
 * [[Prototype]]. Injected data is neutralized as an inert own key, not dropped.
 */
export function safe_set(dst: any, key: PropertyKey, value: any): void {
	if (typeof key === 'object' && key !== null) key = String(key);
	if (key === '__proto__') {
		Object.defineProperty(dst, key, {
			value,
			writable: true,
			enumerable: true,
			configurable: true,
		});
	} else {
		dst[key] = value;
	}
}

/** Fail-closed write-path guard: TypeError before any partial mutation. */
export function assert_safe_write_path(keys: readonly PropertyKey[]): void {
	for (let i = 0; i < keys.length; i++) {
		if (is_unsafe_key(keys[i])) {
			throw new TypeError(`neotraverse: unsafe path segment "${String(keys[i])}"`);
		}
	}
}

/** Depth bound: catchable RangeError, never a native stack overflow. */
export function assert_depth(depth: number, max_depth: number | undefined): void {
	if (max_depth !== undefined && depth > max_depth) {
		throw new RangeError(`neotraverse: maximum depth (${max_depth}) exceeded`);
	}
}

// Canonical, safe integer segments coerce to numbers; everything else stays a
// string. Round-trip check rejects "08" and oversized segments.
const INT_RE = /^\d+$/;
export function coerce_key(segment: string): PropertyKey {
	if (INT_RE.test(segment)) {
		const n = Number(segment);
		if (Number.isSafeInteger(n) && String(n) === segment) return n;
	}
	return segment;
}

// ---------------------------------------------------------------------------
// The key model (law 1)
// ---------------------------------------------------------------------------

function own_keys(node: object, symbols: boolean): PropertyKey[] {
	const keys: PropertyKey[] = object_keys(node);
	if (symbols) {
		const syms = get_symbols(node);
		for (let i = 0; i < syms.length; i++) {
			if (is_enumerable.call(node, syms[i])) keys.push(syms[i]);
		}
	}
	return keys;
}

// Array index segments are numbers, not strings, so paths from the walk line
// up with get/set/patch. Dense arrays take the fast path (one index write per
// slot); sparse/extra-key arrays coerce per key.
function array_keys(node: any[], keys: PropertyKey[]): PropertyKey[] {
	const len = node.length;
	if (keys.length === len) {
		for (let i = 0; i < len; i++) keys[i] = i;
		return keys;
	}
	for (let i = 0; i < keys.length; i++) {
		const k = keys[i];
		if (typeof k === 'string' && '' + +k === k) keys[i] = +k;
	}
	return keys;
}

/**
 * Children of `node` under the one key model, or `null` for a leaf.
 * Map children are its values keyed by their Map keys; Set children are its
 * elements keyed by insertion index — recursively at every level when `mapSet`.
 */
export function list_keys(node: any, symbols: boolean, mapSet: boolean): PropertyKey[] | null {
	if (typeof node !== 'object' || node === null) return null;
	if (node instanceof Map) {
		if (!mapSet) return null;
		return [...node.keys()] as PropertyKey[];
	}
	if (node instanceof Set) {
		if (!mapSet) return null;
		const keys: PropertyKey[] = new Array(node.size);
		for (let i = 0; i < node.size; i++) keys[i] = i;
		return keys;
	}
	// Leaf-like exotics: no traversable string/symbol children.
	if (is_typed_array(node) || node instanceof ArrayBuffer || node instanceof DataView) return null;
	if (node instanceof WeakMap || node instanceof WeakSet) return null;
	const keys = own_keys(node, symbols);
	return is_array(node) ? array_keys(node, keys) : keys;
}

/** Child value at `key` under the same model `list_keys` used. */
export function child_at(node: any, key: PropertyKey, mapSet: boolean): any {
	if (mapSet && node instanceof Map) return node.get(key);
	if (mapSet && node instanceof Set) {
		let i = 0;
		for (const v of node) {
			if (i === key) return v;
			i++;
		}
		return undefined;
	}
	return node[key];
}

// ---------------------------------------------------------------------------
// Shallow shells for copy-on-write (the kept v1 make_shell, restructured to
// return a fully-populated shallow copy — no out-param flag)
// ---------------------------------------------------------------------------

/**
 * A shallow copy of container `src`: same prototype, same exotic identity
 * (Date/RegExp/Error/Map/Set), every own enumerable key/entry present with the
 * ORIGINAL child references. The COW fold overwrites only changed children.
 */
export function shallow_shell(src: any, symbols: boolean): any {
	if (is_array(src)) {
		const dst = new Array(src.length);
		const keys = own_keys(src, symbols);
		for (let i = 0; i < keys.length; i++) {
			const k = keys[i] as any;
			safe_set(dst, k, src[k]);
		}
		return dst;
	}
	if (src instanceof Map) return new Map(src);
	if (src instanceof Set) return new Set(src);

	const tag = to_string(src);
	let dst: any;
	if (tag === '[object Date]' && typeof src.getTime === 'function') {
		dst = new Date(src.getTime());
	} else if (tag === '[object RegExp]' && typeof src.source === 'string') {
		try {
			dst = new RegExp(src.source, src.flags);
			dst.lastIndex = src.lastIndex;
		} catch {
			dst = undefined; // spoofed/invalid — fall through to the generic copy
		}
	} else if (tag === '[object Error]') {
		const Ctor = typeof src.constructor === 'function' ? src.constructor : Error;
		try {
			dst = new Ctor(src.message);
		} catch {
			dst = new Error(src.message);
		}
		if (src.name !== dst.name) dst.name = src.name;
		if (src.stack !== undefined) dst.stack = src.stack;
		if ('cause' in src) dst.cause = (src as Error).cause;
	}
	if (dst === undefined) {
		const proto = get_proto(src);
		dst = proto === object_proto ? {} : Object.create(proto);
	}
	const keys = own_keys(src, symbols);
	for (let i = 0; i < keys.length; i++) {
		const k = keys[i] as any;
		safe_set(dst, k, src[k]);
	}
	return dst;
}

// ---------------------------------------------------------------------------
// In-source unit tests (stripped from the production build).
// ---------------------------------------------------------------------------
if (import.meta.vitest) {
	const { describe, it, expect } = import.meta.vitest;

	describe('type_tag', () => {
		it('classifies the core types', () => {
			expect(type_tag(null)).toBe('null');
			expect(type_tag(1)).toBe('primitive');
			expect(type_tag('s')).toBe('primitive');
			expect(type_tag([])).toBe('array');
			expect(type_tag({})).toBe('object');
			expect(type_tag(new Map())).toBe('map');
			expect(type_tag(new Set())).toBe('set');
			expect(type_tag(new Date())).toBe('date');
			expect(type_tag(/x/)).toBe('regexp');
			expect(type_tag(new Uint8Array(1))).toBe('typed-array');
			expect(type_tag(() => {})).toBe('function');
		});
	});

	describe('list_keys: the one key model', () => {
		it('array indices are numbers, then string keys', () => {
			const arr: any = ['a', 'b'];
			arr.extra = 'c';
			expect(list_keys(arr, false, false)).toEqual([0, 1, 'extra']);
		});
		it('Map/Set are leaves unless mapSet', () => {
			expect(list_keys(new Map([['a', 1]]), false, false)).toBe(null);
			expect(list_keys(new Map([['a', 1]]), false, true)).toEqual(['a']);
			expect(list_keys(new Set([9, 8]), false, true)).toEqual([0, 1]);
		});
		it('symbols only when requested', () => {
			const s = Symbol('s');
			const o = { a: 1, [s]: 2 };
			expect(list_keys(o, false, false)).toEqual(['a']);
			expect(list_keys(o, true, false)).toEqual(['a', s]);
		});
		it('primitives and leaf exotics have no children', () => {
			expect(list_keys(1, false, false)).toBe(null);
			expect(list_keys(new Uint8Array(2), false, false)).toBe(null);
		});
	});

	describe('child_at', () => {
		it('navigates plain, Map, and Set children', () => {
			expect(child_at({ a: 5 }, 'a', false)).toBe(5);
			expect(child_at(new Map([['k', 7]]), 'k', true)).toBe(7);
			expect(child_at(new Set(['x', 'y']), 1, true)).toBe('y');
		});
	});

	describe('safe_set / is_unsafe_key: pollution safety', () => {
		it('neutralizes __proto__ as an own key without polluting', () => {
			const o: any = {};
			safe_set(o, '__proto__', { polluted: true });
			expect(Object.getPrototypeOf(o)).toBe(Object.prototype);
			expect(has_own.call(o, '__proto__')).toBe(true);
		});
		it('flags the dangerous keys including boxed forms', () => {
			expect(is_unsafe_key('__proto__')).toBe(true);
			expect(is_unsafe_key('constructor')).toBe(true);
			expect(is_unsafe_key('prototype')).toBe(true);
			expect(is_unsafe_key('safe')).toBe(false);
			// eslint-disable-next-line no-new-wrappers
			expect(is_unsafe_key(new String('__proto__') as unknown as PropertyKey)).toBe(true);
		});
		it('assert_safe_write_path throws on any unsafe segment', () => {
			expect(() => assert_safe_write_path(['a', '__proto__'])).toThrow(TypeError);
			expect(() => assert_safe_write_path(['a', 'b'])).not.toThrow();
		});
	});

	describe('coerce_key', () => {
		it('coerces canonical integers only', () => {
			expect(coerce_key('0')).toBe(0);
			expect(coerce_key('42')).toBe(42);
			expect(coerce_key('08')).toBe('08'); // leading zero stays a string
			expect(coerce_key('name')).toBe('name');
		});
	});

	describe('shallow_shell: COW shells', () => {
		it('copies own keys with original child references, same prototype', () => {
			const child = { deep: 1 };
			const src = { a: child, b: 2 };
			const shell = shallow_shell(src, false);
			expect(shell).not.toBe(src);
			expect(shell.a).toBe(child); // shallow: child shared
			expect(Object.getPrototypeOf(shell)).toBe(Object.prototype);
		});
		it('preserves arrays, Dates, and Maps as their own type', () => {
			expect(is_array(shallow_shell([1, 2], false))).toBe(true);
			expect(shallow_shell(new Date(5), false) instanceof Date).toBe(true);
			expect(shallow_shell(new Map([['a', 1]]), false) instanceof Map).toBe(true);
		});
	});

	describe('same_value_zero', () => {
		it('NaN equals NaN, -0 equals 0', () => {
			expect(same_value_zero(NaN, NaN)).toBe(true);
			expect(same_value_zero(-0, 0)).toBe(true);
			expect(same_value_zero(1, 2)).toBe(false);
		});
	});
}

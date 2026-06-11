// Deep clone — the explicit "make this fully independent" verb that the
// structural-sharing contract composes with. Ported from the proven v1 engine:
// cycle-preserving (a Map of ancestor → its clone), prototype-preserving, and
// aware of Map / Set / Date / RegExp / Error(+cause) / typed arrays /
// ArrayBuffer / DataView / boxed primitives. A single write per key.

import {
	assert_depth,
	get_proto,
	is_array,
	is_typed_array,
	type KeyOptions,
	object_proto,
	safe_set,
} from './kernel/keys.js';

export interface CloneOptions {
	/** Include own enumerable symbol keys. @default false */
	symbols?: boolean;
	/** Max clone depth; RangeError beyond. Unlimited when omitted. */
	maxDepth?: number;
}

const get_symbols = Object.getOwnPropertySymbols;
const is_enumerable = Object.prototype.propertyIsEnumerable;
const object_keys = Object.keys;
const to_string = (x: unknown) => Object.prototype.toString.call(x);

function own_keys(obj: object, symbols: boolean): PropertyKey[] {
	const keys: PropertyKey[] = object_keys(obj);
	if (symbols) {
		const syms = get_symbols(obj);
		for (let i = 0; i < syms.length; i++) {
			if (is_enumerable.call(obj, syms[i])) keys.push(syms[i]);
		}
	}
	return keys;
}

function is_boxed_primitive(obj: unknown): boolean {
	const tag = to_string(obj);
	if (tag !== '[object Boolean]' && tag !== '[object Number]' && tag !== '[object String]')
		return false;
	try {
		return typeof (obj as { valueOf(): unknown }).valueOf() !== 'object';
	} catch {
		return false;
	}
}

// Build a fresh, keyed shell whose own keys the caller fills deeply. Leaf-like
// exotics (typed array, boxed, ArrayBuffer, DataView, Map, Set) are returned
// fully materialized with `keyed=false`.
let shell_keyed = false;
function make_shell(src: any): any {
	if (is_array(src)) {
		shell_keyed = true;
		return new Array(src.length);
	}
	shell_keyed = false;
	if (src instanceof ArrayBuffer) return src.slice(0);
	if (src instanceof DataView) {
		return new DataView(
			src.buffer.slice(src.byteOffset, src.byteOffset + src.byteLength),
			0,
			src.byteLength,
		);
	}
	if (is_typed_array(src)) return (src as any).slice();
	if (is_boxed_primitive(src)) return Object(src);

	const tag = to_string(src);
	if (tag === '[object Date]' && typeof src.getTime === 'function') {
		shell_keyed = true;
		return new Date(src.getTime());
	}
	if (tag === '[object RegExp]' && typeof src.source === 'string') {
		try {
			const re = new RegExp(src.source, src.flags);
			re.lastIndex = src.lastIndex;
			shell_keyed = true;
			return re;
		} catch {
			/* spoofed/invalid — fall through to a generic copy */
		}
	}
	if (tag === '[object Error]') {
		const Ctor = typeof src.constructor === 'function' ? src.constructor : Error;
		let dst: any;
		try {
			dst = new Ctor(src.message);
		} catch {
			dst = new Error(src.message);
		}
		if (src.name !== dst.name) dst.name = src.name;
		if (src.stack !== undefined) dst.stack = src.stack;
		if ('cause' in src) dst.cause = src.cause;
		shell_keyed = true;
		return dst;
	}
	// Cross-realm exotics missed by instanceof: detect by tag.
	if (tag === '[object Map]') return new Map(src as Iterable<[unknown, unknown]>);
	if (tag === '[object Set]') return new Set(src as Iterable<unknown>);

	shell_keyed = true;
	const proto = get_proto(src);
	return proto === object_proto ? {} : Object.create(proto);
}

function clone_node(
	src: any,
	seen: Map<object, any>,
	symbols: boolean,
	maxDepth: number | undefined,
	depth: number,
): any {
	if (typeof src !== 'object' || src === null) return src;
	assert_depth(depth, maxDepth);
	const existing = seen.get(src);
	if (existing !== undefined) return existing; // back-edge to an ancestor

	if (src instanceof Map) {
		const dst = new Map();
		seen.set(src, dst);
		for (const [k, v] of src) {
			dst.set(
				clone_node(k, seen, symbols, maxDepth, depth + 1),
				clone_node(v, seen, symbols, maxDepth, depth + 1),
			);
		}
		seen.delete(src);
		return dst;
	}
	if (src instanceof Set) {
		const dst = new Set();
		seen.set(src, dst);
		for (const v of src) dst.add(clone_node(v, seen, symbols, maxDepth, depth + 1));
		seen.delete(src);
		return dst;
	}
	if (src instanceof WeakMap || src instanceof WeakSet) {
		seen.set(src, src); // weak collections are not enumerable — share by reference
		return src;
	}

	const dst = make_shell(src);
	if (!shell_keyed) {
		seen.set(src, dst);
		return dst;
	}
	seen.set(src, dst);
	const keys = own_keys(src, symbols);
	for (let i = 0; i < keys.length; i++) {
		const key = keys[i];
		safe_set(dst, key, clone_node((src as any)[key], seen, symbols, maxDepth, depth + 1));
	}
	if (dst instanceof Error && 'cause' in (src as object)) {
		dst.cause = clone_node((src as Error).cause, seen, symbols, maxDepth, depth + 1);
	}
	seen.delete(src);
	return dst;
}

/**
 * Deep clone `value`. Cycle- and prototype-preserving; shares nothing with the
 * input.
 *
 * @example
 * ```js
 * const copy = clone({ nested: { n: 1 } });
 * copy.nested.n = 2; // original unchanged
 * ```
 */
export function clone<T>(value: T, options?: CloneOptions): T {
	if (typeof value !== 'object' || value === null) return value;
	return clone_node(value, new Map(), !!options?.symbols, options?.maxDepth, 0);
}

// re-export for ops that share the option shape
export type { KeyOptions };

// ---------------------------------------------------------------------------
// In-source unit tests.
// ---------------------------------------------------------------------------
if (import.meta.vitest) {
	const { describe, it, expect } = import.meta.vitest;

	describe('clone: independence', () => {
		it('deep-copies nested structures', () => {
			const src = { a: { b: [1, 2] } };
			const dst = clone(src);
			expect(dst).toEqual(src);
			expect(dst.a).not.toBe(src.a);
			expect(dst.a.b).not.toBe(src.a.b);
		});
		it('preserves cycles', () => {
			const ring: any = { n: 1 };
			ring.self = ring;
			const dst = clone(ring);
			expect(dst.self).toBe(dst);
			expect(dst).not.toBe(ring);
		});
	});

	describe('clone: exotic types', () => {
		it('Map/Set/Date/RegExp deep-clone', () => {
			expect(clone(new Map([['a', 1]])) instanceof Map).toBe(true);
			expect([...clone(new Set([1, 2]))]).toEqual([1, 2]);
			const d = clone(new Date(5));
			expect(d.getTime()).toBe(5);
			const re = clone(/x/gi);
			expect(re.source).toBe('x');
			expect(re.flags).toBe('gi');
		});
		it('typed arrays clone independently', () => {
			const ta = new Uint8Array([1, 2, 3]);
			const c = clone(ta);
			c[0] = 9;
			expect(ta[0]).toBe(1);
		});
		it('preserves prototype', () => {
			class Box {
				constructor(public v: number) {}
			}
			const c = clone(new Box(5));
			expect(c instanceof Box).toBe(true);
			expect(c.v).toBe(5);
		});
		it('clones Error with cause', () => {
			const e = new Error('boom', { cause: { code: 1 } });
			const c = clone(e);
			expect(c.message).toBe('boom');
			expect(c.cause).toEqual({ code: 1 });
			expect(c.cause).not.toBe(e.cause);
		});
	});
}

import type { TraverseOptions } from './utils.js';
import {
	assert_within_depth,
	empty_null,
	get_proto,
	is_array,
	is_boxed_primitive,
	is_typed_array,
	object_keys,
	object_proto,
	own_enumerable_keys,
	safe_set,
	to_string,
} from './utils.js';

// Deep clone with O(1) circular detection (a Map of ancestor → its clone) and
// no per-call closure. `typeof`-first, so primitive leaves never touch the Map.
// `seen` holds only the current ancestry (set on descend, deleted on ascend),
// matching the classic push/pop semantics.
function clone_node(
	src: any,
	seen: Map<object, any>,
	options: TraverseOptions,
	depth: number,
): any {
	if (typeof src !== 'object' || src === null) return src;
	assert_within_depth(depth, options.maxDepth);
	const existing = seen.get(src);
	if (existing !== undefined) return existing; // circular reference back to an ancestor

	// Map/Set deep-clone (structuredClone parity). Handled before copy() so their
	// entries — which carry no string/symbol keys — are cloned recursively rather
	// than dropped. `instanceof` keeps the hot path free of a second toString tag.
	if (src instanceof Map) {
		const dst = new Map();
		seen.set(src, dst);
		for (const [k, v] of src) {
			dst.set(clone_node(k, seen, options, depth + 1), clone_node(v, seen, options, depth + 1));
		}
		seen.delete(src);
		return dst;
	}
	if (src instanceof Set) {
		const dst = new Set();
		seen.set(src, dst);
		for (const v of src) dst.add(clone_node(v, seen, options, depth + 1));
		seen.delete(src);
		return dst;
	}
	if (src instanceof WeakMap || src instanceof WeakSet) {
		// Weak collections are not enumerable in the type system / walk — share reference.
		seen.set(src, src);
		return src;
	}
	if (src instanceof ArrayBuffer) {
		const dst = src.slice(0);
		seen.set(src, dst);
		return dst;
	}
	if (src instanceof DataView) {
		const dst = new DataView(
			src.buffer.slice(src.byteOffset, src.byteOffset + src.byteLength),
			0,
			src.byteLength,
		);
		seen.set(src, dst);
		return dst;
	}
	// Build the shell once and fill keys deeply — no shallow pre-copy (P-1), so
	// each property is written exactly once and getters fire exactly once.
	const dst = make_shell(src);
	// typed arrays / boxed primitives are fully materialized by make_shell
	if (!shell_keyed) return dst;
	seen.set(src, dst);
	const keys = options.includeSymbols ? own_enumerable_keys(src) : object_keys(src);
	for (let i = 0; i < keys.length; i++) {
		const key = keys[i];
		safe_set(dst, key, clone_node(src[key], seen, options, depth + 1));
	}
	// Error.cause is a non-enumerable own slot make_shell copied by reference — deep-clone
	// it so the clone is fully independent of the source (D2).
	if (dst instanceof Error && 'cause' in (src as object)) {
		dst.cause = clone_node((src as Error).cause, seen, options, depth + 1);
	}
	seen.delete(src);
	return dst;
}

// Build a fresh container for `src`. For leaf-like exotics (typed array, boxed
// primitive, ArrayBuffer, DataView, Map, Set, weak collections) the returned
// `dst` is fully materialized and `keyed` is false — there are no own string/
// symbol keys left for the caller to copy or clone. For arrays / Date / RegExp /
// Error / plain objects, `keyed` is true and the caller fills own keys itself
// (shallow in copy(), deep in clone_node()). Sharing this shell is what lets
// clone() build each node with a SINGLE write per key instead of a shallow copy
// followed by a deep overwrite of every key.
// `make_shell` reports its keyed-ness via this module-level flag instead of
// returning a `{ dst, keyed }` object — that literal would allocate once per node
// on the clone/copy hot path. It's an out-param: callers read it immediately after
// the call, before any (recursive) make_shell call can overwrite it.
let shell_keyed = false;
function make_shell(src: any): any {
	if (is_array(src)) {
		shell_keyed = true;
		return new Array(src.length);
	}
	shell_keyed = false;
	if (src instanceof ArrayBuffer) return src.slice(0);
	if (src instanceof DataView) {
		return new DataView(src.buffer.slice(src.byteOffset, src.byteOffset + src.byteLength), 0, src.byteLength);
	}
	if (is_typed_array(src)) return src.slice();
	// Boxed primitives have read-only index slots; the wrapper already carries the value.
	if (is_boxed_primitive(src)) return Object(src);
	// Shallow entry copy (used by map()/immutable). clone_node() deep-clones Map/Set itself.
	if (src instanceof Map) return new Map(src);
	if (src instanceof Set) return new Set(src);
	if (src instanceof WeakMap || src instanceof WeakSet) return src;

	// One `toString` tag instead of a separate call per predicate.
	const tag = to_string(src);
	if (tag === '[object Date]' && typeof src.getTime === 'function') {
		// Guard on `getTime` so a `Symbol.toStringTag`-spoofed object falls through
		// to the generic copy instead of becoming `Invalid Date`.
		shell_keyed = true;
		return new Date(src.getTime());
	}
	if (tag === '[object RegExp]' && typeof src.source === 'string') {
		try {
			const re = new RegExp(src.source, src.flags);
			re.lastIndex = src.lastIndex; // preserve match state (C-16)
			shell_keyed = true;
			return re;
		} catch {
			// invalid/spoofed source → fall through to a generic copy, never crash (C1)
		}
	}
	if (tag === '[object Error]') {
		// Reconstruct a real Error so instanceof / name / stack / cause survive (C-8),
		// keeping getType() === 'error' consistent with the clone.
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
	// Cross-realm exotics the `instanceof` checks above missed: detect by tag so they
	// clone instead of silently degrading to an empty object or crashing (C3).
	if (tag === '[object Map]') {
		shell_keyed = false;
		return new Map(src as Iterable<[unknown, unknown]>);
	}
	if (tag === '[object Set]') {
		shell_keyed = false;
		return new Set(src as Iterable<unknown>);
	}
	if (tag === '[object ArrayBuffer]') {
		shell_keyed = false;
		return (src as ArrayBuffer).slice(0);
	}
	if (tag === '[object DataView]') {
		shell_keyed = false;
		const dv = src as DataView;
		return new DataView(dv.buffer.slice(dv.byteOffset, dv.byteOffset + dv.byteLength), 0, dv.byteLength);
	}

	// `{}` is faster than `Object.create(Object.prototype)` for the common case.
	shell_keyed = true;
	const proto = get_proto(src);
	return proto === object_proto ? {} : Object.create(proto);
}

export function copy(src: any, options: TraverseOptions) {
	if (typeof src === 'object' && src !== null) {
		const dst = make_shell(src);
		if (!shell_keyed) return dst;

		const keys = options.includeSymbols ? own_enumerable_keys(src) : object_keys(src);
		for (let i = 0; i < keys.length; i++) {
			const key = keys[i];
			safe_set(dst, key, src[key]);
		}

		return dst;
	}
	return src;
}

/**
 * @example
 * ```js
 * import { clone } from 'neotraverse/modern';
 * const copy = clone({ nested: { n: 1 } });
 * copy.nested.n = 2; // original unchanged
 * ```
 *
 * @see https://neotraverse.puruvj.dev/guide/api/core#t-clone
 */
export function clone(obj: any, options?: TraverseOptions): any {
	// Primitives clone to themselves — skip the circular-detection Map allocation that
	// merge/diff/patch/dereference would otherwise pay on every leaf value.
	if (typeof obj !== 'object' || obj === null) return obj;
	return clone_node(obj, new Map(), options ?? empty_null, 0);
}

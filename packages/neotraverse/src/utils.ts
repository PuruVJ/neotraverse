// Low-level helpers, type guards, regexes, path-key coercion, and shared types for
// the modern (functional) API. Leaf module: depends on nothing else in the package.

type TypedArray =
	| Int8Array
	| Uint8Array
	| Uint8ClampedArray
	| Int16Array
	| Uint16Array
	| Int32Array
	| Uint32Array
	| Float32Array
	| Float64Array
	| BigInt64Array
	| BigUint64Array;

/**
 * Walk, clone, and async traversal options.
 *
 * @see https://neotraverse.puruvj.dev/guide/options
 */
export interface TraverseOptions {
	/**
	 * If true, does not alter the original object
	 *
	 * @see https://neotraverse.puruvj.dev/guide/options
	 */
	immutable?: boolean;

	/**
	 * If false, removes all symbols from traversed objects
	 *
	 * @default false
	 *
	 * @see https://neotraverse.puruvj.dev/guide/options
	 */
	includeSymbols?: boolean;

	/**
	 * Maximum traversal/clone depth. When set, traversing or cloning an object
	 * nested deeper than this throws a `RangeError` instead of overflowing the
	 * call stack — useful for bounding untrusted input. Unlimited when omitted.
	 *
	 * @see https://neotraverse.puruvj.dev/guide/security
	 */
	maxDepth?: number;

	/**
	 * Cancel an in-flight async walk ({@link forEachAsync} /
	 * {@link mapAsync}). When the signal aborts, the walk rejects with
	 * the signal's reason on the next visited node. Ignored by the synchronous
	 * methods.
	 *
	 * @see https://neotraverse.puruvj.dev/guide/api/async#t-async
	 */
	signal?: AbortSignal;

	/**
	 * When true, {@link Map} and {@link Set} are not leaves — their entries are
	 * visited (Map: each value at its key; Set: each element at a numeric index).
	 * @default false
	 *
	 * @see https://neotraverse.puruvj.dev/guide/api/iteration#t-entries
	 */
	descendIntoMapSet?: boolean;

	/**
	 * Max parallel sibling callbacks in {@link forEachAsync} / {@link mapAsync}.
	 * @default 1
	 *
	 * @see https://neotraverse.puruvj.dev/guide/api/async#t-async
	 */
	concurrency?: number;
}

/**
 * Callback context (`ctx`) passed to every traversal function.
 *
 * @see https://neotraverse.puruvj.dev/guide/context
 */
export interface TraverseContext {
	/**
	 * The present node on the recursive walk
	 *
	 * @see https://neotraverse.puruvj.dev/guide/context
	 */
	node: any;

	/**
	 * An array of string keys from the root to the present node
	 *
	 * @see https://neotraverse.puruvj.dev/guide/context
	 */
	path: PropertyKey[];

	/**
	 * The context of the node's parent.
	 * This is `undefined` for the root node.
	 *
	 * @see https://neotraverse.puruvj.dev/guide/context
	 */
	parent: TraverseContext | undefined;

	/**
	 * The contexts of the node's parents.
	 *
	 * @see https://neotraverse.puruvj.dev/guide/context
	 */
	parents: TraverseContext[];

	/**
	 * The name of the key of the present node in its parent.
	 * This is `undefined` for the root node.
	 *
	 * @see https://neotraverse.puruvj.dev/guide/context
	 */
	key: PropertyKey | undefined;

	/**
	 * Whether the present node is the root node
	 *
	 * @see https://neotraverse.puruvj.dev/guide/context
	 */
	isRoot: boolean;
	/**
	 * Whether the present node is not the root node
	 *
	 * @see https://neotraverse.puruvj.dev/guide/context
	 */
	notRoot: boolean;

	/**
	 * Whether the present node is the last node
	 *
	 * @see https://neotraverse.puruvj.dev/guide/context
	 */
	isLast: boolean;

	/**
	 * Whether the present node is the first node
	 *
	 * @see https://neotraverse.puruvj.dev/guide/context
	 */
	isFirst: boolean;

	/**
	 * Whether or not the present node is a leaf node (has no children)
	 *
	 * @see https://neotraverse.puruvj.dev/guide/context
	 */
	isLeaf: boolean;
	/**
	 * Whether or not the present node is not a leaf node (has children)
	 *
	 * @see https://neotraverse.puruvj.dev/guide/context
	 */
	notLeaf: boolean;

	/**
	 * Depth of the node within the traversal
	 *
	 * @see https://neotraverse.puruvj.dev/guide/context
	 */
	level: number;

	/**
	 * If the node equals one of its parents, the `circular` attribute is set to the context of that parent and the traversal progresses no deeper.
	 *
	 * @see https://neotraverse.puruvj.dev/guide/context#context-circular
	 */
	circular: TraverseContext | undefined;

	/**
	 * Set a new value for the present node.
	 *
	 * All the elements in `value` will be recursively traversed unless `stopHere` is true (false by default).
	 *
	 * @see https://neotraverse.puruvj.dev/guide/context
	 */
	update(value: any, stopHere?: boolean): void;

	/**
	 * Remove the current element from the output. If the node is in an Array it will be spliced off. Otherwise it will be deleted from its parent.
	 *
	 * @see https://neotraverse.puruvj.dev/guide/context
	 */
	remove(stopHere?: boolean): void;

	/**
	 * Delete the current element from its parent in the output. Calls `delete` even on Arrays.
	 *
	 * @see https://neotraverse.puruvj.dev/guide/context
	 */
	delete(stopHere?: boolean): void;

	/**
	 * Object keys of the node.
	 *
	 * @see https://neotraverse.puruvj.dev/guide/context
	 */
	keys: PropertyKey[] | null;

	/**
	 * Call this function before all of the children are traversed.
	 * You can assign into `ctx.keys` here to traverse in a custom order.
	 *
	 * @see https://neotraverse.puruvj.dev/guide/context
	 */
	before(callback: (ctx: TraverseContext, value: any) => void): void;

	/**
	 * Call this function after all of the children are traversed.
	 *
	 * @see https://neotraverse.puruvj.dev/guide/context
	 */
	after(callback: (ctx: TraverseContext, value: any) => void): void;

	/**
	 * Call this function before each of the children are traversed.
	 *
	 * @see https://neotraverse.puruvj.dev/guide/context
	 */
	pre(callback: (ctx: TraverseContext, child: any, key: any) => void): void;

	/**
	 * Call this function after each of the children are traversed.
	 *
	 * @see https://neotraverse.puruvj.dev/guide/context
	 */
	post(callback: (ctx: TraverseContext, child: any) => void): void;

	/**
	 * Stops traversal entirely.
	 *
	 * @see https://neotraverse.puruvj.dev/guide/context
	 */
	stop(): void;

	/**
	 * Prevents traversing descendents of the current node.
	 *
	 * @see https://neotraverse.puruvj.dev/guide/context#context-block
	 */
	block(): void;

	/**
	 * Next sibling context, or `undefined`. Reads live parent state (not `isLast`).
	 *
	 * @see https://neotraverse.puruvj.dev/guide/context#context-siblings
	 */
	nextSibling(): TraverseContext | undefined;

	/**
	 * Previous sibling context, or `undefined`. Reads live parent state (not `isFirst`).
	 *
	 * @see https://neotraverse.puruvj.dev/guide/context#context-siblings
	 */
	prevSibling(): TraverseContext | undefined;
}

export const to_string = (obj: unknown) => Object.prototype.toString.call(obj);

// Exclude DataView by tag, not instanceof, so a cross-realm DataView isn't misread as a
// typed array (whose clone does `.slice()`, which a DataView lacks → crash) (C3).
export const is_typed_array = (value: unknown): value is TypedArray =>
	ArrayBuffer.isView(value) && to_string(value) !== '[object DataView]';
export const is_array = Array.isArray;

// Boxed primitives (`new String()` / `new Number()` / `new Boolean()`), detected by tag so
// they're recognized cross-realm. A `Symbol.toStringTag` spoof carries the same tag but is a
// plain object that unboxes to itself — gate on valueOf so a spoof isn't cloned by reference
// (C2). valueOf is only reached for genuine wrapper tags (never plain objects/arrays), and is
// guarded in case an attacker wrapper throws.
export const is_boxed_primitive = (obj: unknown): boolean => {
	const tag = to_string(obj);
	if (tag !== '[object Boolean]' && tag !== '[object Number]' && tag !== '[object String]') return false;
	try {
		return typeof (obj as { valueOf(): unknown }).valueOf() !== 'object';
	} catch {
		return false;
	}
};

export const gopd = Object.getOwnPropertyDescriptor;
export const is_property_enumerable = Object.prototype.propertyIsEnumerable;
export const get_own_property_symbols = Object.getOwnPropertySymbols;
export const has_own_property = Object.prototype.hasOwnProperty;
export const object_keys = Object.keys;
export const object_proto = Object.prototype;
export const get_proto = Object.getPrototypeOf;

// Regexes hoisted to module scope and reused — never reallocated per call. None are
// stateful here (the `/g` ones are only used with String.replace, which ignores
// lastIndex), so sharing a single instance is safe.
export const INT_RE = /^\d+$/; // canonical unsigned integer segment (coerceKey)
export const GLOB_INDEX_RE = /^(.+)\[\*\]$/; // `key[*]` glob segment (parseGlob)
export const PTR_UNESCAPE_SLASH_RE = /~1/g; // JSON Pointer `~1` -> `/`
export const PTR_UNESCAPE_TILDE_RE = /~0/g; // JSON Pointer `~0` -> `~`
export const TILDE_RE = /~/g; // JSON Pointer escape `~` -> `~0`
export const SLASH_RE = /\//g; // JSON Pointer escape `/` -> `~1`

// Keys that can mutate an object's prototype chain. They must never be used as
// navigation/write targets when handling untrusted input (prototype pollution).
// A boxed/object key (`new String('__proto__')`, `{toString:()=>'__proto__'}`)
// string-coerces to its real property key on assignment, so it would dodge a strict
// `===` check while still firing the `__proto__` setter — coerce it first (A1/A2).
export const is_unsafe_key = (key: PropertyKey): boolean => {
	const k = typeof key === 'object' && key !== null ? String(key) : key;
	return k === '__proto__' || k === 'constructor' || k === 'prototype';
};

// Assign `value` onto `dst` without ever triggering the `__proto__` setter or
// otherwise mutating `dst`'s [[Prototype]]. The value is preserved as an
// ordinary own enumerable data property, so injected data is neutralized — not
// silently dropped — and the clone keeps its real prototype.
export function safe_set(dst: any, key: PropertyKey, value: any): void {
	// Coerce a boxed/object key to its primitive once (matching the assignment's own
	// coercion) so it can't slip past the `__proto__` neutralization below (A1).
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

// Bound recursion when a `maxDepth` is configured, throwing a catchable error
// before the native stack overflow. A tiny hot helper — V8 inlines it, so it's
// DRY at no per-node cost. No-op when `max_depth` is undefined.
export function assert_within_depth(depth: number, max_depth: number | undefined): void {
	if (max_depth !== undefined && depth > max_depth) {
		throw new RangeError(`neotraverse: maximum traversal depth (${max_depth}) exceeded`);
	}
}

export function own_enumerable_keys(obj: object): PropertyKey[] {
	const res: PropertyKey[] = object_keys(obj);
	const symbols = get_own_property_symbols(obj);
	for (let i = 0; i < symbols.length; i++) {
		if (is_property_enumerable.call(obj, symbols[i])) {
			res.push(symbols[i]);
		}
	}
	return res;
}

export function is_non_writable(object: any, key: PropertyKey) {
	return !gopd(object, key)?.writable;
}

export const empty_null: TraverseOptions = {
	includeSymbols: false,
	immutable: false,
};

export function clamp_concurrency(c: number | undefined): number {
	return typeof c === 'number' && c >= 1 ? Math.floor(c) : 1;
}

// Array index segments are exposed as numbers, not strings (C-10), so paths from
// the walk/select/paths line up with parsePath()/patch (which already coerce).
// Mutates the array in place — callers always pass a fresh `Object.keys` result.
// Object keys that merely look numeric (`{ '0': … }`) are untouched: only true
// array indices round-trip `String(+k) === k`.
export function array_numeric(keys: PropertyKey[]): PropertyKey[] {
	for (let i = 0; i < keys.length; i++) {
		const k = keys[i];
		if (typeof k === 'string' && '' + +k === k) keys[i] = +k;
	}
	return keys;
}

// Numeric keys for an array node. For a dense array with no holes / extra / symbol
// keys (the common case: `Object.keys` length === array length) emit `[0..len-1]`
// directly — a plain index write per slot, skipping array_numeric's per-key string
// round-trip (DEEP-3). `keys` is a fresh `iter(node)` result, reused in place.
export function array_keys(node: any[], keys: PropertyKey[]): PropertyKey[] {
	const len = node.length;
	if (keys.length === len) {
		for (let i = 0; i < len; i++) keys[i] = i;
		return keys;
	}
	return array_numeric(keys); // sparse / extra-key / symbol — coerce per key
}

export function map_set_child_keys(node: Map<any, any> | Set<any>): PropertyKey[] {
	if (node instanceof Map) {
		const keys: PropertyKey[] = [];
		for (const k of node.keys()) keys.push(k as PropertyKey);
		return keys;
	}
	const keys: PropertyKey[] = [];
	let i = 0;
	for (const _ of node) {
		keys.push(i);
		i++;
	}
	return keys;
}

export function get_child_at(node: any, key: PropertyKey, descend_map_set: boolean): any {
	if (descend_map_set && node instanceof Map) return node.get(key);
	if (descend_map_set && node instanceof Set) return [...node][key as number];
	return node[key];
}

/**
 * Locked union — do not rename tags after release. Returned by {@link getType}.
 *
 * @see https://neotraverse.puruvj.dev/guide/types#types-and-traversal
 */
export type TraverseNodeType =
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

/**
 * Classify a value for branching inside traversal callbacks.
 * See the [types reference](https://neotraverse.puruvj.dev/guide/types#types-and-traversal) for walk vs clone behaviour per tag.
 *
 * @example
 * ```js
 * import { getType } from 'neotraverse/modern';
 * getType(new Map()); // => 'map'
 * getType([1, 2]); // => 'array'
 * ```
 *
 * @see https://neotraverse.puruvj.dev/guide/api/paths#t-get-type
 */
export function getType(value: unknown): TraverseNodeType {
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

export function coerceKey(segment: string): PropertyKey {
	// Only coerce canonical, safe integers. A round-trip check rejects
	// leading-zero (`"08"`) and oversized (`"9".repeat(20)`) segments that would
	// otherwise be silently corrupted into a different/imprecise number (C-13).
	if (INT_RE.test(segment)) {
		const n = Number(segment);
		if (Number.isSafeInteger(n) && String(n) === segment) return n;
	}
	return segment;
}

export function assertSafePath(keys: PropertyKey[]): void {
	// is_unsafe_key coerces boxed/object keys itself, so don't gate on typeof here (A2).
	for (let i = 0; i < keys.length; i++) {
		if (is_unsafe_key(keys[i])) {
			throw new Error(`neotraverse: unsafe path segment "${String(keys[i])}"`);
		}
	}
}

// SameValueZero: like `===` but NaN equals NaN (and -0 equals 0 via `===`).
export const same_value_zero = (x: any, y: any): boolean => x === y || (x !== x && y !== y);

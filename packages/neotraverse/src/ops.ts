import { clone } from './clone.js';
import { map } from './context.js';
import { get, parseJsonPointer, parsePath, pointerPath, set } from './path.js';
import type { TraverseNodeType, TraverseOptions } from './utils.js';
import {
	assert_within_depth,
	empty_null,
	get_own_property_symbols,
	getType,
	has_own_property,
	is_array,
	is_boxed_primitive,
	object_keys,
	safe_set,
	same_value_zero,
} from './utils.js';

/**
 * Options for {@link merge}.
 *
 * @see https://neotraverse.puruvj.dev/guide/api/walk#t-merge
 */
export interface MergeOptions extends TraverseOptions {
	/**
	 * How to combine two arrays at the same path.
	 *
	 * @default `'replace'`
	 *
	 * @see https://neotraverse.puruvj.dev/guide/api/walk#t-merge
	 */
	array?: 'replace' | 'concat';
}

// Types that merge_pair recurses into when target and source share the type.
// Maps are included so nested Maps deep-merge by key (the `st === 'map'` branch);
// Sets/other exotics fall through and are replaced wholesale.
function mergeable_object_type(t: TraverseNodeType): boolean {
	return t === 'object' || t === 'array' || t === 'map';
}

// `target` is the caller's ORIGINAL (no upfront clone — P-3). Every branch below
// deep-clones the parts it keeps from `target`, so the result shares no references
// with `target` or `source`; overlapping branches are merged (not double-cloned).
// `cloneOpts` is `options` with `maxDepth` stripped: maxDepth bounds the MERGE
// recursion (past it we replace with a full clone of the source subtree), NOT the
// cloning of that subtree — so the terminal clones never throw on a deep source (C-12).
function merge_pair(
	target: any,
	source: any,
	options: MergeOptions,
	cloneOpts: TraverseOptions,
	depth: number,
	seen: WeakSet<object>,
): any {
	if (source === undefined) return clone(target, cloneOpts);
	const st = getType(source);
	const tt = getType(target);
	if (st === 'null' || st === 'primitive' || st === 'function') return clone(source, cloneOpts);
	if (!mergeable_object_type(st) || !mergeable_object_type(tt) || st !== tt)
		return clone(source, cloneOpts);
	if (options.maxDepth !== undefined && depth >= options.maxDepth) return clone(source, cloneOpts);
	// B5: cycle guard on the source ancestry (add on descend, delete on ascend). A cyclic
	// source would otherwise recurse forever; clone() is itself cycle-safe so the back-edge
	// resolves to a finite cyclic clone of the remaining source subtree.
	if (seen.has(source)) return clone(source, cloneOpts);
	seen.add(source);
	let out: any;
	if (st === 'array') {
		if (options.array === 'concat') {
			out = new Array(target.length + source.length);
			for (let i = 0; i < target.length; i++) out[i] = clone(target[i], cloneOpts);
			for (let i = 0; i < source.length; i++) out[target.length + i] = clone(source[i], cloneOpts);
		} else {
			out = new Array(source.length);
			for (let i = 0; i < source.length; i++) {
				if (
					i < target.length &&
					mergeable_object_type(getType(target[i])) &&
					mergeable_object_type(getType(source[i]))
				) {
					out[i] = merge_pair(target[i], source[i], options, cloneOpts, depth + 1, seen);
				} else {
					out[i] = clone(source[i], cloneOpts);
				}
			}
		}
	} else if (st === 'map') {
		out = new Map();
		for (const [k, v] of target) {
			if (source.has(k)) {
				const sv = source.get(k);
				out.set(
					k,
					mergeable_object_type(getType(v)) && mergeable_object_type(getType(sv))
						? merge_pair(v, sv, options, cloneOpts, depth + 1, seen)
						: clone(sv, cloneOpts),
				);
			} else {
				out.set(k, clone(v, cloneOpts)); // target-only — cloned for independence
			}
		}
		for (const [k, v] of source) {
			if (!target.has(k)) out.set(k, clone(v, cloneOpts)); // new source keys appended
		}
	} else {
		// plain object — preserve target key order; overlapping keys merge, source-only append.
		out = {};
		const tkeys = object_keys(target);
		for (let i = 0; i < tkeys.length; i++) {
			const k = tkeys[i];
			if (has_own_property.call(source, k)) {
				// safe_set neutralizes __proto__ (no prototype pollution) while keeping the
				// data as an inert own key — parity with clone(), not a silent drop (C-14).
				if (mergeable_object_type(getType(target[k])) && mergeable_object_type(getType(source[k]))) {
					safe_set(out, k, merge_pair(target[k], source[k], options, cloneOpts, depth + 1, seen));
				} else {
					safe_set(out, k, clone(source[k], cloneOpts));
				}
			} else {
				safe_set(out, k, clone(target[k], cloneOpts)); // target-only — cloned for independence
			}
		}
		const skeys = object_keys(source);
		for (let i = 0; i < skeys.length; i++) {
			const k = skeys[i];
			if (!has_own_property.call(target, k)) safe_set(out, k, clone(source[k], cloneOpts));
		}
	}
	seen.delete(source);
	return out;
}

/**
 * Deep-merge `source` into a clone of `target` (does not mutate `target`).
 * Plain objects and Map entries merge recursively; arrays replace index-by-index
 * unless `array: 'concat'`. Other types are replaced from `source`.
 *
 * @example
 * ```js
 * import { merge } from 'neotraverse/modern';
 * merge({ x: 1, nested: { a: 1 } }, { y: 2, nested: { b: 2 } });
 * // => { x: 1, y: 2, nested: { a: 1, b: 2 } }
 * ```
 *
 * @see https://neotraverse.puruvj.dev/guide/api/walk#t-merge
 */
export function merge(target: any, source: any, options?: MergeOptions): any {
	const opts = options ?? empty_null;
	// Terminal clones must not inherit maxDepth (it bounds the merge recursion, not the
	// cloning of replaced subtrees — C-12). merge_pair clones kept branches lazily (P-3).
	const cloneOpts = opts.maxDepth !== undefined ? { ...opts, maxDepth: undefined } : opts;
	return merge_pair(target, source, opts, cloneOpts, 0, new WeakSet());
}

/**
 * Options for {@link dereference}.
 *
 * @see https://neotraverse.puruvj.dev/guide/api/walk#t-dereference
 */
export interface DereferenceOptions extends TraverseOptions {
	/**
	 * Only resolve refs whose string starts with `#` (JSON Pointer).
	 *
	 * @default true
	 *
	 * @see https://neotraverse.puruvj.dev/guide/api/walk#t-dereference
	 */
	localOnly?: boolean;
}

function is_ref_object(node: any): node is { $ref: string } {
	return (
		node !== null &&
		typeof node === 'object' &&
		!is_array(node) &&
		typeof node.$ref === 'string' &&
		object_keys(node).length === 1 &&
		// a $ref with any sibling (string OR symbol) is not a pure ref (C-7)
		get_own_property_symbols(node).length === 0
	);
}

/**
 * Resolve local JSON Pointer `$ref` objects (`"#/…"`) on a cloned tree.
 * External / URL refs are left unchanged.
 *
 * @example
 * ```js
 * import { dereference } from 'neotraverse/modern';
 * dereference({ defs: { Pet: { type: 'object' } }, pet: { $ref: '#/defs/Pet' } });
 * // => { defs: { Pet: { type: 'object' } }, pet: { type: 'object' } }
 * ```
 *
 * @see https://neotraverse.puruvj.dev/guide/api/walk#t-dereference
 */
const NOT_RESOLVED = Symbol('unresolved');

export function dereference(obj: any, options?: DereferenceOptions): any {
	const localOnly = options?.localOnly !== false;
	// Resolve refs against the *original* tree and let the single immutable map()
	// below produce the output clone — no redundant upfront clone(obj) (P-2).
	// Resolution follows ref chains (ref -> ref -> value) ITERATIVELY (no recursion —
	// a long acyclic chain can't overflow the stack, B1), `seen` stops cyclic chains
	// (C-7), and `targetCache` memoizes the final target per entry-ref so N refs to one
	// target cost O(N) get()-walks, not O(N^2) (B1). Each ref site still gets its own
	// clone() for isolation.
	const targetCache = new Map<string, any>();
	const resolveTarget = (ref0: string): any => {
		if (targetCache.has(ref0)) return targetCache.get(ref0);
		const seen = new Set<string>();
		const chain: string[] = []; // every ref visited — all cached to the final target
		let ref = ref0;
		let result: any = NOT_RESOLVED;
		for (;;) {
			if (targetCache.has(ref)) {
				result = targetCache.get(ref);
				break;
			}
			if (localOnly && !ref.startsWith('#')) break;
			const pointer = ref.startsWith('#') ? ref.slice(1) : ref;
			if (!pointer.startsWith('/')) break;
			if (seen.has(pointer)) break; // cyclic $ref — leave unresolved
			seen.add(pointer);
			chain.push(ref);
			const target = get(obj, parseJsonPointer(pointer), options);
			if (target === undefined) break;
			if (is_ref_object(target)) {
				ref = target.$ref;
				continue;
			}
			result = target;
			break;
		}
		// Path-compress: cache every ref in the chain to the resolved target, so N refs
		// sharing a chain cost O(N) get()-walks total, not O(N^2) (B1).
		for (let i = 0; i < chain.length; i++) targetCache.set(chain[i], result);
		targetCache.set(ref0, result);
		return result;
	};
	return map(
		obj,
		(ctx) => {
			if (is_ref_object(ctx.node)) {
				const target = resolveTarget(ctx.node.$ref);
				if (target !== NOT_RESOLVED) {
					ctx.update(clone(target, options));
					ctx.block();
				}
			}
		},
		options,
	);
}

/**
 * Options for {@link deepEqual}.
 *
 * @see https://neotraverse.puruvj.dev/guide/api/structural#t-deep-equal
 */
export interface DeepEqualOptions {
	/**
	 * Custom per-pair comparator; return `undefined` to fall back to structural equality.
	 *
	 * @see https://neotraverse.puruvj.dev/guide/api/structural#t-deep-equal
	 */
	compareFn?: (a: any, b: any) => boolean | undefined;

	/**
	 * Maximum comparison depth. When set, comparing values nested deeper throws a
	 * catchable `RangeError` instead of overflowing the call stack — bound this for
	 * untrusted input. Unlimited when omitted.
	 */
	maxDepth?: number;
}

/**
 * Structural equality with an explicit per-type contract (not identical to `clone()`).
 *
 * @example
 * ```js
 * import { deepEqual } from 'neotraverse/modern';
 * deepEqual({ a: [1] }, { a: [1] }); // => true
 * deepEqual(new Date('2020-01-01'), new Date('2020-01-01')); // => true
 * ```
 *
 * @see https://neotraverse.puruvj.dev/guide/api/structural#t-deep-equal
 */
export function deepEqual(a: any, b: any, options?: DeepEqualOptions): boolean {
	const seen = new Map<any, Map<any, boolean>>();
	return deepEqualPair(a, b, options?.compareFn, seen, options?.maxDepth, 0);
}

function deepEqualPair(
	a: any,
	b: any,
	compareFn: ((a: any, b: any) => boolean | undefined) | undefined,
	seen: Map<any, Map<any, boolean>>,
	maxDepth: number | undefined,
	depth: number,
): boolean {
	if (a === b) return true;
	assert_within_depth(depth, maxDepth); // S-1: bound deep untrusted input
	if (compareFn) {
		const custom = compareFn(a, b);
		if (custom !== undefined) return custom;
	}
	if (typeof a !== typeof b) return false;
	if (a === null || b === null) return a === b;
	if (is_boxed_primitive(a) || is_boxed_primitive(b)) {
		if (!is_boxed_primitive(a) || !is_boxed_primitive(b)) return false;
		return same_value_zero(Object(a).valueOf(), Object(b).valueOf());
	}
	const ta = getType(a);
	const tb = getType(b);
	if (ta !== tb) return false;
	// SameValueZero: NaN equals NaN, -0 equals 0 (C-17).
	if (ta === 'primitive' || ta === 'null') return same_value_zero(a, b);
	if (typeof a === 'object' && typeof b === 'object') {
		let pairs = seen.get(a);
		if (pairs?.has(b)) return true;
		if (!pairs) {
			pairs = new Map();
			seen.set(a, pairs);
		}
		pairs.set(b, true);
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
			for (let i = 0; i < va.length; i++) {
				if (va[i] !== vb[i]) return false;
			}
			return true;
		}
		case 'dataview': {
			if (a.byteLength !== b.byteLength) return false;
			for (let i = 0; i < a.byteLength; i++) {
				if (a.getUint8(i) !== b.getUint8(i)) return false;
			}
			return true;
		}
		case 'typed-array': {
			if (a.length !== b.length) return false;
			for (let i = 0; i < a.length; i++) {
				if (!same_value_zero(a[i], b[i])) return false; // NaN-aware element compare (C-17)
			}
			return true;
		}
		case 'map': {
			if (a.size !== b.size) return false;
			for (const [k, v] of a) {
				if (!b.has(k) || !deepEqualPair(v, b.get(k), compareFn, seen, maxDepth, depth + 1)) return false;
			}
			return true;
		}
		case 'set': {
			if (a.size !== b.size) return false;
			// B6: if every element of `a` is a primitive, compare by O(1) membership in `b`
			// (O(n) total) instead of the O(n^2) greedy structural match below. NaN is
			// SameValueZero-equal and Set membership already uses SameValueZero, so `b.has`
			// matches the structural contract for primitive elements.
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
			// object-element sets: greedy structural matching (each `a` element to an unused
			// structurally-equal `b` element).
			const used = new Set<number>();
			for (const v of a) {
				let matched = false;
				let i = 0;
				for (const w of b) {
					if (used.has(i)) {
						i++;
						continue;
					}
					if (deepEqualPair(v, w, compareFn, seen, maxDepth, depth + 1)) {
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
		case 'weakmap': {
			// Only keys reachable from this walk are compared (WeakMap is not enumerable in forEach).
			if (a === b) return true;
			return false;
		}
		case 'weakset':
			return a === b;
		case 'function':
			return a === b;
		case 'array': {
			if (a.length !== b.length) return false;
			for (let i = 0; i < a.length; i++) {
				if (!deepEqualPair(a[i], b[i], compareFn, seen, maxDepth, depth + 1)) return false;
			}
			return true;
		}
		default: {
			const keysA = Object.keys(a);
			const keysB = Object.keys(b);
			if (keysA.length !== keysB.length) return false;
			for (let i = 0; i < keysA.length; i++) {
				const k = keysA[i];
				if (!has_own_property.call(b, k)) return false;
				if (!deepEqualPair(a[k], b[k], compareFn, seen, maxDepth, depth + 1)) return false;
			}
			return true;
		}
	}
}

/**
 * Options for {@link toJSON}.
 *
 * @see https://neotraverse.puruvj.dev/guide/api/structural#t-to-json
 */
export interface ToJSONOptions extends TraverseOptions {
	/**
	 * Value inserted where a circular reference is detected.
	 *
	 * @default null
	 *
	 * @see https://neotraverse.puruvj.dev/guide/api/structural#t-to-json
	 */
	cycle?: null | string;
}

/**
 * JSON.stringify after a walk; does not throw on circular references.
 *
 * @example
 * ```js
 * import { toJSON } from 'neotraverse/modern';
 * const ring = {}; ring.self = ring;
 * toJSON(ring); // => '{"self":null}'
 * ```
 *
 * @see https://neotraverse.puruvj.dev/guide/api/structural#t-to-json
 */
export function toJSON(obj: any, options?: ToJSONOptions): string {
	const cycle = options?.cycle ?? null;
	const prepared = map(
		obj,
		(ctx) => {
			if (ctx.circular) {
				ctx.update(cycle);
				ctx.block();
				return;
			}
			const n = ctx.node;
			if (typeof n === 'function' || typeof n === 'symbol') {
				ctx.update(undefined);
			} else if (typeof n === 'bigint') {
				ctx.update(String(n));
			}
		},
		options,
	);
	return JSON.stringify(prepared);
}

/**
 * RFC 6902 patch operation (`add` | `remove` | `replace`).
 *
 * @see https://neotraverse.puruvj.dev/guide/api/structural#t-diff
 */
export type PatchOp =
	| { op: 'add'; path: string; value: any }
	| { op: 'remove'; path: string }
	| { op: 'replace'; path: string; value: any };

/**
 * RFC 6902 subset (`add` / `remove` / `replace`). Circular graphs are not supported.
 *
 * @example
 * ```js
 * import { diff } from 'neotraverse/modern';
 * diff({ a: 1 }, { a: 2, b: 3 });
 * // => [
 * //   { op: 'replace', path: '/a', value: 2 },
 * //   { op: 'add', path: '/b', value: 3 },
 * // ]
 * ```
 *
 * @see https://neotraverse.puruvj.dev/guide/api/structural#t-diff
 */
export function diff(a: any, b: any, options?: { maxDepth?: number }): PatchOp[] {
	const ops: PatchOp[] = [];
	diffPair(a, b, [], ops, new WeakSet(), options?.maxDepth, 0, new Map());
	return ops;
}

function diffPair(
	a: any,
	b: any,
	path: PropertyKey[],
	ops: PatchOp[],
	stack: WeakSet<object>,
	maxDepth: number | undefined,
	depth: number,
	// B2: pairs already proven equal (produced no ops). A shared/DAG subtree reached via
	// many paths is otherwise re-diffed 2^depth times; this memo makes it O(distinct pairs).
	// Only equal pairs are cached — a *differing* pair must still emit its ops at each path.
	equalCache: Map<any, Set<any>>,
): void {
	if (a === b) return;
	assert_within_depth(depth, maxDepth); // S-1: bound deep untrusted input
	const ta = getType(a);
	const tb = getType(b);
	if (ta !== tb || ta === 'primitive' || ta === 'null') {
		ops.push({ op: 'replace', path: pointerPath(path), value: clone(b) });
		return;
	}
	// Ancestor stack: push on descend, POP on ascend. This guards genuine cycles
	// (back-edges to an ancestor) without misclassifying shared/DAG references as
	// cycles — the add-never-delete bug silently dropped diffs under shared nodes (C-1).
	const tracked = typeof a === 'object' && a !== null;
	if (tracked) {
		if (stack.has(a)) return; // genuine back-edge to an ancestor
		const bs = equalCache.get(a);
		if (bs !== undefined && bs.has(b)) return; // known-equal pair → no ops at any path (B2)
		stack.add(a);
	}
	const opsBefore = ops.length;
	if (ta === 'array') {
		const min = Math.min(a.length, b.length);
		for (let i = 0; i < min; i++) {
			diffPair(a[i], b[i], path.concat(i), ops, stack, maxDepth, depth + 1, equalCache);
		}
		// growth: append the new tail (ascending)
		for (let i = a.length; i < b.length; i++) {
			ops.push({ op: 'add', path: pointerPath(path.concat(i)), value: clone(b[i]) });
		}
		// shrink: remove from the tail DOWNWARD so earlier indices stay valid when
		// the ops are applied left-to-right (C-5).
		for (let i = a.length - 1; i >= b.length; i--) {
			ops.push({ op: 'remove', path: pointerPath(path.concat(i)) });
		}
	} else if (
		ta === 'map' ||
		ta === 'set' ||
		ta === 'weakmap' ||
		ta === 'weakset' ||
		ta === 'date' ||
		ta === 'regexp' ||
		ta === 'error' ||
		ta === 'typed-array' ||
		ta === 'arraybuffer' ||
		ta === 'dataview' ||
		ta === 'function'
	) {
		if (!deepEqual(a, b, { maxDepth })) {
			ops.push({ op: 'replace', path: pointerPath(path), value: clone(b) });
		}
	} else {
		const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
		for (const k of keys) {
			const p = path.concat(k);
			const ha = has_own_property.call(a, k);
			const hb = has_own_property.call(b, k);
			if (ha && !hb) ops.push({ op: 'remove', path: pointerPath(p) });
			else if (!ha && hb) ops.push({ op: 'add', path: pointerPath(p), value: clone(b[k]) });
			else if (ha && hb) diffPair(a[k], b[k], p, ops, stack, maxDepth, depth + 1, equalCache);
		}
	}
	if (tracked) {
		stack.delete(a); // pop on ascend (C-1)
		if (ops.length === opsBefore) {
			// (a, b) produced no ops anywhere below — record so other paths to this same
			// shared pair short-circuit instead of re-walking it (B2).
			let bs = equalCache.get(a);
			if (bs === undefined) {
				bs = new Set();
				equalCache.set(a, bs);
			}
			bs.add(b);
		}
	}
}

/**
 * @example
 * ```js
 * import { patch } from 'neotraverse/modern';
 * patch({ a: 1 }, [{ op: 'replace', path: '/a', value: 2 }]);
 * // => { a: 2 }
 * ```
 *
 * @see https://neotraverse.puruvj.dev/guide/api/structural#t-diff
 */
export function patch(obj: any, ops: PatchOp[]): any {
	let root = clone(obj);
	for (let i = 0; i < ops.length; i++) {
		const op = ops[i];
		const keys = parsePath(op.path.startsWith('/') ? op.path : `/${op.path}`);
		if (op.op === 'remove') {
			root = removeAt(root, keys);
		} else {
			// RFC 6902: `add` inserts into arrays, `replace` overwrites (C-6).
			root = setAt(root, keys, op.value, op.op === 'add');
		}
	}
	return root;
}

function setAt(root: any, keys: PropertyKey[], value: any, insert: boolean): any {
	if (keys.length === 0) return value;
	const parentKeys = keys.slice(0, -1);
	const last = keys[keys.length - 1];
	let parent = parentKeys.length ? get(root, parentKeys) : root;
	if (parent === undefined || parent === null) {
		parent = typeof last === 'number' ? [] : {};
		if (parentKeys.length) root = set(root, parentKeys, parent);
		else root = parent;
	}
	if (typeof last === 'number' && is_array(parent)) {
		// `add` at an in-range index inserts (shifts right); splice(len,0,v) appends.
		if (insert) parent.splice(last, 0, value);
		else parent[last] = value;
	} else {
		safe_set(parent, last, value);
	}
	return root;
}

function removeAt(root: any, keys: PropertyKey[]): any {
	if (keys.length === 0) return root;
	const parentKeys = keys.slice(0, -1);
	const last = keys[keys.length - 1];
	const parent = parentKeys.length ? get(root, parentKeys) : root;
	if (parent == null) return root;
	if (is_array(parent) && typeof last === 'number') parent.splice(last, 1);
	else delete parent[last];
	return root;
}

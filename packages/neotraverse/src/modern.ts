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

const to_string = (obj: unknown) => Object.prototype.toString.call(obj);

// Exclude DataView by tag, not instanceof, so a cross-realm DataView isn't misread as a
// typed array (whose clone does `.slice()`, which a DataView lacks → crash) (C3).
const is_typed_array = (value: unknown): value is TypedArray =>
	ArrayBuffer.isView(value) && to_string(value) !== '[object DataView]';
const is_array = Array.isArray;

// Boxed primitives (`new String()` / `new Number()` / `new Boolean()`), detected by tag so
// they're recognized cross-realm. A `Symbol.toStringTag` spoof carries the same tag but is a
// plain object that unboxes to itself — gate on valueOf so a spoof isn't cloned by reference
// (C2). valueOf is only reached for genuine wrapper tags (never plain objects/arrays), and is
// guarded in case an attacker wrapper throws.
const is_boxed_primitive = (obj: unknown): boolean => {
	const tag = to_string(obj);
	if (tag !== '[object Boolean]' && tag !== '[object Number]' && tag !== '[object String]') return false;
	try {
		return typeof (obj as { valueOf(): unknown }).valueOf() !== 'object';
	} catch {
		return false;
	}
};

const gopd = Object.getOwnPropertyDescriptor;
const is_property_enumerable = Object.prototype.propertyIsEnumerable;
const get_own_property_symbols = Object.getOwnPropertySymbols;
const has_own_property = Object.prototype.hasOwnProperty;
const object_keys = Object.keys;
const object_proto = Object.prototype;
const get_proto = Object.getPrototypeOf;

// Regexes hoisted to module scope and reused — never reallocated per call. None are
// stateful here (the `/g` ones are only used with String.replace, which ignores
// lastIndex), so sharing a single instance is safe.
const INT_RE = /^\d+$/; // canonical unsigned integer segment (coerceKey)
const GLOB_INDEX_RE = /^(.+)\[\*\]$/; // `key[*]` glob segment (parseGlob)
const PTR_UNESCAPE_SLASH_RE = /~1/g; // JSON Pointer `~1` -> `/`
const PTR_UNESCAPE_TILDE_RE = /~0/g; // JSON Pointer `~0` -> `~`
const TILDE_RE = /~/g; // JSON Pointer escape `~` -> `~0`
const SLASH_RE = /\//g; // JSON Pointer escape `/` -> `~1`

// Keys that can mutate an object's prototype chain. They must never be used as
// navigation/write targets when handling untrusted input (prototype pollution).
// A boxed/object key (`new String('__proto__')`, `{toString:()=>'__proto__'}`)
// string-coerces to its real property key on assignment, so it would dodge a strict
// `===` check while still firing the `__proto__` setter — coerce it first (A1/A2).
const is_unsafe_key = (key: PropertyKey): boolean => {
	const k = typeof key === 'object' && key !== null ? String(key) : key;
	return k === '__proto__' || k === 'constructor' || k === 'prototype';
};

// Assign `value` onto `dst` without ever triggering the `__proto__` setter or
// otherwise mutating `dst`'s [[Prototype]]. The value is preserved as an
// ordinary own enumerable data property, so injected data is neutralized — not
// silently dropped — and the clone keeps its real prototype.
function safe_set(dst: any, key: PropertyKey, value: any): void {
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
function assert_within_depth(depth: number, max_depth: number | undefined): void {
	if (max_depth !== undefined && depth > max_depth) {
		throw new RangeError(`neotraverse: maximum traversal depth (${max_depth}) exceeded`);
	}
}

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

// Lazy, read-only depth-first walk yielding `[path, node]`. Pull-based, so it
// never materializes the full paths()/nodes() arrays. Circular-safe via an
// ancestry Set (a node that points back to an ancestor is yielded but not
// descended, matching walk()'s circular rule). Honors includeSymbols/maxDepth.
function* iterate(
	node: any,
	path: PropertyKey[],
	iter: (obj: object) => PropertyKey[],
	seen: Set<object>,
	max_depth: number | undefined,
	depth: number,
): Generator<[PropertyKey[], any]> {
	yield [path, node];
	if (typeof node !== 'object' || node === null) return;
	if (seen.has(node)) return; // circular — visited, but don't descend
	assert_within_depth(depth, max_depth);
	seen.add(node);
	const keys = is_array(node) ? array_keys(node, iter(node)) : iter(node);
	for (let i = 0; i < keys.length; i++) {
		yield* iterate(node[keys[i]], path.concat(keys[i]), iter, seen, max_depth, depth + 1);
	}
	seen.delete(node);
}

function own_enumerable_keys(obj: object): PropertyKey[] {
	const res: PropertyKey[] = object_keys(obj);
	const symbols = get_own_property_symbols(obj);
	for (let i = 0; i < symbols.length; i++) {
		if (is_property_enumerable.call(obj, symbols[i])) {
			res.push(symbols[i]);
		}
	}
	return res;
}

function is_non_writable(object: any, key: PropertyKey) {
	return !gopd(object, key)?.writable;
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

function copy(src: any, options: TraverseOptions) {
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

const empty_null: TraverseOptions = {
	includeSymbols: false,
	immutable: false,
};

// Shared per-walk state — one allocation per traversal, referenced by every node.
interface WalkState {
	alive: boolean;
	immutable: boolean;
	iter: (obj: object) => PropertyKey[];
	max_depth: number | undefined;
	path: PropertyKey[];
	parents: WalkContext[];
	descend_map_set: boolean;
	concurrency: number;
}

// before/after/pre/post hooks — lazily allocated, so the common path that uses
// none of them carries a single `null` field instead of four.
interface Modifiers {
	before?: (ctx: TraverseContext, value: any) => void;
	after?: (ctx: TraverseContext, value: any) => void;
	pre?: (ctx: TraverseContext, child: any, key: any) => void;
	post?: (ctx: TraverseContext, child: any) => void;
}

/**
 * The traversal context. Every method lives on the prototype, so visiting a
 * node allocates a *single* object — not a context object plus a fresh closure
 * for each of `update`/`remove`/`before`/… and a separate `modifiers` object.
 * That, plus the lazily-derived {@link path}, is what makes the modern build
 * dramatically faster and lighter on the GC than the classic design.
 *
 * @see https://neotraverse.puruvj.dev/guide/context
 */
class WalkContext implements TraverseContext {
	node: any;
	node_: any;
	parent: TraverseContext | undefined;
	key: PropertyKey | undefined;
	isRoot: boolean;
	isLeaf = false;
	isFirst = false;
	isLast = false;
	level: number;
	circular: TraverseContext | undefined = undefined;
	keys: PropertyKey[] | null = null;

	// internal (kept as plain fields for a monomorphic shape)
	w: WalkState;
	keep_going = true;
	// set by remove()/delete(): tells the parent's descend loop to skip the writeback
	// so the slot isn't re-added. The array index shift (after a remove() splice) is
	// detected separately by array length, so a delete() hole doesn't shift (C-3).
	removed = false;
	mods: Modifiers | null = null;
	constructor(w: WalkState, node_: any, node: any) {
		const path = w.path;
		const level = path.length;
		this.w = w;
		this.node = node;
		this.node_ = node_;
		this.parent = w.parents[level - 1];
		this.key = path[level - 1];
		this.isRoot = level === 0;
		this.level = level;
	}

	// the live ancestor stack — shared, so it's read straight off the walk state
	get parents(): TraverseContext[] {
		return this.w.parents;
	}

	// derived flags — no per-node storage
	get notRoot(): boolean {
		return !this.isRoot;
	}
	get notLeaf(): boolean {
		return !this.isLeaf;
	}

	// `path` is derived from the parent chain on demand, so the common ops
	// (forEach/map/clone/reduce/nodes) never pay for a per-node array copy.
	get path(): PropertyKey[] {
		// Fill a pre-sized array back-to-front — no push, no reverse()/toReversed().
		const out = new Array<PropertyKey>(this.level);
		let c: WalkContext = this;
		for (let i = this.level - 1; i >= 0; i--) {
			out[i] = c.key as PropertyKey;
			c = c.parent as WalkContext;
		}
		return out;
	}
	update(x: any, stopHere: boolean = false): void {
		if (!this.isRoot) {
			safe_set((this.parent as WalkContext).node, this.key as PropertyKey, x);
		}
		this.node = x;
		if (stopHere) this.keep_going = false;
	}
	delete(stopHere?: boolean): void {
		delete (this.parent as WalkContext).node[this.key as PropertyKey];
		// Mark so the descend writeback doesn't re-add the just-deleted slot. Unlike
		// remove(), delete() leaves an array hole (no length change), so it triggers
		// no index shift — the descend loop detects shifts by array length (DEEP-1).
		this.removed = true;
		if (stopHere) this.keep_going = false;
	}
	remove(stopHere?: boolean): void {
		const parent = (this.parent as WalkContext).node;
		if (is_array(parent)) {
			parent.splice(this.key as number, 1);
		} else {
			delete parent[this.key as PropertyKey];
		}
		this.removed = true;
		if (stopHere) this.keep_going = false;
	}
	before(f: (ctx: TraverseContext, value: any) => void): void {
		(this.mods ??= {}).before = f;
	}
	after(f: (ctx: TraverseContext, value: any) => void): void {
		(this.mods ??= {}).after = f;
	}
	pre(f: (ctx: TraverseContext, child: any, key: any) => void): void {
		(this.mods ??= {}).pre = f;
	}
	post(f: (ctx: TraverseContext, child: any) => void): void {
		(this.mods ??= {}).post = f;
	}
	stop(): void {
		this.w.alive = false;
	}
	block(): void {
		this.keep_going = false;
	}
	nextSibling(): WalkContext | undefined {
		const parent = this.parent as WalkContext | undefined;
		if (!parent?.keys || this.key === undefined) return undefined;
		const keys = parent.keys;
		const idx = keys.indexOf(this.key);
		if (idx < 0 || idx >= keys.length - 1) return undefined;
		return make_sibling_ctx(this, keys[idx + 1]);
	}
	prevSibling(): WalkContext | undefined {
		const parent = this.parent as WalkContext | undefined;
		if (!parent?.keys || this.key === undefined) return undefined;
		const keys = parent.keys;
		const idx = keys.indexOf(this.key);
		if (idx <= 0) return undefined;
		return make_sibling_ctx(this, keys[idx - 1]);
	}
}

// Build a sibling context that mirrors `self` (same parent, same level) but for
// `sibKey`. Constructed against the live parent chain rather than a snapshot
// WalkState, so `level`/`parent`/`path` stay correct and `.path` never throws
// (C-4). Also far cheaper than the old per-call WalkState + slice() allocations.
function make_sibling_ctx(self: WalkContext, sibKey: PropertyKey): WalkContext {
	const w = self.w;
	const parent = self.parent as WalkContext;
	const sibNode = get_child_at(parent.node, sibKey, w.descend_map_set);
	const sib = new WalkContext(w, sibNode, sibNode);
	sib.parent = parent;
	sib.key = sibKey;
	sib.level = self.level;
	sib.isRoot = self.level === 0;
	if (typeof sibNode === 'object' && sibNode !== null) {
		sib.keys = initial_keys(w, sibNode, w.iter);
		sib.isLeaf = sib.keys.length === 0;
	} else {
		sib.isLeaf = true;
	}
	return sib;
}

function make_walk_state(options: TraverseOptions = empty_null, immutable?: boolean): WalkState {
	return {
		alive: true,
		immutable: immutable ?? !!options.immutable,
		iter: options.includeSymbols ? own_enumerable_keys : object_keys,
		max_depth: options.maxDepth,
		path: [],
		parents: [],
		descend_map_set: !!options.descendIntoMapSet,
		// Clamp to a positive integer. NaN / fractional / <1 values silently dropped
		// or skipped nodes via the batch stride; floor and floor again to 1 (A-1).
		concurrency: clamp_concurrency(options.concurrency),
	};
}

function clamp_concurrency(c: number | undefined): number {
	return typeof c === 'number' && c >= 1 ? Math.floor(c) : 1;
}

// Array index segments are exposed as numbers, not strings (C-10), so paths from
// the walk/select/paths line up with parsePath()/patch (which already coerce).
// Mutates the array in place — callers always pass a fresh `Object.keys` result.
// Object keys that merely look numeric (`{ '0': … }`) are untouched: only true
// array indices round-trip `String(+k) === k`.
function array_numeric(keys: PropertyKey[]): PropertyKey[] {
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
function array_keys(node: any[], keys: PropertyKey[]): PropertyKey[] {
	const len = node.length;
	if (keys.length === len) {
		for (let i = 0; i < len; i++) keys[i] = i;
		return keys;
	}
	return array_numeric(keys); // sparse / extra-key / symbol — coerce per key
}

function map_set_child_keys(node: Map<any, any> | Set<any>): PropertyKey[] {
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

function get_child_at(node: any, key: PropertyKey, descend_map_set: boolean): any {
	if (descend_map_set && node instanceof Map) return node.get(key);
	if (descend_map_set && node instanceof Set) return [...node][key as number];
	return node[key];
}

function descend_children(
	w: WalkState,
	ctx: WalkContext,
	node: any,
	walker: (node_: any) => WalkContext,
	immutable: boolean,
	mods: Modifiers | null,
	// true when `node` is the untouched copy we just made: every key is present and
	// writable, so the per-key hasOwn + gopd guards can be skipped (DEEP-2).
	fresh: boolean,
): void {
	const { path } = w;
	const pre = mods !== null ? mods.pre : undefined;
	const post = mods !== null ? mods.post : undefined;
	if (w.descend_map_set && node instanceof Map) {
		const entries = [...node.entries()];
		const last = entries.length - 1;
		for (let index = 0; index <= last; index++) {
			if (!w.alive && !immutable) break; // stop() — don't allocate contexts for remaining siblings (W2)
			const [key, val] = entries[index];
			path.push(key);
			if (pre !== undefined) pre(ctx, val, key);
			const child = walker(val);
			// write the value back into the cloned Map entry only if it changed (C-9, DEEP-1)
			if (immutable && child.node !== val) (node as Map<any, any>).set(key, child.node);
			child.isLast = index === last;
			child.isFirst = index === 0;
			if (post !== undefined) post(ctx, child);
			path.pop();
		}
		return;
	}
	if (w.descend_map_set && node instanceof Set) {
		const vals = [...node];
		const last = vals.length - 1;
		for (let index = 0; index <= last; index++) {
			if (!w.alive && !immutable) break; // stop() — don't allocate contexts for remaining siblings (W2)
			path.push(index);
			if (pre !== undefined) pre(ctx, vals[index], index);
			const child = walker(vals[index]);
			// rewrite the cloned Set member if the callback replaced it (C-9)
			if (immutable && child.node !== vals[index]) {
				(node as Set<any>).delete(vals[index]);
				(node as Set<any>).add(child.node);
			}
			child.isLast = index === last;
			child.isFirst = index === 0;
			if (post !== undefined) post(ctx, child);
			path.pop();
		}
		return;
	}
	const keys = ctx.keys as PropertyKey[];
	const node_is_array = is_array(node);
	let last = keys.length - 1;
	for (let index = 0; index <= last; index++) {
		if (!w.alive && !immutable) break; // stop() — don't allocate contexts for remaining siblings (W2)
		const key = keys[index];
		const childVal = node[key];
		const len_before = node_is_array ? node.length : 0;
		path.push(key);
		if (pre !== undefined) pre(ctx, childVal, key);
		const child = walker(childVal);
		// Skip the writeback when `node[key]` already holds child.node — either the
		// value was unchanged (still the fresh copy's value) or ctx.update() already
		// wrote it into `node` during the callback (DEEP-1). `removed` covers
		// remove()/delete() so the slot isn't re-added. For a fresh copy every key is
		// present and writable, so skip the hasOwn + gopd guards (DEEP-2); fall back
		// to the full guard only when the callback replaced the node.
		if (immutable && !child.removed && node[key] !== child.node) {
			if (fresh || (has_own_property.call(node, key) && !is_non_writable(node, key))) {
				safe_set(node, key, child.node);
			}
		}
		child.isLast = index === last;
		child.isFirst = index === 0;
		if (post !== undefined) post(ctx, child);
		path.pop();
		// remove() spliced this element out of an array: the array shrank, so elements
		// shifted left — revisit the same index and shrink the bound (C-3). A delete()
		// leaves a hole (no length change), so it does not shift.
		if (node_is_array && node.length < len_before) {
			index--;
			last--;
		}
	}
}

// Recompute keys/isLeaf after the cb replaced the node (the uncommon path).
function update_state(ctx: WalkContext): void {
	const node = ctx.node;
	if (typeof node === 'object' && node !== null) {
		if (!ctx.keys || ctx.node_ !== node) {
			if (ctx.w.descend_map_set && node instanceof Map) {
				ctx.keys = map_set_child_keys(node);
			} else if (ctx.w.descend_map_set && node instanceof Set) {
				ctx.keys = map_set_child_keys(node);
			} else {
				const ks = ctx.w.iter(node);
				ctx.keys = is_array(node) ? array_keys(node, ks) : ks;
			}
		}
		ctx.isLeaf = ctx.keys.length === 0;
	} else {
		ctx.isLeaf = true;
		ctx.keys = null;
	}
}

function initial_keys(
	w: WalkState,
	node0: object,
	iter: (obj: object) => PropertyKey[],
): PropertyKey[] {
	if (w.descend_map_set && node0 instanceof Map) return map_set_child_keys(node0);
	if (w.descend_map_set && node0 instanceof Set) return map_set_child_keys(node0);
	const keys = iter(node0);
	return is_array(node0) ? array_keys(node0, keys) : keys;
}

/**
 * Depth-first walk; {@link forEach} and {@link map} use this internally.
 *
 * @example
 * ```js
 * import { walk } from 'neotraverse/modern';
 * walk({ a: { b: 1 } }, (ctx) => {
 *   if (ctx.path.join('.') === 'a.b') ctx.update(2);
 * });
 * // => { a: { b: 2 } }
 * ```
 *
 * @see https://neotraverse.puruvj.dev/guide/api/walk#t-walk
 */
export function walk(
	root: any,
	cb: (ctx: TraverseContext, v: any) => void,
	options: TraverseOptions = empty_null,
) {
	const w = make_walk_state(options);
	const { immutable, max_depth, parents, iter } = w;
	const walker = (node_: any): WalkContext => {
		assert_within_depth(w.path.length, max_depth);

		const node0 = immutable ? copy(node_, options) : node_;
		const ctx = new WalkContext(w, node_, node0);

		if (!w.alive) return ctx;

		const node0_is_obj = typeof node0 === 'object' && node0 !== null;
		if (node0_is_obj) {
			const keys0 = initial_keys(w, node0, iter);
			ctx.keys = keys0;
			ctx.isLeaf = keys0.length === 0;
			for (let i = 0; i < parents.length; i++) {
				if (parents[i].node_ === node_) {
					ctx.circular = parents[i];
					break;
				}
			}
		} else {
			ctx.isLeaf = true;
		}

		const ret = cb(ctx, node0);
		if (ret !== undefined) ctx.update(ret);

		const mods = ctx.mods;
		if (mods !== null && mods.before !== undefined) mods.before(ctx, ctx.node);

		if (!ctx.keep_going) return ctx;

		const node = ctx.node;
		const fresh = node === node0; // callback didn't replace the node — copy is ours
		const descend = fresh ? node0_is_obj : typeof node === 'object' && node !== null;
		if (descend && ctx.circular === undefined) {
			parents.push(ctx);
			if (!fresh) update_state(ctx);
			descend_children(w, ctx, node, walker, immutable, mods, fresh);
			parents.pop();
		}

		if (mods !== null && mods.after !== undefined) mods.after(ctx, ctx.node);

		return ctx;
	};
	return walker(root).node;
}

// Async twin of walk(): identical shape, but awaits the callback and the
// recursive descent — so the callback may be `async`. The structural hooks
// (before/after/pre/post) still run synchronously. Reuses WalkContext/WalkState/
// copy/update_state/safe_set verbatim; only the recursion is duplicated as async.
// An optional AbortSignal cancels the walk on the next visited node
// (`throwIfAborted` rejects the returned promise).
async function walk_async(
	root: any,
	cb: (ctx: TraverseContext, v: any) => void | Promise<void>,
	options: TraverseOptions = empty_null,
): Promise<any> {
	const w = make_walk_state(options);
	const { immutable, iter } = w;
	const signal = options.signal;
	const walker = async (node_: any, state: WalkState = w): Promise<WalkContext> => {
		signal?.throwIfAborted();
		assert_within_depth(state.path.length, state.max_depth);

		const node0 = immutable ? copy(node_, options) : node_;
		const ctx = new WalkContext(state, node_, node0);

		if (!state.alive) return ctx;

		const node0_is_obj = typeof node0 === 'object' && node0 !== null;
		if (node0_is_obj) {
			const keys0 = initial_keys(state, node0, iter);
			ctx.keys = keys0;
			ctx.isLeaf = keys0.length === 0;
			for (let i = 0; i < state.parents.length; i++) {
				if (state.parents[i].node_ === node_) {
					ctx.circular = state.parents[i];
					break;
				}
			}
		} else {
			ctx.isLeaf = true;
		}

		const ret = await cb(ctx, node0);
		if (ret !== undefined) ctx.update(ret);

		const mods = ctx.mods;
		if (mods !== null && mods.before !== undefined) mods.before(ctx, ctx.node);

		if (!ctx.keep_going) return ctx;

		const node = ctx.node;
		const descend = node === node0 ? node0_is_obj : typeof node === 'object' && node !== null;
		if (descend && ctx.circular === undefined) {
			state.parents.push(ctx);
			if (node !== node0) update_state(ctx);
			await descend_children_async(state, ctx, node, walker, immutable, mods);
			state.parents.pop();
		}

		if (mods !== null && mods.after !== undefined) mods.after(ctx, ctx.node);

		return ctx;
	};
	return (await walker(root)).node;
}

async function descend_children_async(
	w: WalkState,
	ctx: WalkContext,
	node: any,
	walker: (node_: any, state?: WalkState) => Promise<WalkContext>,
	immutable: boolean,
	mods: Modifiers | null,
): Promise<void> {
	const { path, parents } = w;
	const pre = mods !== null ? mods.pre : undefined;
	const post = mods !== null ? mods.post : undefined;
	const limit = w.concurrency;
	const visitOne = async (key: PropertyKey, childVal: any, index: number, last: number) => {
		const childState: WalkState = {
			alive: w.alive,
			immutable: w.immutable,
			iter: w.iter,
			max_depth: w.max_depth,
			path: path.slice(),
			parents: parents.slice(),
			descend_map_set: w.descend_map_set,
			concurrency: w.concurrency,
		};
		childState.path.push(key);
		if (pre !== undefined) pre(ctx, childVal, key);
		const child = await walker(childVal, childState);
		// Mirror the sync descend writeback (incl. Map/Set entries, C-9), but only when
		// the slot doesn't already hold child.node — unchanged leaves and values that
		// ctx.update() already wrote are skipped (DEEP-1).
		if (immutable && !child.removed) {
			if (node instanceof Map) {
				if (node.get(key) !== child.node) node.set(key, child.node);
			} else if (node instanceof Set) {
				if (childVal !== child.node) {
					node.delete(childVal);
					node.add(child.node);
				}
			} else if (node[key] !== child.node && has_own_property.call(node, key) && !is_non_writable(node, key)) {
				safe_set(node, key, child.node);
			}
		}
		child.isLast = index === last;
		child.isFirst = index === 0;
		if (post !== undefined) post(ctx, child);
	};
	if (w.descend_map_set && node instanceof Map) {
		const entries = [...node.entries()];
		const last = entries.length - 1;
		for (let start = 0; start <= last; start += limit) {
			if (!w.alive && !immutable) break; // stop() — don't launch further sibling batches (W2)
			const end = Math.min(last, start + limit - 1);
			const tasks: Promise<void>[] = [];
			for (let index = start; index <= end; index++) {
				const [key, val] = entries[index];
				tasks.push(visitOne(key, val, index, last));
			}
			await Promise.all(tasks);
		}
		return;
	}
	if (w.descend_map_set && node instanceof Set) {
		const vals = [...node];
		const last = vals.length - 1;
		for (let start = 0; start <= last; start += limit) {
			if (!w.alive && !immutable) break; // stop() — don't launch further sibling batches (W2)
			const end = Math.min(last, start + limit - 1);
			const tasks: Promise<void>[] = [];
			for (let index = start; index <= end; index++) {
				tasks.push(visitOne(index, vals[index], index, last));
			}
			await Promise.all(tasks);
		}
		return;
	}
	const keys = ctx.keys as PropertyKey[];
	const last = keys.length - 1;
	for (let start = 0; start <= last; start += limit) {
		const end = Math.min(last, start + limit - 1);
		const tasks: Promise<void>[] = [];
		for (let index = start; index <= end; index++) {
			const key = keys[index];
			tasks.push(visitOne(key, node[key], index, last));
		}
		await Promise.all(tasks);
	}
}

interface BfsQueueItem {
	node_: any;
	parents: WalkContext[];
	parent: WalkContext | undefined;
	key: PropertyKey | undefined;
	level: number;
}

function walk_bfs(
	root: any,
	cb: (ctx: TraverseContext, v: any) => void,
	options: TraverseOptions = empty_null,
): any {
	const w = make_walk_state(options);
	const immutable = w.immutable;
	const iter = w.iter;
	const queue: BfsQueueItem[] = [{ node_: root, parents: [], parent: undefined, key: undefined, level: 0 }];
	let head = 0;
	let rootOut = root;
	while (head < queue.length && w.alive) {
		const item = queue[head++];
		const { node_, parents, parent, key, level } = item;
		assert_within_depth(level, w.max_depth);

		// `parents` (the ancestor array) is still threaded for ctx.parents + circular
		// detection — but it's shared per-parent, not per-child. The per-node path is
		// derived lazily from the parent chain (ctx.parent/level), so callbacks that
		// never read ctx.path pay no per-node path allocation (P-5).
		w.parents = parents;

		const node0 = immutable ? copy(node_, options) : node_;
		const ctx = new WalkContext(w, node_, node0);
		ctx.parent = parent;
		ctx.key = key;
		ctx.level = level;
		ctx.isRoot = level === 0;

		const node0_is_obj = typeof node0 === 'object' && node0 !== null;
		if (node0_is_obj) {
			const keys0 = initial_keys(w, node0, iter);
			ctx.keys = keys0;
			ctx.isLeaf = keys0.length === 0;
			for (let i = 0; i < parents.length; i++) {
				if (parents[i].node_ === node_) {
					ctx.circular = parents[i];
					break;
				}
			}
		} else {
			ctx.isLeaf = true;
		}

		const ret = cb(ctx, node0);
		if (ret !== undefined) ctx.update(ret);
		if (level === 0) rootOut = ctx.node;

		// Write back into the parent copy only when the slot doesn't already hold the
		// value — unchanged leaves are already present from the parent's copy, and
		// ctx.update() may have written it during the callback (DEEP-1). This also
		// skips the gopd for those nodes.
		if (immutable && parent !== undefined) {
			const pk = key as PropertyKey;
			if (
				parent.node[pk] !== ctx.node &&
				has_own_property.call(parent.node, pk) &&
				!is_non_writable(parent.node, pk)
			) {
				safe_set(parent.node, pk, ctx.node);
			}
		}

		const mods = ctx.mods;
		if (mods !== null && mods.before !== undefined) mods.before(ctx, ctx.node);

		if (!ctx.keep_going) {
			if (mods !== null && mods.after !== undefined) mods.after(ctx, ctx.node);
			continue;
		}

		const node = ctx.node;
		const descend = node === node0 ? node0_is_obj : typeof node === 'object' && node !== null;
		if (!descend || ctx.circular !== undefined) {
			if (mods !== null && mods.after !== undefined) mods.after(ctx, ctx.node);
			continue;
		}

		if (node !== node0) update_state(ctx);
		const keys = ctx.keys as PropertyKey[];
		const childParents = parents.concat(ctx);
		const childLevel = level + 1;
		const last = keys.length - 1;
		const pre = mods !== null ? mods.pre : undefined;

		if (w.descend_map_set && node instanceof Map) {
			const entries = [...node.entries()];
			for (let index = 0; index <= last; index++) {
				const [k, val] = entries[index];
				if (pre !== undefined) pre(ctx, val, k);
				queue.push({ node_: val, parents: childParents, parent: ctx, key: k, level: childLevel });
			}
		} else if (w.descend_map_set && node instanceof Set) {
			const vals = [...node];
			for (let index = 0; index <= last; index++) {
				if (pre !== undefined) pre(ctx, vals[index], index);
				queue.push({ node_: vals[index], parents: childParents, parent: ctx, key: index, level: childLevel });
			}
		} else {
			for (let index = 0; index <= last; index++) {
				const k = keys[index];
				const childVal = node[k];
				if (pre !== undefined) pre(ctx, childVal, k);
				queue.push({ node_: childVal, parents: childParents, parent: ctx, key: k, level: childLevel });
			}
		}

		if (mods !== null && mods.after !== undefined) mods.after(ctx, ctx.node);
	}
	return rootOut;
}

/**
 * Breadth-first {@link forEach}; visit order is level-by-level, not depth-first.
 *
 * @example
 * ```js
 * import { breadthFirst } from 'neotraverse/modern';
 * const order = [];
 * breadthFirst({ a: 1, b: { c: 2 } }, (ctx) => order.push(ctx.path.join('.')));
 * // order => ['', 'a', 'b', 'b.c']
 * ```
 *
 * @see https://neotraverse.puruvj.dev/guide/api/walk#t-bfs
 */
export function breadthFirst(
	obj: any,
	cb: (ctx: TraverseContext, v: any) => void,
	options?: TraverseOptions,
): any {
	return walk_bfs(obj, cb, options);
}

/**
 * Breadth-first {@link map} (immutable clone with callback writeback).
 *
 * @example
 * ```js
 * import { mapBfs } from 'neotraverse/modern';
 * mapBfs({ items: [{ n: 1 }, { n: 2 }] }, (ctx, v) => {
 *   if (typeof v === 'number') ctx.update(v * 10);
 * });
 * // => { items: [{ n: 10 }, { n: 20 }] }
 * ```
 *
 * @see https://neotraverse.puruvj.dev/guide/api/walk#t-bfs
 */
export function mapBfs(
	obj: any,
	cb: (ctx: TraverseContext, v: any) => void,
	options?: TraverseOptions,
): any {
	return walk_bfs(obj, cb, { ...options, immutable: true });
}

/**
 * Callback helper: calls {@link TraverseContext.block} when `pred` is truthy.
 * Compose with other callbacks in a single {@link forEach} / {@link map} pass.
 *
 * @example
 * ```js
 * import { forEach, skipWhere } from 'neotraverse/modern';
 * forEach({ a: 1, b: 2 }, skipWhere((ctx) => ctx.key === 'a'));
 * // visits only { b: 2 }
 * ```
 *
 * @see https://neotraverse.puruvj.dev/guide/api/walk#t-skip-where
 */
export function skipWhere(
	pred: (ctx: TraverseContext, value: any) => unknown,
): (ctx: TraverseContext, value: any) => void {
	return (ctx, value) => {
		if (pred(ctx, value)) ctx.block();
	};
}

/**
 * Bucket every visited value by `keyFn(ctx, value)` in one walk.
 *
 * @example
 * ```js
 * import { groupBy } from 'neotraverse/modern';
 * groupBy({ a: 1, b: 2, c: 3 }, (_, v) => (v % 2 ? 'odd' : 'even'));
 * // Map { 'odd' => [1, 3], 'even' => [2] }
 * ```
 *
 * @see https://neotraverse.puruvj.dev/guide/api/walk#t-group-by
 */
export function groupBy(
	obj: any,
	keyFn: (ctx: TraverseContext, value: any) => PropertyKey,
	options?: TraverseOptions,
): Map<PropertyKey, any[]> {
	const buckets = new Map<PropertyKey, any[]>();
	forEach(
		obj,
		(ctx, v) => {
			const k = keyFn(ctx, v);
			let arr = buckets.get(k);
			if (!arr) {
				arr = [];
				buckets.set(k, arr);
			}
			arr.push(v);
		},
		options,
	);
	return buckets;
}

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

// Tree-shakeable functional API. Terminal ops take options as the last argument.
// No pipe() helper: ops are heterogeneous; map/clone nest as plain calls.

/**
 * @example
 * ```js
 * import { get } from 'neotraverse/modern';
 * get({ user: { name: 'Ada' } }, ['user', 'name']);
 * // => 'Ada'
 * ```
 *
 * @see https://neotraverse.puruvj.dev/guide/api/core#t-get-set-has
 */
export function get(obj: any, paths: PropertyKey[], options?: TraverseOptions): any {
	let node = obj;
	const symbols = options?.includeSymbols;
	for (let i = 0; i < paths.length; i++) {
		// Stop only on null/undefined — a falsy-but-indexable value (0, '', false)
		// must still be checked for the next own key, not short-circuit (C-2).
		if (node === null || node === undefined) return void undefined;
		const key = paths[i];

		if ((!symbols && typeof key === 'symbol') || !has_own_property.call(node, key)) {
			return void undefined;
		}

		node = node[key];
	}
	return node;
}

/**
 * @example
 * ```js
 * import { has } from 'neotraverse/modern';
 * has({ a: 1 }, ['a']); // => true
 * has({ a: 1 }, ['b']); // => false
 * ```
 *
 * @see https://neotraverse.puruvj.dev/guide/api/core#t-get-set-has
 */
export function has(obj: any, paths: PropertyKey[], options?: TraverseOptions): boolean {
	let node = obj;
	const symbols = options?.includeSymbols;
	for (let i = 0; i < paths.length; i++) {
		// Stop only on null/undefined — a falsy-but-indexable value (0, '', false)
		// is not a match for deeper keys but must be probed, not short-circuited (C-2).
		if (node === null || node === undefined) return false;
		const key = paths[i];

		if ((!symbols && typeof key === 'symbol') || !has_own_property.call(node, key)) {
			return false;
		}

		node = node[key];
	}
	return true;
}

/**
 * @example
 * ```js
 * import { set } from 'neotraverse/modern';
 * const o = {};
 * set(o, ['user', 'id'], 42);
 * // o => { user: { id: 42 } }
 * ```
 *
 * @see https://neotraverse.puruvj.dev/guide/api/core#t-get-set-has
 */
export function set(obj: any, path: PropertyKey[], value: any, _options?: TraverseOptions): any {
	const n = path.length;
	if (n === 0) return value;
	// A1: coerce each key to a primitive ONCE. A boxed/object key (`new String('__proto__')`)
	// string-coerces on assignment, so checking the raw key but writing the coerced one — or
	// calling a malicious toString twice — could slip `__proto__` past the guard (TOCTOU).
	// Normalizing up-front means the unsafe-key check and the write use the identical key.
	const keys: PropertyKey[] = new Array(n);
	for (let i = 0; i < n; i++) {
		const k = path[i];
		keys[i] = typeof k === 'object' && k !== null ? String(k) : k;
	}
	// S-3: fail closed. Reject the whole write up-front if ANY segment is unsafe, so a
	// rejected path never half-creates intermediate containers (no partial mutation).
	for (let i = 0; i < n; i++) {
		if (is_unsafe_key(keys[i])) return value;
	}

	let node = obj;
	for (let i = 0; i < n - 1; i++) {
		const key = keys[i];
		if (!has_own_property.call(node, key)) {
			// C-11: a numeric next segment means the container to create is an array,
			// matching patch()/setAt() autovivification.
			node[key] = typeof keys[i + 1] === 'number' ? [] : {};
		}
		node = node[key];
	}
	safe_set(node, keys[n - 1], value);
	return value;
}

/**
 * @example
 * ```js
 * import { map } from 'neotraverse/modern';
 * map({ count: 1 }, (ctx, v) => {
 *   if (typeof v === 'number') ctx.update(v + 1);
 * });
 * // => { count: 2 }
 * ```
 *
 * @see https://neotraverse.puruvj.dev/guide/api/core#t-map
 */
export function map(
	obj: any,
	cb: (ctx: TraverseContext, v: any) => void,
	options?: TraverseOptions,
): any {
	return walk(obj, cb, { ...options, immutable: true });
}

/**
 * @example
 * ```js
 * import { forEach } from 'neotraverse/modern';
 * forEach([5, -3], (ctx, x) => { if (x < 0) ctx.update(x + 128); });
 * // => [5, 125]
 * ```
 *
 * @see https://neotraverse.puruvj.dev/guide/api/core#t-forEach
 */
export function forEach(
	obj: any,
	cb: (ctx: TraverseContext, v: any) => void,
	options?: TraverseOptions,
): any {
	return walk(obj, cb, options);
}

/**
 * @example
 * ```js
 * import { reduce } from 'neotraverse/modern';
 * reduce({ a: 1, b: 2 }, (acc, ctx, x) => acc + (typeof x === 'number' ? x : 0), 0);
 * // => 3
 * ```
 *
 * @see https://neotraverse.puruvj.dev/guide/api/core#t-reduce
 */
export function reduce(
	obj: any,
	cb: (ctx: TraverseContext, acc: any, v: any) => any,
	init?: any,
	options?: TraverseOptions,
): any {
	const skip = arguments.length === 2;
	let acc = skip ? obj : init;
	forEach(
		obj,
		(ctx, x) => {
			if (!ctx.isRoot || !skip) {
				acc = cb(ctx, acc, x);
			}
		},
		options,
	);
	return acc;
}

/**
 * @example
 * ```js
 * import { find } from 'neotraverse/modern';
 * find({ a: 1, b: 5 }, (_, v) => v > 3);
 * // => 5
 * ```
 *
 * @see https://neotraverse.puruvj.dev/guide/api/query#t-query
 */
export function find(
	obj: any,
	fn: (ctx: TraverseContext, v: any) => unknown,
	options?: TraverseOptions,
): any {
	let result: any;
	forEach(
		obj,
		(ctx, x) => {
			if (fn(ctx, x)) {
				result = x;
				ctx.stop();
			}
		},
		options,
	);
	return result;
}

/**
 * @example
 * ```js
 * import { filter } from 'neotraverse/modern';
 * filter({ a: 1, b: 2, c: 3 }, (_, v) => typeof v === 'number' && v % 2 === 0);
 * // => [2]
 * ```
 *
 * @see https://neotraverse.puruvj.dev/guide/api/query#t-query
 */
export function filter(
	obj: any,
	fn: (ctx: TraverseContext, v: any) => unknown,
	options?: TraverseOptions,
): any[] {
	const acc: any[] = [];
	forEach(
		obj,
		(ctx, x) => {
			if (fn(ctx, x)) acc.push(x);
		},
		options,
	);
	return acc;
}

/**
 * @example
 * ```js
 * import { some } from 'neotraverse/modern';
 * some({ a: 1, b: 2 }, (_, v) => v > 1);
 * // => true
 * ```
 *
 * @see https://neotraverse.puruvj.dev/guide/api/query#t-query
 */
export function some(
	obj: any,
	fn: (ctx: TraverseContext, v: any) => unknown,
	options?: TraverseOptions,
): boolean {
	let result = false;
	forEach(
		obj,
		(ctx, x) => {
			if (fn(ctx, x)) {
				result = true;
				ctx.stop();
			}
		},
		options,
	);
	return result;
}

/**
 * @example
 * ```js
 * import { every } from 'neotraverse/modern';
 * every({ a: 2, b: 4 }, (_, v) => typeof v !== 'number' || v % 2 === 0);
 * // => true
 * ```
 *
 * @see https://neotraverse.puruvj.dev/guide/api/query#t-query
 */
export function every(
	obj: any,
	fn: (ctx: TraverseContext, v: any) => unknown,
	options?: TraverseOptions,
): boolean {
	let result = true;
	forEach(
		obj,
		(ctx, x) => {
			if (!fn(ctx, x)) {
				result = false;
				ctx.stop();
			}
		},
		options,
	);
	return result;
}

/**
 * @example
 * ```js
 * import { paths } from 'neotraverse/modern';
 * paths({ a: { b: 1 } });
 * // => [[], ['a'], ['a', 'b']]
 * ```
 *
 * @see https://neotraverse.puruvj.dev/guide/api/core#t-paths-nodes
 */
export function paths(obj: any, options?: TraverseOptions): PropertyKey[][] {
	const acc: PropertyKey[][] = [];
	forEach(
		obj,
		(ctx) => {
			acc.push(ctx.path);
		},
		options,
	);
	return acc;
}

/**
 * @example
 * ```js
 * import { nodes } from 'neotraverse/modern';
 * nodes({ x: 1, y: { z: 2 } }).filter((v) => typeof v === 'number');
 * // => [1, 2]
 * ```
 *
 * @see https://neotraverse.puruvj.dev/guide/api/core#t-paths-nodes
 */
export function nodes(obj: any, options?: TraverseOptions): any[] {
	const acc: any[] = [];
	forEach(
		obj,
		(ctx) => {
			acc.push(ctx.node);
		},
		options,
	);
	return acc;
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

/**
 * Lazy `[path, node]` pairs in depth-first order.
 *
 * @example
 * ```js
 * import { entries } from 'neotraverse/modern';
 * [...entries({ a: 1 })];
 * // => [[[], { a: 1 }], [['a'], 1]]
 * ```
 *
 * @see https://neotraverse.puruvj.dev/guide/api/iteration#t-entries
 */
export function* entries(obj: any, options?: TraverseOptions): Generator<[PropertyKey[], any]> {
	yield* iterate(
		obj,
		[],
		options?.includeSymbols ? own_enumerable_keys : object_keys,
		new Set(),
		options?.maxDepth,
		0,
	);
}

/**
 * Lazy node values in depth-first order.
 *
 * @example
 * ```js
 * import { values } from 'neotraverse/modern';
 * [...values({ a: 1, b: 2 })];
 * // => [{ a: 1, b: 2 }, 1, 2]
 * ```
 *
 * @see https://neotraverse.puruvj.dev/guide/api/iteration#t-values
 */
export function* values(obj: any, options?: TraverseOptions): Generator<any> {
	yield* iterate_values(
		obj,
		options?.includeSymbols ? own_enumerable_keys : object_keys,
		new Set(),
		options?.maxDepth,
		0,
	);
}

// Value-only twin of iterate(): skips the per-node path.concat that entries() needs,
// so values() allocates nothing per node beyond the generator frames (P-5).
function* iterate_values(
	node: any,
	iter: (obj: object) => PropertyKey[],
	seen: Set<object>,
	max_depth: number | undefined,
	depth: number,
): Generator<any> {
	yield node;
	if (typeof node !== 'object' || node === null) return;
	if (seen.has(node)) return; // circular — visited, but don't descend
	assert_within_depth(depth, max_depth);
	seen.add(node);
	const keys = iter(node);
	for (let i = 0; i < keys.length; i++) {
		yield* iterate_values(node[keys[i]], iter, seen, max_depth, depth + 1);
	}
	seen.delete(node);
}

/**
 * @example
 * ```js
 * import { values } from 'neotraverse/modern';
 * [...values({ a: 1, b: 2 })].filter((v) => typeof v === 'number');
 * // => [1, 2]
 * ```
 *
 * @see https://neotraverse.puruvj.dev/guide/api/async#t-async
 */
export async function forEachAsync(
	obj: any,
	cb: (ctx: TraverseContext, v: any) => void | Promise<void>,
	options?: TraverseOptions,
): Promise<any> {
	return walk_async(obj, cb, options);
}

/**
 * @example
 * ```js
 * import { mapAsync } from 'neotraverse/modern';
 * await mapAsync({ n: 1 }, async (ctx, v) => {
 *   if (typeof v === 'number') ctx.update(v * 2);
 * });
 * // => { n: 2 }
 * ```
 *
 * @see https://neotraverse.puruvj.dev/guide/api/async#t-async
 */
export async function mapAsync(
	obj: any,
	cb: (ctx: TraverseContext, v: any) => void | Promise<void>,
	options?: TraverseOptions,
): Promise<any> {
	return walk_async(obj, cb, { ...options, immutable: true });
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

function coerceKey(segment: string): PropertyKey {
	// Only coerce canonical, safe integers. A round-trip check rejects
	// leading-zero (`"08"`) and oversized (`"9".repeat(20)`) segments that would
	// otherwise be silently corrupted into a different/imprecise number (C-13).
	if (INT_RE.test(segment)) {
		const n = Number(segment);
		if (Number.isSafeInteger(n) && String(n) === segment) return n;
	}
	return segment;
}

function assertSafePath(keys: PropertyKey[]): void {
	// is_unsafe_key coerces boxed/object keys itself, so don't gate on typeof here (A2).
	for (let i = 0; i < keys.length; i++) {
		if (is_unsafe_key(keys[i])) {
			throw new Error(`neotraverse: unsafe path segment "${String(keys[i])}"`);
		}
	}
}

/**
 * Dot notation (`a.b.0`). Use a leading `/` for JSON Pointer (`/a/b/0`).
 *
 * @example
 * ```js
 * import { parsePath } from 'neotraverse/modern';
 * parsePath('user.name'); // => ['user', 'name']
 * parsePath('/user/0'); // => ['user', 0]
 * ```
 *
 * @see https://neotraverse.puruvj.dev/guide/api/paths#t-string-paths
 */
export function parsePath(path: string): PropertyKey[] {
	if (path.startsWith('/')) return parseJsonPointer(path);
	return parseDotPath(path);
}

/**
 * @example
 * ```js
 * import { parseDotPath } from 'neotraverse/modern';
 * parseDotPath('users[0].name'); // => ['users', '0', 'name']
 * ```
 *
 * @see https://neotraverse.puruvj.dev/guide/api/paths#t-string-paths
 */
export function parseDotPath(path: string): PropertyKey[] {
	const keys: PropertyKey[] = [];
	let cur = '';
	for (let i = 0; i < path.length; i++) {
		if (path[i] === '\\' && path[i + 1] === '.') {
			cur += '.';
			i++;
			continue;
		}
		if (path[i] === '.') {
			if (cur.length) keys.push(coerceKey(cur));
			cur = '';
			continue;
		}
		cur += path[i];
	}
	if (cur.length) keys.push(coerceKey(cur));
	assertSafePath(keys);
	return keys;
}

/**
 * @example
 * ```js
 * import { parseJsonPointer } from 'neotraverse/modern';
 * parseJsonPointer('/defs/Pet'); // => ['defs', 'Pet']
 * ```
 *
 * @see https://neotraverse.puruvj.dev/guide/api/paths#t-string-paths
 */
export function parseJsonPointer(pointer: string): PropertyKey[] {
	if (pointer === '') return [];
	if (!pointer.startsWith('/')) throw new Error('neotraverse: JSON Pointer must start with "/"');
	const raw = pointer.slice(1).split('/');
	const keys = raw.map((seg) => coerceKey(seg.replace(PTR_UNESCAPE_SLASH_RE, '/').replace(PTR_UNESCAPE_TILDE_RE, '~')));
	assertSafePath(keys);
	return keys;
}

/**
 * @example
 * ```js
 * import { pointerPath } from 'neotraverse/modern';
 * pointerPath(['user', 0, 'name']); // => '/user/0/name'
 * ```
 *
 * @see https://neotraverse.puruvj.dev/guide/api/paths#t-string-paths
 */
export function pointerPath(path: PropertyKey[]): string {
	let out = '';
	for (let i = 0; i < path.length; i++) {
		let s = String(path[i]);
		// Skip the two regex passes unless the segment actually contains a reserved
		// char — the overwhelmingly common case (and pointerPath runs per diff op).
		if (s.indexOf('~') !== -1 || s.indexOf('/') !== -1) s = s.replace(TILDE_RE, '~0').replace(SLASH_RE, '~1');
		out += '/' + s;
	}
	return out;
}

/**
 * @example
 * ```js
 * import { getPath } from 'neotraverse/modern';
 * getPath({ user: { id: 1 } }, 'user.id'); // => 1
 * ```
 *
 * @see https://neotraverse.puruvj.dev/guide/api/paths#t-string-paths
 */
export function getPath(obj: any, path: string, options?: TraverseOptions): any {
	return get(obj, parsePath(path), options);
}

/**
 * @example
 * ```js
 * import { hasPath } from 'neotraverse/modern';
 * hasPath({ user: { id: 1 } }, 'user.email'); // => false
 * ```
 *
 * @see https://neotraverse.puruvj.dev/guide/api/paths#t-string-paths
 */
export function hasPath(obj: any, path: string, options?: TraverseOptions): boolean {
	return has(obj, parsePath(path), options);
}

/**
 * @example
 * ```js
 * import { setPath } from 'neotraverse/modern';
 * const cfg = { server: { port: 3000 } };
 * setPath(cfg, 'server.port', 8080);
 * ```
 *
 * @see https://neotraverse.puruvj.dev/guide/api/paths#t-string-paths
 */
export function setPath(obj: any, path: string, value: any, options?: TraverseOptions): any {
	return set(obj, parsePath(path), value, options);
}

/**
 * @example
 * ```js
 * import { findPaths } from 'neotraverse/modern';
 * findPaths({ users: [{ flag: true }] }, (_, x) => x === true);
 * // => ['users', '0', 'flag']
 * ```
 *
 * @see https://neotraverse.puruvj.dev/guide/api/paths#t-find-paths
 */
export function findPaths(
	obj: any,
	fn: (ctx: TraverseContext, v: any) => unknown,
	options?: TraverseOptions,
): PropertyKey[] | undefined {
	let found: PropertyKey[] | undefined;
	forEach(
		obj,
		(ctx, x) => {
			if (fn(ctx, x)) {
				found = ctx.path;
				ctx.stop();
			}
		},
		options,
	);
	return found;
}

/**
 * A `path` and `node` pair returned by path query helpers.
 *
 * @see https://neotraverse.puruvj.dev/guide/api/paths#t-find-paths
 */
export interface PathNode {
	/**
	 * Key path from the root to the node.
	 *
	 * @see https://neotraverse.puruvj.dev/guide/api/paths#t-find-paths
	 */
	path: PropertyKey[];

	/**
	 * Value at {@link path}.
	 *
	 * @see https://neotraverse.puruvj.dev/guide/api/paths#t-find-paths
	 */
	node: any;
}

/**
 * @example
 * ```js
 * import { filterPaths } from 'neotraverse/modern';
 * filterPaths({ a: 1, b: 2 }, (_, v) => typeof v === 'number' && v > 1);
 * // => [{ path: ['b'], node: 2 }]
 * ```
 *
 * @see https://neotraverse.puruvj.dev/guide/api/paths#t-find-paths
 */
export function filterPaths(
	obj: any,
	fn: (ctx: TraverseContext, v: any) => unknown,
	options?: TraverseOptions,
): PathNode[] {
	const acc: PathNode[] = [];
	forEach(
		obj,
		(ctx, x) => {
			if (fn(ctx, x)) acc.push({ path: ctx.path, node: ctx.node });
		},
		options,
	);
	return acc;
}

/**
 * @example
 * ```js
 * import { count } from 'neotraverse/modern';
 * count({ a: 1, b: 2, c: 3 }, (_, v) => typeof v === 'number' && v > 1);
 * // => 2
 * ```
 *
 * @see https://neotraverse.puruvj.dev/guide/api/paths#t-count
 */
export function count(
	obj: any,
	fn?: (ctx: TraverseContext, v: any) => unknown,
	options?: TraverseOptions,
): number {
	let n = 0;
	forEach(
		obj,
		(ctx, x) => {
			if (!fn || fn(ctx, x)) n++;
		},
		options,
	);
	return n;
}

/**
 * @example
 * ```js
 * import { size } from 'neotraverse/modern';
 * size({ a: { b: 1 }, c: 2 }); // => 4 (root + a + b + c)
 * ```
 *
 * @see https://neotraverse.puruvj.dev/guide/api/paths#t-count
 */
export function size(obj: any, options?: TraverseOptions): number {
	return count(obj, undefined, options);
}

/**
 * @example
 * ```js
 * import { deleteWhere } from 'neotraverse/modern';
 * deleteWhere({ token: 'secret', ok: true }, (_, x) => x === 'secret');
 * // => { ok: true }
 * ```
 *
 * @see https://neotraverse.puruvj.dev/guide/api/structural#t-prune
 */
export function deleteWhere(
	obj: any,
	fn: (ctx: TraverseContext, v: any) => unknown,
	options?: TraverseOptions,
): any {
	return map(
		obj,
		(ctx, x) => {
			if (fn(ctx, x)) ctx.remove();
		},
		options,
	);
}

/**
 * @example
 * ```js
 * import { prune } from 'neotraverse/modern';
 * prune({ a: 1, b: 2 }, (_, v) => typeof v !== 'number' || v < 2);
 * // => { a: 1 }
 * ```
 *
 * @see https://neotraverse.puruvj.dev/guide/api/structural#t-prune
 */
export function prune(
	obj: any,
	fn: (ctx: TraverseContext, v: any) => unknown,
	options?: TraverseOptions,
): any {
	return deleteWhere(obj, (ctx, x) => !fn(ctx, x), options);
}

/**
 * @example
 * ```js
 * import { pruneDeep } from 'neotraverse/modern';
 * pruneDeep({ a: { b: { c: 1 } } }, 2);
 * // => { a: { b: null } }
 * ```
 *
 * @see https://neotraverse.puruvj.dev/guide/api/structural#t-prune-deep
 */
export function pruneDeep(
	obj: any,
	maxDepth: number,
	replacement: any = null,
	options?: TraverseOptions,
): any {
	return map(
		obj,
		(ctx) => {
			if (ctx.level > maxDepth) {
				ctx.update(replacement);
				ctx.block();
			}
		},
		options,
	);
}

/**
 * @example
 * ```js
 * import { freeze } from 'neotraverse/modern';
 * const o = freeze({ nested: { n: 1 } });
 * Object.isFrozen(o.nested); // => true
 * ```
 *
 * @see https://neotraverse.puruvj.dev/guide/api/structural#t-freeze
 */
export function freeze(obj: any, options?: TraverseOptions): any {
	forEach(
		obj,
		(ctx) => {
			ctx.after(() => {
				const n = ctx.node;
				if (typeof n === 'object' && n !== null) Object.freeze(n);
			});
		},
		options,
	);
	return obj;
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

// SameValueZero: like `===` but NaN equals NaN (and -0 equals 0 via `===`).
const same_value_zero = (x: any, y: any): boolean => x === y || (x !== x && y !== y);

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

type GlobSeg =
	| { kind: 'any' }
	| { kind: 'literal'; key: string }
	| { kind: 'keyAnyIndex'; key: string };

/**
 * @example
 * ```js
 * import { parseGlob } from 'neotraverse/modern';
 * parseGlob('users[*].name');
 * // => [{ kind: 'literal', key: 'users' }, { kind: 'keyAnyIndex', key: 'name' }]
 * ```
 *
 * @see https://neotraverse.puruvj.dev/guide/api/paths#t-select
 */
export function parseGlob(glob: string): GlobSeg[] {
	return glob
		.split('.')
		.filter((s) => s.length > 0)
		.map((part) => {
			if (part === '*') return { kind: 'any' as const };
			const m = part.match(GLOB_INDEX_RE);
			if (m) return { kind: 'keyAnyIndex' as const, key: m[1] };
			return { kind: 'literal' as const, key: part };
		});
}

function pathMatches(path: PropertyKey[], segs: GlobSeg[]): boolean {
	let i = 0;
	for (let s = 0; s < segs.length; s++) {
		const seg = segs[s];
		if (seg.kind === 'any') {
			if (i >= path.length) return false;
			i++;
			continue;
		}
		if (seg.kind === 'literal') {
			if (i >= path.length || String(path[i]) !== seg.key) return false;
			i++;
			continue;
		}
		if (i >= path.length || String(path[i]) !== seg.key) return false;
		i++;
		if (i >= path.length) return false;
		i++;
	}
	return i === path.length;
}

/**
 * Glob path query (`*`, `key[*]`, dot segments). Predicate search → `filterPaths`.
 *
 * @example
 * ```js
 * import { select } from 'neotraverse/modern';
 * select({ users: [{ name: 'Ada' }, { name: 'Bob' }] }, 'users[*].name');
 * // => [{ path: ['users', 0, 'name'], node: 'Ada' }, { path: ['users', 1, 'name'], node: 'Bob' }]
 * ```
 *
 * @see https://neotraverse.puruvj.dev/guide/api/paths#t-select
 */
export function select(obj: any, glob: string, options?: TraverseOptions): PathNode[] {
	const segs = parseGlob(glob);
	const acc: PathNode[] = [];
	forEach(
		obj,
		(ctx) => {
			if (pathMatches(ctx.path, segs)) acc.push({ path: ctx.path, node: ctx.node });
		},
		options,
	);
	return acc;
}

export { Traverse } from './deprecated.js';

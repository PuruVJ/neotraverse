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

export interface TraverseOptions {
	/**
	 * If true, does not alter the original object
	 */
	immutable?: boolean;

	/**
	 * If false, removes all symbols from traversed objects
	 *
	 * @default false
	 */
	includeSymbols?: boolean;

	/**
	 * Maximum traversal/clone depth. When set, traversing or cloning an object
	 * nested deeper than this throws a `RangeError` instead of overflowing the
	 * call stack — useful for bounding untrusted input. Unlimited when omitted.
	 */
	maxDepth?: number;

	/**
	 * Cancel an in-flight async walk ({@link forEachAsync} /
	 * {@link mapAsync}). When the signal aborts, the walk rejects with
	 * the signal's reason on the next visited node. Ignored by the synchronous
	 * methods.
	 */
	signal?: AbortSignal;
}

export interface TraverseContext {
	/**
	 * The present node on the recursive walk
	 */
	node: any;

	/**
	 * An array of string keys from the root to the present node
	 */
	path: PropertyKey[];

	/**
	 * The context of the node's parent.
	 * This is `undefined` for the root node.
	 */
	parent: TraverseContext | undefined;

	/**
	 * The contexts of the node's parents.
	 */
	parents: TraverseContext[];

	/**
	 * The name of the key of the present node in its parent.
	 * This is `undefined` for the root node.
	 */
	key: PropertyKey | undefined;

	/**
	 * Whether the present node is the root node
	 */
	isRoot: boolean;
	/**
	 * Whether the present node is not the root node
	 */
	notRoot: boolean;

	/**
	 * Whether the present node is the last node
	 */
	isLast: boolean;

	/**
	 * Whether the present node is the first node
	 */
	isFirst: boolean;

	/**
	 * Whether or not the present node is a leaf node (has no children)
	 */
	isLeaf: boolean;
	/**
	 * Whether or not the present node is not a leaf node (has children)
	 */
	notLeaf: boolean;

	/**
	 * Depth of the node within the traversal
	 */
	level: number;

	/**
	 * If the node equals one of its parents, the `circular` attribute is set to the context of that parent and the traversal progresses no deeper.
	 */
	circular: TraverseContext | undefined;

	/**
	 * Set a new value for the present node.
	 *
	 * All the elements in `value` will be recursively traversed unless `stopHere` is true (false by default).
	 */
	update(value: any, stopHere?: boolean): void;

	/**
	 * Remove the current element from the output. If the node is in an Array it will be spliced off. Otherwise it will be deleted from its parent.
	 */
	remove(stopHere?: boolean): void;

	/**
	 * Delete the current element from its parent in the output. Calls `delete` even on Arrays.
	 */
	delete(stopHere?: boolean): void;

	/**
	 * Object keys of the node.
	 */
	keys: PropertyKey[] | null;

	/**
	 * Call this function before all of the children are traversed.
	 * You can assign into `ctx.keys` here to traverse in a custom order.
	 */
	before(callback: (ctx: TraverseContext, value: any) => void): void;

	/**
	 * Call this function after all of the children are traversed.
	 */
	after(callback: (ctx: TraverseContext, value: any) => void): void;

	/**
	 * Call this function before each of the children are traversed.
	 */
	pre(callback: (ctx: TraverseContext, child: any, key: any) => void): void;

	/**
	 * Call this function after each of the children are traversed.
	 */
	post(callback: (ctx: TraverseContext, child: any) => void): void;

	/**
	 * Stops traversal entirely.
	 */
	stop(): void;

	/**
	 * Prevents traversing descendents of the current node.
	 */
	block(): void;
}

const to_string = (obj: unknown) => Object.prototype.toString.call(obj);

const is_typed_array = (value: unknown): value is TypedArray =>
	ArrayBuffer.isView(value) && !(value instanceof DataView);
const is_array = Array.isArray;

// Boxed primitives (`new String()` / `new Number()` / `new Boolean()`), detected
// by tag so they're still recognized when they originate from another realm.
const is_boxed_primitive = (obj: unknown): boolean => {
	const tag = to_string(obj);
	return tag === '[object Boolean]' || tag === '[object Number]' || tag === '[object String]';
};

const gopd = Object.getOwnPropertyDescriptor;
const is_property_enumerable = Object.prototype.propertyIsEnumerable;
const get_own_property_symbols = Object.getOwnPropertySymbols;
const has_own_property = Object.prototype.hasOwnProperty;
const object_keys = Object.keys;
const object_proto = Object.prototype;
const get_proto = Object.getPrototypeOf;

// Keys that can mutate an object's prototype chain. They must never be used as
// navigation/write targets when handling untrusted input (prototype pollution).
const is_unsafe_key = (key: PropertyKey): boolean =>
	key === '__proto__' || key === 'constructor' || key === 'prototype';

// Assign `value` onto `dst` without ever triggering the `__proto__` setter or
// otherwise mutating `dst`'s [[Prototype]]. The value is preserved as an
// ordinary own enumerable data property, so injected data is neutralized — not
// silently dropped — and the clone keeps its real prototype.
function safe_set(dst: any, key: PropertyKey, value: any): void {
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

	const dst = copy(src, options);
	// typed arrays / boxed primitives are fully materialized by copy()
	if (is_typed_array(src) || is_boxed_primitive(src)) return dst;

	seen.set(src, dst);
	const keys = options.includeSymbols ? own_enumerable_keys(src) : object_keys(src);
	for (let i = 0; i < keys.length; i++) {
		const key = keys[i];
		safe_set(dst, key, clone_node(src[key], seen, options, depth + 1));
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
	const keys = iter(node);
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

function copy(src: any, options: TraverseOptions) {
	if (typeof src === 'object' && src !== null) {
		let dst: any;

		if (is_array(src)) {
			dst = [];
		} else if (is_typed_array(src)) {
			return src.slice();
		} else if (is_boxed_primitive(src)) {
			// Boxed primitives have read-only index slots; copying onto them throws
			// in strict mode. The wrapper already carries the primitive value.
			return Object(src);
		} else if (src instanceof Map) {
			// Shallow entry copy (used by map()/immutable). clone_node() deep-clones.
			return new Map(src);
		} else if (src instanceof Set) {
			return new Set(src);
		} else {
			// One `toString` tag instead of a separate call per predicate.
			const tag = to_string(src);
			if (tag === '[object Date]' && typeof src.getTime === 'function') {
				// Guard on `getTime` so a `Symbol.toStringTag`-spoofed object falls
				// through to the generic copy instead of becoming `Invalid Date`.
				dst = new Date(src.getTime());
			} else if (tag === '[object RegExp]' && typeof src.source === 'string') {
				dst = new RegExp(src);
			} else if (tag === '[object Error]') {
				dst = { message: src.message };
			} else {
				// `{}` is faster than `Object.create(Object.prototype)` for the
				// overwhelmingly common plain-object case.
				const proto = get_proto(src);
				dst = proto === object_proto ? {} : Object.create(proto);
			}
		}

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
	mods: Modifiers | null = null;

	constructor(w: WalkState, node_: any, node: any) {
		const { path, parents } = w;
		const level = path.length;
		this.w = w;
		this.node = node;
		this.node_ = node_;
		this.parent = parents[level - 1];
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
		if (stopHere) this.keep_going = false;
	}

	remove(stopHere?: boolean): void {
		const parent = (this.parent as WalkContext).node;
		if (is_array(parent)) {
			parent.splice(this.key as number, 1);
		} else {
			delete parent[this.key as PropertyKey];
		}
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
}

// Recompute keys/isLeaf after the cb replaced the node (the uncommon path).
function update_state(ctx: WalkContext): void {
	const node = ctx.node;
	if (typeof node === 'object' && node !== null) {
		if (!ctx.keys || ctx.node_ !== node) {
			ctx.keys = ctx.w.iter(node);
		}
		ctx.isLeaf = ctx.keys.length === 0;
	} else {
		ctx.isLeaf = true;
		ctx.keys = null;
	}
}

function walk(
	root: any,
	cb: (ctx: TraverseContext, v: any) => void,
	options: TraverseOptions = empty_null,
) {
	const w: WalkState = {
		alive: true,
		immutable: !!options.immutable,
		iter: options.includeSymbols ? own_enumerable_keys : object_keys,
		max_depth: options.maxDepth,
		path: [],
		parents: [],
	};

	const { immutable, max_depth, path, parents, iter } = w;

	const walker = (node_: any): WalkContext => {
		assert_within_depth(path.length, max_depth);

		const node0 = immutable ? copy(node_, options) : node_;
		const ctx = new WalkContext(w, node_, node0);

		if (!w.alive) return ctx;

		// --- inlined initial update_state (keys are null on a fresh ctx) ---
		const node0_is_obj = typeof node0 === 'object' && node0 !== null;
		if (node0_is_obj) {
			const keys0 = iter(node0);
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
		// -------------------------------------------------------------------

		const ret = cb(ctx, node0);
		if (ret !== undefined) ctx.update(ret);

		const mods = ctx.mods;
		if (mods !== null && mods.before !== undefined) mods.before(ctx, ctx.node);

		if (!ctx.keep_going) return ctx;

		const node = ctx.node;
		// reuse the object-ness check when the node wasn't replaced by the cb
		const descend = node === node0 ? node0_is_obj : typeof node === 'object' && node !== null;
		if (descend && ctx.circular === undefined) {
			parents.push(ctx);

			// recompute keys only if the cb/before replaced the node
			if (node !== node0) update_state(ctx);

			const keys = ctx.keys as PropertyKey[];
			const last = keys.length - 1;
			const pre = mods !== null ? mods.pre : undefined;
			const post = mods !== null ? mods.post : undefined;

			for (let index = 0; index <= last; index++) {
				const key = keys[index];
				path.push(key);

				if (pre !== undefined) pre(ctx, node[key], key);

				const child = walker(node[key]);
				if (immutable && has_own_property.call(node, key) && !is_non_writable(node, key)) {
					safe_set(node, key, child.node);
				}

				child.isLast = index === last;
				child.isFirst = index === 0;

				if (post !== undefined) post(ctx, child);

				path.pop();
			}
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
	const w: WalkState = {
		alive: true,
		immutable: !!options.immutable,
		iter: options.includeSymbols ? own_enumerable_keys : object_keys,
		max_depth: options.maxDepth,
		path: [],
		parents: [],
	};

	const { immutable, max_depth, path, parents, iter } = w;
	const signal = options.signal;

	const walker = async (node_: any): Promise<WalkContext> => {
		signal?.throwIfAborted();
		assert_within_depth(path.length, max_depth);

		const node0 = immutable ? copy(node_, options) : node_;
		const ctx = new WalkContext(w, node_, node0);

		if (!w.alive) return ctx;

		// --- inlined initial update_state (keys are null on a fresh ctx) ---
		const node0_is_obj = typeof node0 === 'object' && node0 !== null;
		if (node0_is_obj) {
			const keys0 = iter(node0);
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
		// -------------------------------------------------------------------

		const ret = await cb(ctx, node0);
		if (ret !== undefined) ctx.update(ret);

		const mods = ctx.mods;
		if (mods !== null && mods.before !== undefined) mods.before(ctx, ctx.node);

		if (!ctx.keep_going) return ctx;

		const node = ctx.node;
		const descend = node === node0 ? node0_is_obj : typeof node === 'object' && node !== null;
		if (descend && ctx.circular === undefined) {
			parents.push(ctx);

			if (node !== node0) update_state(ctx);

			const keys = ctx.keys as PropertyKey[];
			const last = keys.length - 1;
			const pre = mods !== null ? mods.pre : undefined;
			const post = mods !== null ? mods.post : undefined;

			for (let index = 0; index <= last; index++) {
				const key = keys[index];
				path.push(key);

				if (pre !== undefined) pre(ctx, node[key], key);

				const child = await walker(node[key]);
				if (immutable && has_own_property.call(node, key) && !is_non_writable(node, key)) {
					safe_set(node, key, child.node);
				}

				child.isLast = index === last;
				child.isFirst = index === 0;

				if (post !== undefined) post(ctx, child);

				path.pop();
			}
			parents.pop();
		}

		if (mods !== null && mods.after !== undefined) mods.after(ctx, ctx.node);

		return ctx;
	};

	return (await walker(root)).node;
}

// Tree-shakeable functional API. Terminal ops take options as the last argument.
// No pipe() helper: ops are heterogeneous; map/clone nest as plain calls.

export function get(obj: any, paths: PropertyKey[], options?: TraverseOptions): any {
	let node = obj;
	const symbols = options?.includeSymbols;

	for (let i = 0; node && i < paths.length; i++) {
		const key = paths[i];

		if (!has_own_property.call(node, key) || (!symbols && typeof key === 'symbol')) {
			return void undefined;
		}

		node = node[key];
	}

	return node;
}

export function has(obj: any, paths: PropertyKey[], options?: TraverseOptions): boolean {
	let node = obj;
	const symbols = options?.includeSymbols;

	for (let i = 0; node && i < paths.length; i++) {
		const key = paths[i];

		if (!has_own_property.call(node, key) || (!symbols && typeof key === 'symbol')) {
			return false;
		}

		node = node[key];
	}

	return true;
}

export function set(obj: any, path: PropertyKey[], value: any, _options?: TraverseOptions): any {
	let node = obj;

	let i = 0;
	for (i = 0; i < path.length - 1; i++) {
		const key = path[i];

		if (is_unsafe_key(key)) return value;

		if (!has_own_property.call(node, key)) {
			node[key] = {};
		}

		node = node[key];
	}

	if (is_unsafe_key(path[i])) return value;

	node[path[i]] = value;

	return value;
}

export function map(
	obj: any,
	cb: (ctx: TraverseContext, v: any) => void,
	options?: TraverseOptions,
): any {
	return walk(obj, cb, {
		immutable: true,
		includeSymbols: !!options?.includeSymbols,
		maxDepth: options?.maxDepth,
	});
}

export function forEach(
	obj: any,
	cb: (ctx: TraverseContext, v: any) => void,
	options?: TraverseOptions,
): any {
	return walk(obj, cb, options);
}

export function reduce(
	obj: any,
	cb: (ctx: TraverseContext, acc: any, v: any) => any,
	init?: any,
	options?: TraverseOptions,
): any {
	const skip = arguments.length === 2;
	let acc = skip ? obj : init;

	forEach(obj, (ctx, x) => {
		if (!ctx.isRoot || !skip) {
			acc = cb(ctx, acc, x);
		}
	}, options);

	return acc;
}

export function find(
	obj: any,
	fn: (ctx: TraverseContext, v: any) => unknown,
	options?: TraverseOptions,
): any {
	let result: any;
	forEach(obj, (ctx, x) => {
		if (fn(ctx, x)) {
			result = x;
			ctx.stop();
		}
	}, options);
	return result;
}

export function filter(
	obj: any,
	fn: (ctx: TraverseContext, v: any) => unknown,
	options?: TraverseOptions,
): any[] {
	const acc: any[] = [];
	forEach(obj, (ctx, x) => {
		if (fn(ctx, x)) acc.push(x);
	}, options);
	return acc;
}

export function some(
	obj: any,
	fn: (ctx: TraverseContext, v: any) => unknown,
	options?: TraverseOptions,
): boolean {
	let result = false;
	forEach(obj, (ctx, x) => {
		if (fn(ctx, x)) {
			result = true;
			ctx.stop();
		}
	}, options);
	return result;
}

export function every(
	obj: any,
	fn: (ctx: TraverseContext, v: any) => unknown,
	options?: TraverseOptions,
): boolean {
	let result = true;
	forEach(obj, (ctx, x) => {
		if (!fn(ctx, x)) {
			result = false;
			ctx.stop();
		}
	}, options);
	return result;
}

export function paths(obj: any, options?: TraverseOptions): PropertyKey[][] {
	const acc: PropertyKey[][] = [];

	forEach(obj, (ctx) => {
		acc.push(ctx.path);
	}, options);

	return acc;
}

export function nodes(obj: any, options?: TraverseOptions): any[] {
	const acc: any[] = [];

	forEach(obj, (ctx) => {
		acc.push(ctx.node);
	}, options);

	return acc;
}

export function clone(obj: any, options?: TraverseOptions): any {
	return clone_node(obj, new Map(), options ?? empty_null, 0);
}

export function* entries(
	obj: any,
	options?: TraverseOptions,
): Generator<[PropertyKey[], any]> {
	yield* iterate(
		obj,
		[],
		options?.includeSymbols ? own_enumerable_keys : object_keys,
		new Set(),
		options?.maxDepth,
		0,
	);
}

export function* values(obj: any, options?: TraverseOptions): Generator<any> {
	for (const [, node] of entries(obj, options)) yield node;
}

export async function forEachAsync(
	obj: any,
	cb: (ctx: TraverseContext, v: any) => void | Promise<void>,
	options?: TraverseOptions,
): Promise<any> {
	return walk_async(obj, cb, options);
}

export async function mapAsync(
	obj: any,
	cb: (ctx: TraverseContext, v: any) => void | Promise<void>,
	options?: TraverseOptions,
): Promise<any> {
	return walk_async(obj, cb, {
		immutable: true,
		includeSymbols: !!options?.includeSymbols,
		maxDepth: options?.maxDepth,
		signal: options?.signal,
	});
}

/**
 * @deprecated The `Traverse` class is deprecated and will be removed in a future release.
 * Import standalone functions from `neotraverse/modern` instead. See the migration guide.
 */
export class Traverse {
	#value: any;
	#options: TraverseOptions;

	/** @deprecated Use standalone functions from `neotraverse/modern` instead. */
	constructor(obj: any, options: TraverseOptions = empty_null) {
		this.#value = obj;
		this.#options = options;
	}

	/** @deprecated Use `get(obj, path, options)` instead. */
	get(paths: PropertyKey[]): any {
		let node = this.#value;
		const symbols = this.#options.includeSymbols;

		for (let i = 0; node && i < paths.length; i++) {
			const key = paths[i];

			if (!has_own_property.call(node, key) || (!symbols && typeof key === 'symbol')) {
				return void undefined;
			}

			node = node[key];
		}

		return node;
	}

	/** @deprecated Use `has(obj, path, options)` instead. */
	has(paths: PropertyKey[]): boolean {
		let node = this.#value;
		const symbols = this.#options.includeSymbols;

		for (let i = 0; node && i < paths.length; i++) {
			const key = paths[i];

			if (!has_own_property.call(node, key) || (!symbols && typeof key === 'symbol')) {
				return false;
			}

			node = node[key];
		}

		return true;
	}

	/** @deprecated Use `set(obj, path, value, options)` instead. */
	set(path: PropertyKey[], value: any): any {
		let node = this.#value;

		let i = 0;
		for (i = 0; i < path.length - 1; i++) {
			const key = path[i];

			// Prevent prototype pollution: never navigate through these keys.
			if (is_unsafe_key(key)) return value;

			if (!has_own_property.call(node, key)) {
				node[key] = {};
			}

			node = node[key];
		}

		// …and never write to them either.
		if (is_unsafe_key(path[i])) return value;

		node[path[i]] = value;

		return value;
	}

	/** @deprecated Use `map(obj, cb, options)` instead. */
	map(cb: (ctx: TraverseContext, v: any) => void): any {
		return walk(this.#value, cb, {
			immutable: true,
			includeSymbols: !!this.#options.includeSymbols,
			maxDepth: this.#options.maxDepth,
		});
	}

	/** @deprecated Use `forEach(obj, cb, options)` instead. */
	forEach(cb: (ctx: TraverseContext, v: any) => void): any {
		this.#value = walk(this.#value, cb, this.#options);
		return this.#value;
	}

	/** @deprecated Use `reduce(obj, cb, init?, options?)` instead. */
	reduce(cb: (ctx: TraverseContext, acc: any, v: any) => void, init?: any): any {
		const skip = arguments.length === 1;
		let acc = skip ? this.#value : init;

		this.forEach((ctx, x) => {
			if (!ctx.isRoot || !skip) {
				acc = cb(ctx, acc, x);
			}
		});

		return acc;
	}

	/** @deprecated Use `find(obj, fn, options)` instead. */
	find(fn: (ctx: TraverseContext, v: any) => unknown): any {
		let result: any;
		this.forEach((ctx, x) => {
			if (fn(ctx, x)) {
				result = x;
				ctx.stop();
			}
		});
		return result;
	}

	/** @deprecated Use `filter(obj, fn, options)` instead. */
	filter(fn: (ctx: TraverseContext, v: any) => unknown): any[] {
		const acc: any[] = [];
		this.forEach((ctx, x) => {
			if (fn(ctx, x)) acc.push(x);
		});
		return acc;
	}

	/** @deprecated Use `some(obj, fn, options)` instead. */
	some(fn: (ctx: TraverseContext, v: any) => unknown): boolean {
		let result = false;
		this.forEach((ctx, x) => {
			if (fn(ctx, x)) {
				result = true;
				ctx.stop();
			}
		});
		return result;
	}

	/** @deprecated Use `every(obj, fn, options)` instead. */
	every(fn: (ctx: TraverseContext, v: any) => unknown): boolean {
		let result = true;
		this.forEach((ctx, x) => {
			if (!fn(ctx, x)) {
				result = false;
				ctx.stop();
			}
		});
		return result;
	}

	/** @deprecated Use `paths(obj, options)` instead. */
	paths(): PropertyKey[][] {
		const acc: PropertyKey[][] = [];

		this.forEach((ctx) => {
			acc.push(ctx.path);
		});

		return acc;
	}

	/** @deprecated Use `nodes(obj, options)` instead. */
	nodes(): any[] {
		const acc: any[] = [];

		this.forEach((ctx) => {
			acc.push(ctx.node);
		});

		return acc;
	}

	/** @deprecated Use `clone(obj, options)` instead. */
	clone(): any {
		return clone_node(this.#value, new Map(), this.#options, 0);
	}

	/** @deprecated Use `entries(obj, options)` instead. */
	*entries(): Generator<[PropertyKey[], any]> {
		const o = this.#options;
		yield* iterate(
			this.#value,
			[],
			o.includeSymbols ? own_enumerable_keys : object_keys,
			new Set(),
			o.maxDepth,
			0,
		);
	}

	/** @deprecated Use `values(obj, options)` or `entries(obj, options)` instead. */
	*[Symbol.iterator](): Generator<any> {
		for (const [, node] of this.entries()) yield node;
	}

	/** @deprecated Use `forEachAsync(obj, cb, options)` instead. */
	async forEachAsync(cb: (ctx: TraverseContext, v: any) => void | Promise<void>): Promise<any> {
		this.#value = await walk_async(this.#value, cb, this.#options);
		return this.#value;
	}

	/** @deprecated Use `mapAsync(obj, cb, options)` instead. */
	async mapAsync(cb: (ctx: TraverseContext, v: any) => void | Promise<void>): Promise<any> {
		return walk_async(this.#value, cb, {
			immutable: true,
			includeSymbols: !!this.#options.includeSymbols,
			maxDepth: this.#options.maxDepth,
			signal: this.#options.signal,
		});
	}
}

export {
	count,
	deepEqual,
	deleteWhere,
	diff,
	filterPaths,
	findPaths,
	freeze,
	getPath,
	getType,
	hasPath,
	parseDotPath,
	parseGlob,
	parseJsonPointer,
	parsePath,
	patch,
	pointerPath,
	prune,
	pruneDeep,
	select,
	setPath,
	size,
	toJSON,
	type DeepEqualOptions,
	type PatchOp,
	type PathNode,
	type ToJSONOptions,
	type TraverseNodeType,
} from './modern-backlog.ts';

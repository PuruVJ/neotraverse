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
	if (src instanceof WeakMap) {
		const dst = new WeakMap();
		seen.set(src, dst);
		for (const [k, v] of src) {
			dst.set(clone_node(k, seen, options, depth + 1), clone_node(v, seen, options, depth + 1));
		}
		return dst;
	}
	if (src instanceof WeakSet) {
		const dst = new WeakSet();
		seen.set(src, dst);
		for (const v of src) dst.add(clone_node(v, seen, options, depth + 1));
		return dst;
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
		} else if (src instanceof ArrayBuffer) {
			return src.slice(0);
		} else if (src instanceof DataView) {
			return new DataView(
				src.buffer.slice(src.byteOffset, src.byteOffset + src.byteLength),
				0,
				src.byteLength,
			);
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
		} else if (src instanceof WeakMap) {
			return new WeakMap(src);
		} else if (src instanceof WeakSet) {
			return new WeakSet(src);
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

/** Locked union — do not rename tags after release. */
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
 * See the [types reference](/guide#types-and-traversal) for walk vs clone behaviour per tag.
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
	if (/^\d+$/.test(segment)) return Number(segment);
	return segment;
}

function assertSafePath(keys: PropertyKey[]): void {
	for (let i = 0; i < keys.length; i++) {
		if (typeof keys[i] === 'string' && is_unsafe_key(keys[i])) {
			throw new Error(`neotraverse: unsafe path segment "${String(keys[i])}"`);
		}
	}
}

/** Dot notation (`a.b.0`). Use a leading `/` for JSON Pointer (`/a/b/0`). */
export function parsePath(path: string): PropertyKey[] {
	if (path.startsWith('/')) return parseJsonPointer(path);
	return parseDotPath(path);
}

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

export function parseJsonPointer(pointer: string): PropertyKey[] {
	if (pointer === '') return [];
	if (!pointer.startsWith('/')) throw new Error('neotraverse: JSON Pointer must start with "/"');
	const raw = pointer.slice(1).split('/');
	const keys = raw.map((seg) => coerceKey(seg.replace(/~1/g, '/').replace(/~0/g, '~')));
	assertSafePath(keys);
	return keys;
}

export function pointerPath(path: PropertyKey[]): string {
	return (
		'/' +
		path
			.map((k) =>
				String(k)
					.replace(/~/g, '~0')
					.replace(/\//g, '~1'),
			)
			.join('/')
	);
}

export function getPath(obj: any, path: string, options?: TraverseOptions): any {
	return get(obj, parsePath(path), options);
}

export function hasPath(obj: any, path: string, options?: TraverseOptions): boolean {
	return has(obj, parsePath(path), options);
}

export function setPath(obj: any, path: string, value: any, options?: TraverseOptions): any {
	return set(obj, parsePath(path), value, options);
}

export function findPaths(
	obj: any,
	fn: (ctx: TraverseContext, v: any) => unknown,
	options?: TraverseOptions,
): PropertyKey[] | undefined {
	let found: PropertyKey[] | undefined;
	forEach(obj, (ctx, x) => {
		if (fn(ctx, x)) {
			found = ctx.path;
			ctx.stop();
		}
	}, options);
	return found;
}

export interface PathNode {
	path: PropertyKey[];
	node: any;
}

export function filterPaths(
	obj: any,
	fn: (ctx: TraverseContext, v: any) => unknown,
	options?: TraverseOptions,
): PathNode[] {
	const acc: PathNode[] = [];
	forEach(obj, (ctx, x) => {
		if (fn(ctx, x)) acc.push({ path: ctx.path, node: ctx.node });
	}, options);
	return acc;
}

export function count(
	obj: any,
	fn?: (ctx: TraverseContext, v: any) => unknown,
	options?: TraverseOptions,
): number {
	let n = 0;
	forEach(obj, (ctx, x) => {
		if (!fn || fn(ctx, x)) n++;
	}, options);
	return n;
}

export function size(obj: any, options?: TraverseOptions): number {
	return count(obj, undefined, options);
}

export function deleteWhere(
	obj: any,
	fn: (ctx: TraverseContext, v: any) => unknown,
	options?: TraverseOptions,
): any {
	return map(obj, (ctx, x) => {
		if (fn(ctx, x)) ctx.remove();
	}, options);
}

export function prune(
	obj: any,
	fn: (ctx: TraverseContext, v: any) => unknown,
	options?: TraverseOptions,
): any {
	return deleteWhere(obj, (ctx, x) => !fn(ctx, x), options);
}

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

export function freeze(obj: any, options?: TraverseOptions): any {
	forEach(obj, (ctx) => {
		ctx.after(() => {
			const n = ctx.node;
			if (typeof n === 'object' && n !== null) Object.freeze(n);
		});
	}, options);
	return obj;
}

export interface DeepEqualOptions {
	compareFn?: (a: any, b: any) => boolean | undefined;
}

/** Structural equality with an explicit per-type contract (not identical to `clone()`). */
export function deepEqual(a: any, b: any, options?: DeepEqualOptions): boolean {
	const seen = new Map<any, Map<any, boolean>>();
	return deepEqualPair(a, b, options?.compareFn, seen);
}

function deepEqualPair(
	a: any,
	b: any,
	compareFn: ((a: any, b: any) => boolean | undefined) | undefined,
	seen: Map<any, Map<any, boolean>>,
): boolean {
	if (a === b) return true;
	if (compareFn) {
		const custom = compareFn(a, b);
		if (custom !== undefined) return custom;
	}
	if (typeof a !== typeof b) return false;
	if (a === null || b === null) return a === b;

	if (is_boxed_primitive(a) || is_boxed_primitive(b)) {
		if (!is_boxed_primitive(a) || !is_boxed_primitive(b)) return false;
		return Object(a).valueOf() === Object(b).valueOf();
	}

	const ta = getType(a);
	const tb = getType(b);
	if (ta !== tb) return false;

	if (ta === 'primitive' || ta === 'null') return a === b;

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
				if (a[i] !== b[i]) return false;
			}
			return true;
		}
		case 'map': {
			if (a.size !== b.size) return false;
			for (const [k, v] of a) {
				if (!b.has(k) || !deepEqualPair(v, b.get(k), compareFn, seen)) return false;
			}
			return true;
		}
		case 'set': {
			if (a.size !== b.size) return false;
			const used = new Set<number>();
			for (const v of a) {
				let matched = false;
				let i = 0;
				for (const w of b) {
					if (used.has(i)) {
						i++;
						continue;
					}
					if (deepEqualPair(v, w, compareFn, seen)) {
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
				if (!deepEqualPair(a[i], b[i], compareFn, seen)) return false;
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
				if (!deepEqualPair(a[k], b[k], compareFn, seen)) return false;
			}
			return true;
		}
	}
}

export interface ToJSONOptions extends TraverseOptions {
	/** Value inserted where a circular reference is detected. @default null */
	cycle?: null | string;
}

/** JSON.stringify after a walk; does not throw on circular references. */
export function toJSON(obj: any, options?: ToJSONOptions): string {
	const cycle = options?.cycle ?? null;
	const prepared = map(obj, (ctx) => {
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
	}, options);
	return JSON.stringify(prepared);
}

export type PatchOp =
	| { op: 'add'; path: string; value: any }
	| { op: 'remove'; path: string }
	| { op: 'replace'; path: string; value: any };

/** RFC 6902 subset (`add` / `remove` / `replace`). Circular graphs are not supported. */
export function diff(a: any, b: any): PatchOp[] {
	const ops: PatchOp[] = [];
	diffPair(a, b, [], ops, new WeakSet());
	return ops;
}

function diffPair(a: any, b: any, path: PropertyKey[], ops: PatchOp[], stack: WeakSet<object>): void {
	if (a === b) return;

	const ta = getType(a);
	const tb = getType(b);

	if (ta !== tb || ta === 'primitive' || ta === 'null') {
		ops.push({ op: 'replace', path: pointerPath(path), value: clone(b) });
		return;
	}

	if (typeof a === 'object' && a !== null) {
		if (stack.has(a)) return;
		stack.add(a);
	}

	if (ta === 'array') {
		const max = Math.max(a.length, b.length);
		for (let i = 0; i < max; i++) {
			const p = path.concat(i);
			if (i >= a.length) {
				ops.push({ op: 'add', path: pointerPath(p), value: clone(b[i]) });
			} else if (i >= b.length) {
				ops.push({ op: 'remove', path: pointerPath(p) });
			} else {
				diffPair(a[i], b[i], p, ops, stack);
			}
		}
		return;
	}

	if (
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
		if (!deepEqual(a, b)) {
			ops.push({ op: 'replace', path: pointerPath(path), value: clone(b) });
		}
		return;
	}

	const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
	for (const k of keys) {
		const p = path.concat(k);
		const ha = has_own_property.call(a, k);
		const hb = has_own_property.call(b, k);
		if (ha && !hb) ops.push({ op: 'remove', path: pointerPath(p) });
		else if (!ha && hb) ops.push({ op: 'add', path: pointerPath(p), value: clone(b[k]) });
		else if (ha && hb) diffPair(a[k], b[k], p, ops, stack);
	}
}

export function patch(obj: any, ops: PatchOp[]): any {
	let root = clone(obj);
	for (let i = 0; i < ops.length; i++) {
		const op = ops[i];
		const keys = parsePath(op.path.startsWith('/') ? op.path : `/${op.path}`);
		if (op.op === 'remove') {
			root = removeAt(root, keys);
		} else if (op.op === 'add' || op.op === 'replace') {
			root = setAt(root, keys, op.value);
		}
	}
	return root;
}

function setAt(root: any, keys: PropertyKey[], value: any): any {
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
		if (last === parent.length) parent.push(value);
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

type GlobSeg = { kind: 'any' } | { kind: 'literal'; key: string } | { kind: 'keyAnyIndex'; key: string };

export function parseGlob(glob: string): GlobSeg[] {
	return glob
		.split('.')
		.filter((s) => s.length > 0)
		.map((part) => {
			if (part === '*') return { kind: 'any' as const };
			const m = part.match(/^(.+)\[\*\]$/);
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

/** Glob path query (`*`, `key[*]`, dot segments). Predicate search → `filterPaths`. */
export function select(obj: any, glob: string, options?: TraverseOptions): PathNode[] {
	const segs = parseGlob(glob);
	const acc: PathNode[] = [];
	forEach(obj, (ctx) => {
		if (pathMatches(ctx.path, segs)) acc.push({ path: ctx.path, node: ctx.node });
	}, options);
	return acc;
}

/**
 * @deprecated The `Traverse` class is deprecated and will be removed in a future release.
 * Import standalone functions from `neotraverse/modern` instead. See the migration guide.
 */
export class Traverse {
	/** @deprecated Use `getType(value)` instead. */
	static getType = getType;

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

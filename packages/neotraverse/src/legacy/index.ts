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
 * Walk and clone options (legacy `Traverse` constructor).
 *
 * @see https://neotraverse.puruvj.dev/guide/options.html
 */
export interface TraverseOptions {
	/**
	 * If true, does not alter the original object
	 *
	 * @see https://neotraverse.puruvj.dev/guide/options.html
	 */
	immutable?: boolean;

	/**
	 * If false, removes all symbols from traversed objects
	 *
	 * @default false
	 *
	 * @see https://neotraverse.puruvj.dev/guide/options.html
	 */
	includeSymbols?: boolean;

	/**
	 * Maximum traversal/clone depth. When set, traversing or cloning an object
	 * nested deeper than this throws a `RangeError` instead of overflowing the
	 * call stack — useful for bounding untrusted input. Unlimited when omitted.
	 *
	 * @see https://neotraverse.puruvj.dev/guide/security.html
	 */
	maxDepth?: number;
}

/**
 * Callback context (`this` / `ctx`) in legacy `Traverse` callbacks.
 *
 * @see https://neotraverse.puruvj.dev/guide/context.html
 */
export interface TraverseContext {
	/**
	 * The present node on the recursive walk
	 *
	 * @see https://neotraverse.puruvj.dev/guide/context.html
	 */
	node: any;

	/**
	 * An array of string keys from the root to the present node
	 *
	 * @see https://neotraverse.puruvj.dev/guide/context.html
	 */
	path: PropertyKey[];

	/**
	 * The context of the node's parent.
	 * This is `undefined` for the root node.
	 *
	 * @see https://neotraverse.puruvj.dev/guide/context.html
	 */
	parent: TraverseContext | undefined;

	/**
	 * The contexts of the node's parents.
	 *
	 * @see https://neotraverse.puruvj.dev/guide/context.html
	 */
	parents: TraverseContext[];

	/**
	 * The name of the key of the present node in its parent.
	 * This is `undefined` for the root node.
	 *
	 * @see https://neotraverse.puruvj.dev/guide/context.html
	 */
	key: PropertyKey | undefined;

	/**
	 * Whether the present node is the root node
	 *
	 * @see https://neotraverse.puruvj.dev/guide/context.html
	 */
	isRoot: boolean;
	/**
	 * Whether the present node is not the root node
	 *
	 * @see https://neotraverse.puruvj.dev/guide/context.html
	 */
	notRoot: boolean;

	/**
	 * Whether the present node is the last node
	 *
	 * @see https://neotraverse.puruvj.dev/guide/context.html
	 */
	isLast: boolean;

	/**
	 * Whether the present node is the first node
	 *
	 * @see https://neotraverse.puruvj.dev/guide/context.html
	 */
	isFirst: boolean;

	/**
	 * Whether or not the present node is a leaf node (has no children)
	 *
	 * @see https://neotraverse.puruvj.dev/guide/context.html
	 */
	isLeaf: boolean;
	/**
	 * Whether or not the present node is not a leaf node (has children)
	 *
	 * @see https://neotraverse.puruvj.dev/guide/context.html
	 */
	notLeaf: boolean;

	/**
	 * Depth of the node within the traversal
	 *
	 * @see https://neotraverse.puruvj.dev/guide/context.html
	 */
	level: number;

	/**
	 * If the node equals one of its parents, the `circular` attribute is set to the context of that parent and the traversal progresses no deeper.
	 *
	 * @see https://neotraverse.puruvj.dev/guide/context.html#context-circular
	 */
	circular: TraverseContext | undefined;

	/**
	 * Set a new value for the present node.
	 *
	 * All the elements in `value` will be recursively traversed unless `stopHere` is true (false by default).
	 *
	 * @see https://neotraverse.puruvj.dev/guide/context.html
	 */
	update(value: any, stopHere?: boolean): void;

	/**
	 * Remove the current element from the output. If the node is in an Array it will be spliced off. Otherwise it will be deleted from its parent.
	 *
	 * @see https://neotraverse.puruvj.dev/guide/context.html
	 */
	remove(stopHere?: boolean): void;

	/**
	 * Delete the current element from its parent in the output. Calls `delete` even on Arrays.
	 *
	 * @see https://neotraverse.puruvj.dev/guide/context.html
	 */
	delete(stopHere?: boolean): void;

	/**
	 * Object keys of the node.
	 *
	 * @see https://neotraverse.puruvj.dev/guide/context.html
	 */
	keys: PropertyKey[] | null;

	/**
	 * Call this function before all of the children are traversed.
	 * You can assign into `this.keys` here to traverse in a custom order.
	 *
	 * @see https://neotraverse.puruvj.dev/guide/context.html
	 */
	before(callback: (this: TraverseContext, value: any) => void): void;

	/**
	 * Call this function after all of the children are traversed.
	 *
	 * @see https://neotraverse.puruvj.dev/guide/context.html
	 */
	after(callback: (this: TraverseContext, value: any) => void): void;

	/**
	 * Call this function before each of the children are traversed.
	 *
	 * @see https://neotraverse.puruvj.dev/guide/context.html
	 */
	pre(callback: (this: TraverseContext, child: any, key: any) => void): void;

	/**
	 * Call this function after each of the children are traversed.
	 *
	 * @see https://neotraverse.puruvj.dev/guide/context.html
	 */
	post(callback: (this: TraverseContext, child: any) => void): void;

	/**
	 * Stops traversal entirely.
	 *
	 * @see https://neotraverse.puruvj.dev/guide/context.html
	 */
	stop(): void;

	/**
	 * Prevents traversing descendents of the current node.
	 *
	 * @see https://neotraverse.puruvj.dev/guide/context.html
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
// before the native stack overflow. No-op when `max_depth` is undefined.
function assert_within_depth(depth: number, max_depth: number | undefined): void {
	if (max_depth !== undefined && depth > max_depth) {
		throw new RangeError(`neotraverse: maximum traversal depth (${max_depth}) exceeded`);
	}
}

function own_enumerable_keys(obj: object): PropertyKey[] {
	const res: PropertyKey[] = Object.keys(obj);
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
				dst = Object.create(Object.getPrototypeOf(src));
			}
		}

		const iterator_function = options.includeSymbols ? own_enumerable_keys : Object.keys;
		for (const key of iterator_function(src)) {
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

function walk(
	root: any,
	cb: (this: TraverseContext, v: any) => void,
	options: TraverseOptions = empty_null,
) {
	const path: PropertyKey[] = [];
	const parents: any[] = [];
	let alive = true;
	const iterator_function = options.includeSymbols ? own_enumerable_keys : Object.keys;
	const immutable = !!options.immutable;
	const max_depth = options.maxDepth;
	return (function walker(node_) {
		assert_within_depth(path.length, max_depth);

		const node = immutable ? copy(node_, options) : node_;
		const modifiers = {} as {
			before?: (this: TraverseContext, value: any) => void;
			after?: (this: TraverseContext, value: any) => void;
			pre?: (this: TraverseContext, child: any, key: any) => void;
			post?: (this: TraverseContext, child: any) => void;
			stop?: () => void;
		};

		let keep_going = true;

		const state = {
			node,
			node_,
			path: path.slice(),
			parent: parents[parents.length - 1],
			parents,
			key: path[path.length - 1],
			isRoot: path.length === 0,
			level: path.length,
			circular: undefined,
			isLeaf: false as boolean,
			notLeaf: true as boolean,
			notRoot: true as boolean,
			isFirst: false as boolean,
			isLast: false as boolean,
			update: function (x: any, stopHere: boolean = false) {
				if (!state.isRoot) {
					safe_set(state.parent.node, state.key, x);
				}
				state.node = x;
				if (stopHere) {
					keep_going = false;
				}
			},
			delete: function (stopHere: boolean) {
				delete state.parent.node[state.key];
				if (stopHere) {
					keep_going = false;
				}
			},
			remove: function (stopHere: boolean) {
				if (is_array(state.parent.node)) {
					state.parent.node.splice(state.key, 1);
				} else {
					delete state.parent.node[state.key];
				}
				if (stopHere) {
					keep_going = false;
				}
			},
			keys: null as PropertyKey[] | null,
			before: function (f: (this: TraverseContext, value: any) => void) {
				modifiers.before = f;
			},
			after: function (f: (this: TraverseContext, value: any) => void) {
				modifiers.after = f;
			},
			pre: function (f: (this: TraverseContext, child: any, key: any) => void) {
				modifiers.pre = f;
			},
			post: function (f: (this: TraverseContext, child: any) => void) {
				modifiers.post = f;
			},
			stop: function () {
				alive = false;
			},
			block: function () {
				keep_going = false;
			},
		} satisfies TraverseContext & { node_: any };

		if (!alive) {
			return state;
		}

		function update_state() {
			if (typeof state.node === 'object' && state.node !== null) {
				if (!state.keys || state.node_ !== state.node) {
					state.keys = iterator_function(state.node);
				}

				state.isLeaf = state.keys.length === 0;

				for (let i = 0; i < parents.length; i++) {
					if (parents[i].node_ === node_) {
						state.circular = parents[i];
						break;
					}
				}
			} else {
				state.isLeaf = true;
				state.keys = null;
			}

			state.notLeaf = !state.isLeaf;
			state.notRoot = !state.isRoot;
		}

		update_state();

		// use return values to update if defined
		const ret = cb.call(state, state.node);
		if (ret !== undefined && state.update) {
			state.update(ret);
		}

		if (modifiers.before) {
			modifiers.before.call(state, state.node);
		}

		if (!keep_going) {
			return state;
		}

		if (typeof state.node === 'object' && state.node !== null && !state.circular) {
			parents.push(state);

			update_state();

			const keys = state.keys ?? [];
			for (let index = 0; index < keys.length; index++) {
				const key = keys[index];
				path.push(key);

				if (modifiers.pre) {
					modifiers.pre.call(state, state.node[key], key);
				}

				const child = walker(state.node[key]);
				if (
					immutable &&
					has_own_property.call(state.node, key) &&
					!is_non_writable(state.node, key)
				) {
					safe_set(state.node, key, child.node);
				}

				child.isLast = index === keys.length - 1;
				child.isFirst = index === 0;

				if (modifiers.post) {
					modifiers.post.call(state, child);
				}

				path.pop();
			}
			parents.pop();
		}

		if (modifiers.after) {
			modifiers.after.call(state, state.node);
		}

		return state;
	})(root).node;
}

/**
 * @deprecated Import `Traverse` from `neotraverse/modern` instead
 *
 * @see https://neotraverse.puruvj.dev/legacy.html#methods
 */
export class Traverse {
	// ! Have to keep these public as legacy mode requires them
	declare _value: any;
	declare _options: TraverseOptions;
	constructor(obj: any, options: TraverseOptions = empty_null) {
		this._value = obj;
		this._options = options;
	}
	/**
	 * Get the element at the array `path`.
	 *
	 * @see https://neotraverse.puruvj.dev/legacy.html#methods
	 */
	get(paths: PropertyKey[]): any {
		let node = this._value;

		for (let i = 0; node && i < paths.length; i++) {
			const key = paths[i];

			if (
				!has_own_property.call(node, key) ||
				(!this._options.includeSymbols && typeof key === 'symbol')
			) {
				return void undefined;
			}

			node = node[key];
		}

		return node;
	}
	/**
	 * Return whether the element at the array `path` exists.
	 *
	 * @see https://neotraverse.puruvj.dev/legacy.html#methods
	 */
	has(paths: PropertyKey[]): boolean {
		let node = this._value;

		for (let i = 0; node && i < paths.length; i++) {
			const key = paths[i];

			if (
				!has_own_property.call(node, key) ||
				(!this._options.includeSymbols && typeof key === 'symbol')
			) {
				return false;
			}

			node = node[key];
		}

		return true;
	}
	/**
	 * Set the element at the array `path` to `value`.
	 *
	 * @see https://neotraverse.puruvj.dev/legacy.html#methods
	 */
	set(path: PropertyKey[], value: any): any {
		let node = this._value;

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
	/**
	 * Execute `fn` for each node in the object and return a new object with the results of the walk. To update nodes in the result use `this.update(value)`.
	 *
	 * @see https://neotraverse.puruvj.dev/legacy.html#methods
	 */
	map(cb: (this: TraverseContext, v: any) => void): any {
		return walk(this._value, cb, {
			immutable: true,
			includeSymbols: !!this._options.includeSymbols,
			maxDepth: this._options.maxDepth,
		});
	}
	/**
	 * Execute `fn` for each node in the object but unlike `.map()`, when `this.update()` is called it updates the object in-place.
	 *
	 * @see https://neotraverse.puruvj.dev/legacy.html#methods
	 */
	forEach(cb: (this: TraverseContext, v: any) => void): any {
		this._value = walk(this._value, cb, this._options);
		return this._value;
	}
	/**
	 * For each node in the object, perform a [left-fold](http://en.wikipedia.org/wiki/Fold_(higher-order_function)) with the return value of `fn(acc, node)`.
	 *
	 * If `init` isn't specified, `init` is set to the root object for the first step and the root element is skipped.
	 *
	 * @see https://neotraverse.puruvj.dev/legacy.html#methods
	 */
	reduce(cb: (this: TraverseContext, acc: any, v: any) => void, init?: any): any {
		const skip = arguments.length === 1;
		let acc = skip ? this._value : init;

		this.forEach(function (x) {
			if (!this.isRoot || !skip) {
				acc = cb.call(this, acc, x);
			}
		});

		return acc;
	}
	/**
	 * Return an `Array` of every possible non-cyclic path in the object.
	 * Paths are `Array`s of string keys.
	 *
	 * @see https://neotraverse.puruvj.dev/legacy.html#methods
	 */
	paths(): PropertyKey[][] {
		const acc: PropertyKey[][] = [];

		this.forEach(function () {
			acc.push(this.path);
		});

		return acc;
	}
	/**
	 * Return an `Array` of every node in the object.
	 *
	 * @see https://neotraverse.puruvj.dev/legacy.html#methods
	 */
	nodes(): any[] {
		const acc: any[] = [];

		this.forEach(function () {
			acc.push(this.node);
		});

		return acc;
	}
	/**
	 * Create a deep clone of the object.
	 *
	 * @see https://neotraverse.puruvj.dev/legacy.html#methods
	 */
	clone(): any {
		const parents: any[] = [];
		const nodes: any[] = [];
		const options = this._options;
		const max_depth = options.maxDepth;

		if (is_typed_array(this._value)) {
			return this._value.slice();
		}

		return (function clone(src) {
			assert_within_depth(parents.length, max_depth);

			for (let i = 0; i < parents.length; i++) {
				if (parents[i] === src) {
					return nodes[i];
				}
			}

			if (typeof src === 'object' && src !== null) {
				const dst = copy(src, options);

				// Typed arrays and boxed primitives are fully materialized by copy()
				// and have no child references to recurse into (boxed-primitive index
				// slots are read-only — re-writing onto them would throw).
				if (is_typed_array(src) || is_boxed_primitive(src)) {
					return dst;
				}

				parents.push(src);
				nodes.push(dst);

				const iteratorFunction = options.includeSymbols ? own_enumerable_keys : Object.keys;
				for (const key of iteratorFunction(src)) {
					safe_set(dst, key, clone(src[key]));
				}

				parents.pop();
				nodes.pop();
				return dst;
			}

			return src;
		})(this._value);
	}
}

const traverse = (obj: any, options?: TraverseOptions): Traverse => {
	return new Traverse(obj, options);
};

/**
 * Get the element at the array `path`.
 *
 * @see https://neotraverse.puruvj.dev/guide/api/core.html#get
 */
traverse.get = (obj: any, paths: PropertyKey[], options?: TraverseOptions): any => {
	return new Traverse(obj, options).get(paths);
};

/**
 * Set the element at the array `path` to `value`.
 *
 * @see https://neotraverse.puruvj.dev/guide/api/core.html#get
 */
traverse.set = (obj: any, path: PropertyKey[], value: any, options?: TraverseOptions): any => {
	return new Traverse(obj, options).set(path, value);
};

/**
 * Return whether the element at the array `path` exists.
 *
 * @see https://neotraverse.puruvj.dev/guide/api/core.html#get
 */
traverse.has = (obj: any, paths: PropertyKey[], options?: TraverseOptions): boolean => {
	return new Traverse(obj, options).has(paths);
};

/**
 * Execute `fn` for each node in the object and return a new object with the results of the walk. To update nodes in the result use `this.update(value)`.
 *
 * @see https://neotraverse.puruvj.dev/guide/api/core.html#map
 */
traverse.map = (
	obj: any,
	cb: (this: TraverseContext, v: any) => void,
	options?: TraverseOptions,
): any => {
	return new Traverse(obj, options).map(cb);
};

/**
 * Execute `fn` for each node in the object but unlike `.map()`, when `this.update()` is called it updates the object in-place.
 *
 * @see https://neotraverse.puruvj.dev/guide/api/core.html#forEach
 */
traverse.forEach = (
	obj: any,
	cb: (this: TraverseContext, v: any) => void,
	options?: TraverseOptions,
): any => {
	return new Traverse(obj, options).forEach(cb);
};

/**
 * For each node in the object, perform a [left-fold](http://en.wikipedia.org/wiki/Fold_(higher-order_function)) with the return value of `fn(acc, node)`.
 *
 * If `init` isn't specified, `init` is set to the root object for the first step and the root element is skipped.
 *
 * @see https://neotraverse.puruvj.dev/guide/api/core.html#reduce
 */
traverse.reduce = (
	obj: any,
	cb: (this: TraverseContext, acc: any, v: any) => void,
	init?: any,
	options?: TraverseOptions,
): any => {
	return new Traverse(obj, options).reduce(cb, init);
};

/**
 * Return an `Array` of every possible non-cyclic path in the object.
 * Paths are `Array`s of string keys.
 *
 * @see https://neotraverse.puruvj.dev/guide/api/core.html#paths
 */
traverse.paths = (obj: any, options?: TraverseOptions): PropertyKey[][] => {
	return new Traverse(obj, options).paths();
};

/**
 * Return an `Array` of every node in the object.
 *
 * @see https://neotraverse.puruvj.dev/guide/api/core.html#paths
 */
traverse.nodes = (obj: any, options?: TraverseOptions): any[] => {
	return new Traverse(obj, options).nodes();
};

/**
 * Create a deep clone of the object.
 *
 * @see https://neotraverse.puruvj.dev/guide/api/core.html#clone
 */
traverse.clone = (obj: any, options?: TraverseOptions): any => {
	return new Traverse(obj, options).clone();
};

export default traverse;

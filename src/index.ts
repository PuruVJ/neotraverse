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
}

export interface TraverseContext {
	/**
	 * The present node on the recursive walk
	 */
	node: any;

	/**
	 * An array of string keys from the root to the present node
	 */
	path: string[];

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
	 * You can assign into `this.keys` here to traverse in a custom order.
	 */
	before(callback: (this: TraverseContext, value: any) => void): void;

	/**
	 * Call this function after all of the children are traversed.
	 */
	after(callback: (this: TraverseContext, value: any) => void): void;

	/**
	 * Call this function before each of the children are traversed.
	 */
	pre(callback: (this: TraverseContext, child: any, key: any) => void): void;

	/**
	 * Call this function after each of the children are traversed.
	 */
	post(callback: (this: TraverseContext, child: any) => void): void;

	/**
	 * Stops traversal entirely.
	 */
	stop(): void;

	/**
	 * Prevents traversing descendents of the current node.
	 */
	block(): void;
}

type InternalTraverseOptions = TraverseOptions & { __proto__: null };

const to_string = (obj: unknown) => Object.prototype.toString.call(obj);

const is_typed_array = (value: unknown): value is TypedArray =>
	ArrayBuffer.isView(value) && !(value instanceof DataView);
const is_date = (obj: unknown): obj is Date => to_string(obj) === '[object Date]';
const is_regexp = (obj: unknown): obj is RegExp => to_string(obj) === '[object RegExp]';
const is_error = (obj: unknown): obj is Error => to_string(obj) === '[object Error]';
const is_boolean = (obj: unknown): obj is boolean => to_string(obj) === '[object Boolean]';
const is_number = (obj: unknown): obj is number => to_string(obj) === '[object Number]';
const is_string = (obj: unknown): obj is string => to_string(obj) === '[object String]';
const is_array = Array.isArray;

const gopd = Object.getOwnPropertyDescriptor;
const is_property_enumerable = Object.prototype.propertyIsEnumerable;
const get_own_property_symbols = Object.getOwnPropertySymbols;
const has_own_property = Object.prototype.hasOwnProperty;

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

function is_writable(object, key) {
	return !gopd(object, key)?.writable;
}

function copy(src: any, options) {
	if (typeof src === 'object' && src !== null) {
		let dst: any;

		if (is_array(src)) {
			dst = [];
		} else if (is_date(src)) {
			dst = new Date(src.getTime ? src.getTime() : src);
			console.log({ src, dst });
		} else if (is_regexp(src)) {
			dst = new RegExp(src);
		} else if (is_error(src)) {
			dst = { message: src.message };
		} else if (is_boolean(src) || is_number(src) || is_string(src)) {
			dst = Object(src);
		} else {
			if (is_typed_array(src)) {
				return src.slice();
			} else if (Object.create && Object.getPrototypeOf) {
				dst = Object.create(Object.getPrototypeOf(src));
			} else if (src.constructor === Object) {
				dst = {};
			} else {
				const proto = (src.constructor && src.constructor.prototype) || src.__proto__ || {};
				const T = function T() {}; // eslint-disable-line func-style, func-name-matching
				T.prototype = proto;
				dst = new T();
			}
		}

		const iterator_function = options.includeSymbols ? own_enumerable_keys : Object.keys;
		for (const key of iterator_function(src)) {
			dst[key] = src[key];
		}

		return dst;
	}

	return src;
}

const empty_null: InternalTraverseOptions = {
	__proto__: null,
	includeSymbols: false,
	immutable: false,
};

function walk(
	root: any,
	cb: (this: TraverseContext, v: any) => void,
	options: InternalTraverseOptions = empty_null
) {
	const path: PropertyKey[] = [];
	const parents: any[] = [];
	let alive = true;

	const iterator_function = options.includeSymbols ? own_enumerable_keys : Object.keys;
	const immutable = !!options.immutable;

	return (function walker(node_) {
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
			path: ([] as any[]).concat(path) as string[],
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
					state.parent.node[state.key] = x;
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
						break; // eslint-disable-line no-restricted-syntax
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

			for (const [index, key] of Object.entries(state.keys ?? [])) {
				path.push(key);

				if (modifiers.pre) {
					modifiers.pre.call(state, state.node[key], key);
				}

				const child = walker(state.node[key]);
				if (immutable && has_own_property.call(state.node, key) && !is_writable(state.node, key)) {
					state.node[key] = child.node;
				}

				child.isLast = state.keys?.length ? +index === state.keys.length - 1 : false;
				child.isFirst = +index === 0;

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

export class Traverse {
	#value: any;
	#options: TraverseOptions;

	constructor(obj: any, options: TraverseOptions = empty_null) {
		this.#value = obj;
		this.#options = options;
	}

	/**
	 * Get the element at the array `path`.
	 */
	get(paths: PropertyKey[]): any {
		let node = this.#value;

		for (let i = 0; node && i < paths.length; i++) {
			const key = paths[i];

			if (
				!has_own_property.call(node, key) ||
				(!this.#options.includeSymbols && typeof key === 'symbol')
			) {
				return void undefined;
			}

			node = node[key];
		}

		return node;
	}

	/**
	 * Return whether the element at the array `path` exists.
	 */
	has(paths: string[]): boolean {
		let node = this.#value;

		for (let i = 0; node && i < paths.length; i++) {
			const key = paths[i];

			if (
				!has_own_property.call(node, key) ||
				(!this.#options.includeSymbols && typeof key === 'symbol')
			) {
				return false;
			}

			node = node[key];
		}

		return true;
	}

	/**
	 * Set the element at the array `path` to `value`.
	 */
	set(path: string[], value: any): any {
		let node = this.#value;

		let i = 0;
		for (i = 0; i < path.length - 1; i++) {
			const key = path[i];

			if (!has_own_property.call(node, key)) {
				node[key] = {};
			}

			node = node[key];
		}

		node[path[i]] = value;

		return value;
	}

	/**
	 * Execute `fn` for each node in the object and return a new object with the results of the walk. To update nodes in the result use `this.update(value)`.
	 */
	map(cb: (this: TraverseContext, v: any) => void): any {
		return walk(this.#value, cb, {
			__proto__: null,
			immutable: true,
			includeSymbols: !!this.#options.includeSymbols,
		});
	}

	/**
	 * Execute `fn` for each node in the object but unlike `.map()`, when `this.update()` is called it updates the object in-place.
	 */
	forEach(cb: (this: TraverseContext, v: any) => void): any {
		this.#value = walk(this.#value, cb, this.#options as InternalTraverseOptions);
		return this.#value;
	}

	/**
	 * For each node in the object, perform a [left-fold](http://en.wikipedia.org/wiki/Fold_(higher-order_function)) with the return value of `fn(acc, node)`.
	 *
	 * If `init` isn't specified, `init` is set to the root object for the first step and the root element is skipped.
	 */
	reduce(cb: (this: TraverseContext, acc: any, v: any) => void, init?: any): any {
		const skip = arguments.length === 1;
		let acc = skip ? this.#value : init;

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
	 */
	clone(): any {
		const parents: any[] = [];
		const nodes: any[] = [];
		const options = this.#options;

		if (is_typed_array(this.#value)) {
			return this.#value.slice();
		}

		return (function clone(src) {
			for (let i = 0; i < parents.length; i++) {
				if (parents[i] === src) {
					return nodes[i];
				}
			}

			if (typeof src === 'object' && src !== null) {
				const dst = copy(src, options);

				parents.push(src);
				nodes.push(dst);

				const iteratorFunction = options.includeSymbols ? own_enumerable_keys : Object.keys;
				for (const key of iteratorFunction(src)) {
					dst[key] = clone(src[key]);
				}

				parents.pop();
				nodes.pop();
				return dst;
			}

			return src;
		})(this.#value);
	}
}

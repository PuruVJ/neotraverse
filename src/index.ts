type TraverseOptions = {
	immutable?: boolean;
	includeSymbols?: boolean;
};

interface TraverseContext {
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
	key: string | undefined;

	/**
	 * Whether the present node is the root node
	 */
	isRoot: boolean;
	/**
	 * Whether the present node is not the root node
	 */
	notRoot: boolean;

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
	circular?: TraverseContext | null;

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
	keys: string[] | null;

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

// TODO: use call-bind, is-date, is-regex, is-string, is-boolean-object, is-number-object
const toS = (obj: unknown): string => Object.prototype.toString.call(obj);
const isDate = (obj: unknown): obj is Date => toS(obj) === '[object Date]';
const isRegExp = (obj: unknown): obj is RegExp => toS(obj) === '[object RegExp]';
const isError = (obj: unknown): obj is Error => toS(obj) === '[object Error]';
const isBoolean = (obj: unknown): obj is boolean => toS(obj) === '[object Boolean]';
const isNumber = (obj: unknown): obj is number => toS(obj) === '[object Number]';
const isString = (obj: unknown): obj is string => toS(obj) === '[object String]';
const isArray = Array.isArray;

const gopd = Object.getOwnPropertyDescriptor;
const propertyIsEnumerable = Object.prototype.propertyIsEnumerable;
const getOwnPropertySymbols = Object.getOwnPropertySymbols;
const hasOwnProperty = Object.prototype.hasOwnProperty;
const objectKeys = Object.keys;

function ownEnumerableKeys(obj) {
	const res = objectKeys(obj);

	const symbols = getOwnPropertySymbols(obj);
	for (let i = 0; i < symbols.length; i++) {
		if (propertyIsEnumerable.call(obj, symbols[i])) {
			res.push(symbols[i].toString());
		}
	}

	return res;
}

function isWritable(object: unknown, key: string) {
	if (typeof gopd !== 'function') {
		return true;
	}

	return !gopd(object, key)?.writable;
}

function isTypedArray(
	value: unknown
): value is
	| Uint8Array
	| Int8Array
	| Uint8ClampedArray
	| Int16Array
	| Uint16Array
	| Int32Array
	| Uint32Array
	| Float32Array
	| Float64Array
	| BigInt64Array
	| BigUint64Array {
	// Check if value is an object and has a buffer property
	if (
		!(
			typeof value === 'object' &&
			value !== null &&
			'buffer' in value &&
			value.buffer instanceof ArrayBuffer
		)
	) {
		return false;
	}

	// Convert value.constructor to a string and match the typed array name
	const typeName = Object.prototype.toString.call(value.constructor).match(/\[object (\w+)\]/)[1];

	// List of typed array constructors
	const typedArrays = [
		'Int8Array',
		'Uint8Array',
		'Uint8ClampedArray',
		'Int16Array',
		'Uint16Array',
		'Int32Array',
		'Uint32Array',
		'Float32Array',
		'Float64Array',
		'BigInt64Array',
		'BigUint64Array',
	];

	// Check if the typeName is in the list of typed arrays
	if (typedArrays.includes(typeName)) {
		return true;
	}

	return false;
}

function copy(src: any) {
	if (!(typeof src === 'object' && src !== null)) return src;

	let dst: unknown;

	if (isArray(src)) {
		dst = [];
	} else if (isDate(src)) {
		dst = new Date(src.getTime ? src.getTime() : src);
	} else if (isRegExp(src)) {
		dst = new RegExp(src);
	} else if (isError(src)) {
		dst = { message: src.message };
	} else if (isBoolean(src) || isNumber(src) || isString(src)) {
		dst = Object(src);
	} else if (isTypedArray(src)) {
		return src.slice();
	}
}

const emptyNull: TraverseOptions & { __proto__: null } = { __proto__: null };

function walk(
	root: any,
	cb: (this: TraverseContext, v: any) => void,
	options: TraverseOptions = emptyNull
) {
	const path: string[] = [];
	const parents: TraverseContext[] = [];
	let alive = true;
	const iteratorFunction = options.includeSymbols ? ownEnumerableKeys : objectKeys;
	const immutable = !!options.immutable;

	return (function walker(node_) {
		const node = immutable ? copy(node_) : node_;
		const modifiers: {
			before?: (this: TraverseContext, value: any) => void;
			after?: (this: TraverseContext, value: any) => void;
			pre?: (this: TraverseContext, child: any, key: any) => void;
			post?: (this: TraverseContext, child: any) => void;
		} = {};

		let keepGoing = true;

		const state: TraverseContext = {
			node: node,
			// @ts-expect-error internal
			node_: node_,
			path: ([] as string[]).concat(path),
			parent: parents[parents.length - 1],
			parents: parents,
			key: path[path.length - 1],
			isRoot: path.length === 0,
			level: path.length,
			circular: null,
			update: function (x, stopHere) {
				if (!state.isRoot && state.parent && state.key) {
					state.parent.node[state.key] = x;
				}
				state.node = x;
				if (stopHere) {
					keepGoing = false;
				}
			},
			delete: function (stopHere) {
				delete state.parent?.node[state?.key ?? ''];
				if (stopHere) {
					keepGoing = false;
				}
			},
			remove: function (stopHere) {
				if (isArray(state.parent?.node)) {
					if (state.key) state.parent.node.splice(+state.key, 1);
				} else {
					delete state.parent?.node[state.key ?? ''];
				}
				if (stopHere) {
					keepGoing = false;
				}
			},
			keys: null,
			before: function (f) {
				modifiers.before = f;
			},
			after: function (f) {
				modifiers.after = f;
			},
			pre: function (f) {
				modifiers.pre = f;
			},
			post: function (f) {
				modifiers.post = f;
			},
			stop: function () {
				alive = false;
			},
			block: function () {
				keepGoing = false;
			},
		};

		if (!alive) {
			return state;
		}

		function updateState() {
			if (typeof state.node === 'object' && state.node !== null) {
				// @ts-expect-error internal
				if (!state.keys || state.node_ !== state.node) {
					state.keys = iteratorFunction(state.node);
				}

				state.isLeaf = state.keys.length === 0;

				for (let i = 0; i < parents.length; i++) {
					// @ts-expect-error internal
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

		updateState();

		// use return values to update if defined
		const ret = cb.call(state, state.node);
		if (ret !== undefined && state.update) {
			state.update(ret);
		}

		if (modifiers.before) {
			modifiers.before.call(state, state.node);
		}

		if (!keepGoing) {
			return state;
		}

		if (typeof state.node === 'object' && state.node !== null && !state.circular) {
			parents.push(state);

			updateState();

			for (const [stringIndex, key] of Object.entries(state.keys ?? [])) {
				const index = Number(stringIndex);

				path.push(key);

				if (modifiers.pre) {
					modifiers.pre.call(state, state.node[key], key);
				}

				const child = walker(state.node[key]);
				if (immutable && hasOwnProperty.call(state.node, key) && !isWritable(state.node, key)) {
					state.node[key] = child.node;
				}

				// These were unused. Keep em.
				// child.isLast = i === state.keys.length - 1;
				// child.isFirst = i === 0;

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

export class Traverse<T extends any> {
	#options: TraverseOptions;
	#value: any;

	constructor(obj: T, options?: TraverseOptions) {
		this.#options = options ?? emptyNull;
		this.#value = obj;
	}

	/**
	 * Get the element at the array `path`.
	 */
	get(paths: string[]): T | undefined {
		let node = this.#value;
		for (let i = 0; node && i < paths.length; i++) {
			const key = paths[i];

			if (
				!hasOwnProperty.call(node, key) ||
				(!this.#options.includeSymbols && typeof key === 'symbol')
			) {
				return void undefined;
			}

			node = node[key];
		}

		return node;
	}

	has(paths: string[]): boolean {
		var node = this.#value;

		for (var i = 0; node && i < paths.length; i++) {
			var key = paths[i];

			if (
				!hasOwnProperty.call(node, key) ||
				(!this.#options.includeSymbols && typeof key === 'symbol')
			) {
				return false;
			}

			node = node[key];
		}

		return true;
	}

	set(paths: string[], value: T) {
		var node = this.#value;

		for (var i = 0; i < paths.length - 1; i++) {
			var key = paths[i];

			if (!hasOwnProperty.call(node, key)) {
				node[key] = {};
			}

			node = node[key];
		}

		node[paths[i]] = value;

		return value;
	}

	map(cb: (this: TraverseContext, v: any) => any) {
		return walk(this.#value, cb, {
			// @ts-expect-error internal
			__proto__: null,
			immutable: true,
			includeSymbols: !!this.#options.includeSymbols,
		});
	}

	forEach(cb: (this: TraverseContext, v: any) => void): any {
		this.#value = walk(this.#value, cb, this.#options);
		return this.#value;
	}

	reduce(cb: (this: TraverseContext, acc: any, v: any) => void, init?: T) {
		var skip = arguments.length === 1;
		var acc = skip ? this.#value : init;

		this.forEach(function (x) {
			if (!this.isRoot || !skip) {
				acc = cb.call(this, acc, x);
			}
		});

		return acc;
	}

	paths(): string[][] {
		var acc: string[][] = [];
		this.forEach(function () {
			acc.push(this.path);
		});

		return acc;
	}

	/**
	 * Return an `Array` of every node in the object.
	 */
	nodes(): any[] {
		var acc: any[] = [];
		this.forEach(function () {
			acc.push(this.node);
		});
		return acc;
	}

	clone() {
		var parents: any[] = [];
		var nodes: any[] = [];
		var options = this.#options;

		if (isTypedArray(this.#value)) {
			return this.#value.slice();
		}

		return (function clone(src) {
			for (var i = 0; i < parents.length; i++) {
				if (parents[i] === src) {
					return nodes[i];
				}
			}

			if (typeof src === 'object' && src !== null) {
				var dst = copy(src);

				parents.push(src);
				nodes.push(dst);

				var iteratorFunction = options.includeSymbols ? ownEnumerableKeys : objectKeys;
				for (const key of iteratorFunction(src)) {
					dst[key] = this.clone(src[key]);
				}

				parents.pop();
				nodes.pop();
				return dst;
			}

			return src;
		})(this.#value);
	}
}

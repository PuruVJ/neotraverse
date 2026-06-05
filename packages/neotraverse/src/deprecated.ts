import type { TraverseContext, TraverseOptions } from './modern.js';
import {
	clone,
	entries,
	every,
	filter,
	find,
	forEach,
	forEachAsync,
	get,
	getType,
	has,
	map,
	mapAsync,
	nodes as collectNodes,
	paths,
	reduce as reduceWalk,
	set,
	some,
} from './modern.js';

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
	constructor(obj: any, options: TraverseOptions = {}) {
		this.#value = obj;
		this.#options = options;
	}

	/** @deprecated Use `get(obj, path, options)` instead. */
	get(paths: PropertyKey[]): any {
		return get(this.#value, paths, this.#options);
	}

	/** @deprecated Use `has(obj, path, options)` instead. */
	has(paths: PropertyKey[]): boolean {
		return has(this.#value, paths, this.#options);
	}

	/** @deprecated Use `set(obj, path, value, options)` instead. */
	set(path: PropertyKey[], value: any): any {
		return set(this.#value, path, value, this.#options);
	}

	/** @deprecated Use `map(obj, cb, options)` instead. */
	map(cb: (ctx: TraverseContext, v: any) => void): any {
		return map(this.#value, cb, this.#options);
	}

	/** @deprecated Use `forEach(obj, cb, options)` instead. */
	forEach(cb: (ctx: TraverseContext, v: any) => void): any {
		this.#value = forEach(this.#value, cb, this.#options);
		return this.#value;
	}

	/** @deprecated Use `reduce(obj, cb, init?, options?)` instead. */
	reduce(cb: (ctx: TraverseContext, acc: any, v: any) => any, init?: any): any {
		if (arguments.length === 1) {
			let acc = this.#value;
			forEach(this.#value, (ctx, x) => {
				if (!ctx.isRoot) acc = cb(ctx, acc, x);
			}, this.#options);
			return acc;
		}
		return reduceWalk(this.#value, cb, init, this.#options);
	}

	/** @deprecated Use `find(obj, fn, options)` instead. */
	find(fn: (ctx: TraverseContext, v: any) => unknown): any {
		return find(this.#value, fn, this.#options);
	}

	/** @deprecated Use `filter(obj, fn, options)` instead. */
	filter(fn: (ctx: TraverseContext, v: any) => unknown): any[] {
		return filter(this.#value, fn, this.#options);
	}

	/** @deprecated Use `some(obj, fn, options)` instead. */
	some(fn: (ctx: TraverseContext, v: any) => unknown): boolean {
		return some(this.#value, fn, this.#options);
	}

	/** @deprecated Use `every(obj, fn, options)` instead. */
	every(fn: (ctx: TraverseContext, v: any) => unknown): boolean {
		return every(this.#value, fn, this.#options);
	}

	/** @deprecated Use `paths(obj, options)` instead. */
	paths(): PropertyKey[][] {
		return paths(this.#value, this.#options);
	}

	/** @deprecated Use `nodes(obj, options)` instead. */
	nodes(): any[] {
		return collectNodes(this.#value, this.#options);
	}

	/** @deprecated Use `clone(obj, options)` instead. */
	clone(): any {
		return clone(this.#value, this.#options);
	}

	/** @deprecated Use `entries(obj, options)` instead. */
	*entries(): Generator<[PropertyKey[], any]> {
		yield* entries(this.#value, this.#options);
	}

	/** @deprecated Use `values(obj, options)` or `entries(obj, options)` instead. */
	*[Symbol.iterator](): Generator<any> {
		for (const [, node] of entries(this.#value, this.#options)) yield node;
	}

	/** @deprecated Use `forEachAsync(obj, cb, options)` instead. */
	async forEachAsync(cb: (ctx: TraverseContext, v: any) => void | Promise<void>): Promise<any> {
		this.#value = await forEachAsync(this.#value, cb, this.#options);
		return this.#value;
	}

	/** @deprecated Use `mapAsync(obj, cb, options)` instead. */
	async mapAsync(cb: (ctx: TraverseContext, v: any) => void | Promise<void>): Promise<any> {
		return mapAsync(this.#value, cb, this.#options);
	}
}

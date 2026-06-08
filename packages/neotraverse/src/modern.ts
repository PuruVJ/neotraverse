// `neotraverse/modern` — ONLY the deprecated `Traverse` class (and the types its surface
// uses). The functional API now lives at the root (`neotraverse`). This subpath exists
// purely so existing `import { Traverse } from 'neotraverse/modern'` keeps working until
// the class is removed in v2.
//
// The class deliberately mirrors the legacy `Traverse` method set exactly (get/has/set/
// map/forEach/reduce/paths/nodes/clone) — a deprecated API shouldn't grow new powers. Use
// the standalone functions from `neotraverse` for everything else (find/filter/some/every,
// entries/values, async walks, etc.).
import { clone } from './clone.js';
import { forEach, map, nodes as collectNodes, paths, reduce as reduceWalk } from './context.js';
import { get, has, set } from './path.js';
import type { TraverseContext, TraverseOptions } from './utils.js';

export type { TraverseContext, TraverseOptions } from './utils.js';

/**
 * @deprecated The `Traverse` class is deprecated and will be removed in v2. Import the
 * standalone functions from `neotraverse` instead. See the migration guide.
 */
export class Traverse {
	#value: any;
	#options: TraverseOptions;

	/** @deprecated Use standalone functions from `neotraverse` instead. */
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
			forEach(
				this.#value,
				(ctx, x) => {
					if (!ctx.isRoot) acc = cb(ctx, acc, x);
				},
				this.#options,
			);
			return acc;
		}
		return reduceWalk(this.#value, cb, init, this.#options);
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
}

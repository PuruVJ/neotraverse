import { forEach } from './context.js';
import type { TraverseContext, TraverseOptions } from './utils.js';
import {
	assertSafePath,
	coerceKey,
	GLOB_INDEX_RE,
	has_own_property,
	is_unsafe_key,
	PTR_UNESCAPE_SLASH_RE,
	PTR_UNESCAPE_TILDE_RE,
	safe_set,
	SLASH_RE,
	TILDE_RE,
} from './utils.js';

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
	const keys = raw.map((seg) =>
		coerceKey(seg.replace(PTR_UNESCAPE_SLASH_RE, '/').replace(PTR_UNESCAPE_TILDE_RE, '~')),
	);
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
		if (s.indexOf('~') !== -1 || s.indexOf('/') !== -1)
			s = s.replace(TILDE_RE, '~0').replace(SLASH_RE, '~1');
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

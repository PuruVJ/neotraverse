// The PATH engine: get / set / has over one path algebra (dot string, JSON
// Pointer string, or exact key array). `set` is copy-on-write by default — it
// copies the O(depth) spine and shares every sibling — and returns the new
// root, obeying the same write contract as transform. Map and Set are navigated
// natively, so `get(root, v.path) === v.value` round-trips for every visit (I7).
//
// This module imports only leaf primitives from kernel/keys (pollution-safe
// writes, key coercion); it never pulls the cursor, pattern compiler, or
// transform, so a get/set/has-only consumer stays tiny.

import { coerce_key, has_own, is_unsafe_key, safe_set, shallow_shell } from './kernel/keys.js';

export type Path = string | readonly PropertyKey[];

// --- parsing -----------------------------------------------------------------

function parse_dot(path: string): PropertyKey[] {
	const keys: PropertyKey[] = [];
	let cur = '';
	for (let i = 0; i < path.length; i++) {
		const c = path[i];
		if (c === '\\' && i + 1 < path.length) {
			cur += path[++i];
			continue;
		}
		if (c === '.') {
			if (cur.length) keys.push(coerce_key(cur));
			cur = '';
			continue;
		}
		cur += c;
	}
	if (cur.length) keys.push(coerce_key(cur));
	return keys;
}

function parse_pointer(pointer: string): PropertyKey[] {
	if (pointer === '') return [];
	const raw = pointer.slice(1).split('/');
	return raw.map((seg) => coerce_key(seg.replace(/~1/g, '/').replace(/~0/g, '~')));
}

/** Normalize any path spelling to an exact key array. Array form is taken as-is. */
export function to_keys(path: Path): readonly PropertyKey[] {
	if (typeof path !== 'string') return path;
	if (path === '') return [];
	return path[0] === '/' ? parse_pointer(path) : parse_dot(path);
}

// --- read --------------------------------------------------------------------

// One navigation step. `found` distinguishes a present-undefined from a miss.
function step_read(node: any, key: PropertyKey): { found: boolean; value: any } {
	if (node === null || node === undefined) return { found: false, value: undefined };
	if (is_unsafe_key(key)) return { found: false, value: undefined }; // unsafe segment read as absent
	if (node instanceof Map) {
		return node.has(key)
			? { found: true, value: node.get(key) }
			: { found: false, value: undefined };
	}
	if (node instanceof Set) {
		if (typeof key === 'number' && key >= 0 && key < node.size) {
			let i = 0;
			for (const v of node) {
				if (i === key) return { found: true, value: v };
				i++;
			}
		}
		return { found: false, value: undefined };
	}
	if (typeof node === 'object' || typeof node === 'string') {
		if (has_own.call(node, key)) return { found: true, value: (node as any)[key] };
	}
	return { found: false, value: undefined };
}

export function get<T, const P extends Path>(obj: T, path: P): Get<T, P>;
export function get<T, const P extends Path, F>(obj: T, path: P, fallback: F): Get<T, P> | F;
export function get(obj: any, path: Path, fallback?: any): any {
	const keys = to_keys(path);
	let node = obj;
	for (let i = 0; i < keys.length; i++) {
		const r = step_read(node, keys[i]);
		if (!r.found) return fallback;
		node = r.value;
	}
	return node;
}

export function has(obj: unknown, path: Path): boolean {
	const keys = to_keys(path);
	let node: any = obj;
	for (let i = 0; i < keys.length; i++) {
		const r = step_read(node, keys[i]);
		if (!r.found) return false;
		node = r.value;
	}
	return true;
}

// --- write -------------------------------------------------------------------

export interface WriteOptions {
	/** Edit the input in place instead of copy-on-write. @default false. */
	mutate?: boolean;
}

function write_child(node: any, key: PropertyKey, value: any): void {
	if (node instanceof Map) node.set(key, value);
	else safe_set(node, key, value);
}

function read_child(node: any, key: PropertyKey): any {
	if (node instanceof Map) return node.get(key);
	if (node === null || typeof node !== 'object') return undefined;
	return node[key];
}

// Shallow-copy `node` for a write, preserving its container kind; autovivify a
// fresh container when `node` is missing or not a container.
function copy_container(node: any, keyForKind: PropertyKey): any {
	if (node === null || typeof node !== 'object') {
		return typeof keyForKind === 'number' ? [] : {};
	}
	if (node instanceof Map) return new Map(node);
	return shallow_shell(node, true);
}

function set_cow(node: any, keys: readonly PropertyKey[], i: number, value: any): any {
	if (i === keys.length) return value;
	const key = keys[i];
	const isLast = i === keys.length - 1;
	let child = read_child(node, key);
	if (!isLast && (child === null || typeof child !== 'object')) {
		child = typeof keys[i + 1] === 'number' ? [] : {};
	}
	const newChild = set_cow(child, keys, i + 1, value);
	// Write-contract identity (law 3): if nothing changed below, share this node
	// by reference instead of copying the spine. Propagates up to return the
	// original root when set() is a genuine no-op.
	if (newChild === child && read_child(node, key) === child) return node;
	const copy = copy_container(node, key);
	write_child(copy, key, newChild);
	return copy;
}

function set_in_place(obj: any, keys: readonly PropertyKey[], value: any): void {
	let node = obj;
	for (let i = 0; i < keys.length - 1; i++) {
		const key = keys[i];
		let child = read_child(node, key);
		if (child === null || typeof child !== 'object') {
			child = typeof keys[i + 1] === 'number' ? [] : {};
			write_child(node, key, child);
		}
		node = child;
	}
	write_child(node, keys[keys.length - 1], value);
}

export function set<T, const P extends Path>(
	obj: T,
	path: P,
	value: SetValue<T, P>,
	options?: WriteOptions,
): T;
export function set(obj: any, path: Path, value: any, options?: WriteOptions): any {
	const keys = to_keys(path);
	if (keys.length === 0) return value;
	for (let i = 0; i < keys.length; i++) {
		if (is_unsafe_key(keys[i])) {
			throw new TypeError(`neotraverse: unsafe path segment "${String(keys[i])}"`);
		}
	}
	if (options?.mutate) {
		set_in_place(obj, keys, value);
		return obj;
	}
	return set_cow(obj, keys, 0, value);
}

// ---------------------------------------------------------------------------
// Template-literal typed paths (spec §G). Glob-free string paths and pointers
// flow through `Get<T, P>`; dynamic strings degrade to `unknown` rather than lie.
// ---------------------------------------------------------------------------

type ParseKey<S extends string> = S extends `${infer N extends number}` ? N : S;

type ReplaceAll<
	S extends string,
	From extends string,
	To extends string,
> = S extends `${infer A}${From}${infer B}` ? `${A}${To}${ReplaceAll<B, From, To>}` : S;
type PtrUnescape<S extends string> = ReplaceAll<ReplaceAll<S, '~1', '/'>, '~0', '~'>;

type SplitDot<P extends string> = P extends `${infer H}.${infer R}`
	? [ParseKey<H>, ...SplitDot<R>]
	: [ParseKey<P>];
type SplitPtr<P extends string> = P extends `${infer H}/${infer R}`
	? [ParseKey<PtrUnescape<H>>, ...SplitPtr<R>]
	: [ParseKey<PtrUnescape<P>>];

type Keys<P extends Path> = P extends readonly PropertyKey[]
	? P
	: P extends string
		? string extends P
			? PropertyKey[] // non-literal string: bail out
			: P extends `${string}\\${string}`
				? PropertyKey[] // escaped dots: runtime-only
				: P extends ''
					? []
					: P extends `/${infer R}`
						? SplitPtr<R>
						: SplitDot<P>
		: never;

type Step<T, K> = T extends null | undefined
	? undefined
	: K extends keyof T
		? T[K]
		: T extends readonly (infer E)[]
			? K extends number | `${number}`
				? E | undefined
				: undefined
			: T extends ReadonlyMap<infer MK, infer MV>
				? K extends MK
					? MV | undefined
					: undefined
				: T extends object
					? string extends keyof T
						? T[string & keyof T] | undefined
						: undefined
					: undefined;

type GetIn<T, K extends readonly unknown[]> = K extends readonly [
	infer H,
	...infer R extends readonly unknown[],
]
	? GetIn<Step<T, H>, R>
	: T;

export type Get<T, P extends Path> = PropertyKey[] extends Keys<P> ? unknown : GetIn<T, Keys<P>>;

export type SetValue<T, P extends Path> =
	unknown extends Get<T, P>
		? unknown // dynamic path: anything goes
		: [Get<T, P>] extends [undefined]
			? unknown // path absent in T (autovivify): anything goes
			: Get<T, P>; // statically known slot: value must fit

// ---------------------------------------------------------------------------
// In-source unit tests for the parse + COW internals. Public get/set/has
// behavior is covered by the integration suite in test/.
// ---------------------------------------------------------------------------
if (import.meta.vitest) {
	const { describe, it, expect } = import.meta.vitest;

	describe('path: parsing', () => {
		it('dot paths coerce canonical integers', () => {
			expect(to_keys('users.0.name')).toEqual(['users', 0, 'name']);
			expect(to_keys('a.08')).toEqual(['a', '08']); // leading zero stays string
		});
		it('escaped dots stay literal', () => {
			expect(to_keys('a\\.b')).toEqual(['a.b']);
		});
		it('JSON Pointer with ~ escapes', () => {
			expect(to_keys('/a~1b/c~0d')).toEqual(['a/b', 'c~d']);
			expect(to_keys('')).toEqual([]);
		});
		it('array form is exact', () => {
			const s = Symbol('s');
			expect(to_keys(['a', 0, s])).toEqual(['a', 0, s]);
		});
	});

	describe('path: set is copy-on-write (spine only)', () => {
		it('shares siblings, copies the spine, returns a new root', () => {
			const obj = { a: { b: 1 }, sib: { x: 1 } };
			const next = set(obj, 'a.b', 2);
			expect(next).not.toBe(obj);
			expect(next.sib).toBe(obj.sib); // sibling shared
			expect(next.a).not.toBe(obj.a); // spine copied
			expect(next.a.b).toBe(2);
			expect(obj.a.b).toBe(1); // input untouched
		});
		it('autovivifies arrays for numeric next segments', () => {
			const next = set({} as any, 'list.0.id', 5);
			expect(Array.isArray(next.list)).toBe(true);
			expect(next.list[0].id).toBe(5);
		});
		it('mutate mode writes in place and returns the root', () => {
			const obj: any = { a: { b: 1 } };
			expect(set(obj, 'a.b', 9, { mutate: true })).toBe(obj);
			expect(obj.a.b).toBe(9);
		});
		it('returns the input by identity when the value is unchanged (law 3, regression)', () => {
			const obj = { a: { b: 5 }, sib: { x: 1 } };
			expect(set(obj, 'a.b', 5)).toBe(obj); // same value → no copy
			const changed = set(obj, 'a.b', 6);
			expect(changed).not.toBe(obj);
			expect(changed.sib).toBe(obj.sib); // still shares siblings
		});
	});

	describe('path: security', () => {
		it('set throws on unsafe segments', () => {
			expect(() => set({}, '__proto__.polluted', true)).toThrow(TypeError);
			expect(({} as any).polluted).toBeUndefined();
		});
		it('get/has treat unsafe segments as absent', () => {
			expect(get({}, '__proto__.polluted')).toBeUndefined();
			expect(has({}, ['constructor'])).toBe(false);
		});
	});

	describe('path: fallback only when absent', () => {
		it('returns fallback on miss but present-undefined wins', () => {
			expect(get({ a: 1 }, 'b', 'fb')).toBe('fb');
			expect(get({ a: undefined }, 'a', 'fb')).toBe(undefined);
		});
	});

	describe('path: Map/Set navigation (I7)', () => {
		it('navigates Map by key and Set by index', () => {
			expect(get(new Map([['k', 7]]), ['k'])).toBe(7);
			expect(get(new Set(['x', 'y']), [1])).toBe('y');
			expect(has(new Map([['k', 7]]), ['k'])).toBe(true);
		});
	});
}

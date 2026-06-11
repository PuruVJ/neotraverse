// RFC 6902 diff/patch — the subset that interoperates with JSON-Patch tooling:
// add / remove / replace, JSON Pointer string paths. No move/copy/invert — the
// undo patch is just diff(b, a). `diff` throws on cycles (RFC 6902 cannot
// represent them; loud beats v1's silent truncation). `patch` applies copy-on-
// write on the set spine, so unpatched subtrees are shared and patch(x, []) === x.

import { assert_depth, has_own, shallow_shell, type_tag } from './kernel/keys.js';
import { clone } from './clone.js';
import { equal } from './equal.js';
import { set, to_keys, type WriteOptions } from './path.js';

export type PatchOp =
	| { op: 'add'; path: string; value: any }
	| { op: 'remove'; path: string }
	| { op: 'replace'; path: string; value: any };

export interface DiffOptions {
	maxDepth?: number;
}

function pointer(path: PropertyKey[]): string {
	let out = '';
	for (let i = 0; i < path.length; i++) {
		let s = String(path[i]);
		if (s.indexOf('~') !== -1 || s.indexOf('/') !== -1)
			s = s.replace(/~/g, '~0').replace(/\//g, '~1');
		out += '/' + s;
	}
	return out;
}

const ATOMIC = new Set([
	'map',
	'set',
	'weakmap',
	'weakset',
	'date',
	'regexp',
	'error',
	'typed-array',
	'arraybuffer',
	'dataview',
	'function',
]);

// diff's contract is to THROW on any cyclic input (RFC 6902 cannot represent
// cycles). diff_pair's ancestor stack catches cycles on the COMPARED path, but
// added / removed / type-replaced subtrees are not recursed — so we scan them
// explicitly before cloning/discarding, to enforce the contract consistently.
function assert_acyclic(value: any, seen: Set<object>): void {
	if (typeof value !== 'object' || value === null) return;
	if (seen.has(value)) throw new TypeError('neotraverse: diff does not support cyclic inputs');
	seen.add(value);
	if (Array.isArray(value)) {
		for (let i = 0; i < value.length; i++) assert_acyclic(value[i], seen);
	} else if (value instanceof Map) {
		for (const v of value.values()) assert_acyclic(v, seen);
	} else if (value instanceof Set) {
		for (const v of value) assert_acyclic(v, seen);
	} else {
		for (const k of Object.keys(value)) assert_acyclic((value as any)[k], seen);
	}
	seen.delete(value);
}

function diff_pair(
	a: any,
	b: any,
	path: PropertyKey[],
	ops: PatchOp[],
	stack: WeakSet<object>,
	maxDepth: number | undefined,
	depth: number,
): void {
	if (a === b) return;
	assert_depth(depth, maxDepth);
	const ta = type_tag(a);
	const tb = type_tag(b);
	if (ta !== tb || ta === 'primitive' || ta === 'null') {
		assert_acyclic(a, new Set());
		assert_acyclic(b, new Set());
		ops.push({ op: 'replace', path: pointer(path), value: clone(b) });
		return;
	}

	const tracked = typeof a === 'object' && a !== null;
	if (tracked) {
		if (stack.has(a)) throw new TypeError('neotraverse: diff does not support cyclic inputs');
		stack.add(a);
	}

	if (ta === 'array') {
		const min = Math.min(a.length, b.length);
		for (let i = 0; i < min; i++)
			diff_pair(a[i], b[i], path.concat(i), ops, stack, maxDepth, depth + 1);
		for (let i = a.length; i < b.length; i++) {
			assert_acyclic(b[i], new Set());
			ops.push({ op: 'add', path: pointer(path.concat(i)), value: clone(b[i]) });
		}
		// shrink from the tail downward so earlier indices stay valid on apply
		for (let i = a.length - 1; i >= b.length; i--) {
			assert_acyclic(a[i], new Set());
			ops.push({ op: 'remove', path: pointer(path.concat(i)) });
		}
	} else if (ATOMIC.has(ta)) {
		if (!equal(a, b, { maxDepth }))
			ops.push({ op: 'replace', path: pointer(path), value: clone(b) });
	} else {
		const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
		for (const k of keys) {
			const p = path.concat(k);
			const ha = has_own.call(a, k);
			const hb = has_own.call(b, k);
			if (ha && !hb) {
				assert_acyclic((a as any)[k], new Set());
				ops.push({ op: 'remove', path: pointer(p) });
			} else if (!ha && hb) {
				assert_acyclic((b as any)[k], new Set());
				ops.push({ op: 'add', path: pointer(p), value: clone((b as any)[k]) });
			} else {
				diff_pair((a as any)[k], (b as any)[k], p, ops, stack, maxDepth, depth + 1);
			}
		}
	}

	if (tracked) stack.delete(a);
}

/**
 * RFC 6902 subset diff (`add`/`remove`/`replace`). The undo patch is `diff(b, a)`.
 *
 * @example
 * ```js
 * diff({ a: 1 }, { a: 2, b: 3 });
 * // [{ op: 'replace', path: '/a', value: 2 }, { op: 'add', path: '/b', value: 3 }]
 * ```
 */
export function diff(a: unknown, b: unknown, options?: DiffOptions): PatchOp[] {
	const ops: PatchOp[] = [];
	diff_pair(a, b, [], ops, new WeakSet(), options?.maxDepth, 0);
	return ops;
}

function remove_at(root: any, keys: readonly PropertyKey[], mutate: boolean): any {
	if (keys.length === 0) return root;
	const parentKeys = keys.slice(0, -1);
	const last = keys[keys.length - 1];
	const parent = parentKeys.length ? get_in(root, parentKeys) : root;
	if (parent == null) return root; // nothing to remove
	if (mutate) {
		if (Array.isArray(parent) && typeof last === 'number') parent.splice(last, 1);
		else if (parent instanceof Map) parent.delete(last);
		else delete parent[last as PropertyKey];
		return root;
	}
	// COW: rebuild just the parent without `last`, share the rest via set().
	let newParent: any;
	if (Array.isArray(parent) && typeof last === 'number') {
		newParent = parent.slice();
		newParent.splice(last, 1);
	} else if (parent instanceof Map) {
		newParent = new Map(parent);
		newParent.delete(last);
	} else {
		newParent = shallow_shell(parent, true);
		delete newParent[last as PropertyKey];
	}
	return parentKeys.length ? set(root, parentKeys, newParent) : newParent;
}

// minimal own-key navigation for patch internals (avoids importing get's overloads)
function get_in(node: any, keys: readonly PropertyKey[]): any {
	for (let i = 0; i < keys.length; i++) {
		if (node == null) return undefined;
		node = node instanceof Map ? node.get(keys[i]) : node[keys[i] as any];
	}
	return node;
}

/**
 * Apply RFC 6902 ops copy-on-write. `patch(x, []) === x`; `{ mutate: true }`
 * applies in place. Throws on `move`/`copy`/`test` ops.
 */
export function patch<T>(value: T, ops: readonly PatchOp[], options?: WriteOptions): T;
export function patch(value: any, ops: readonly PatchOp[], options?: WriteOptions): any {
	const mutate = !!options?.mutate;
	let root = value;
	for (let i = 0; i < ops.length; i++) {
		const op = ops[i];
		if (op.op !== 'add' && op.op !== 'remove' && op.op !== 'replace') {
			throw new TypeError(`neotraverse: unsupported patch op "${(op as any).op}"`);
		}
		const keys = to_keys(op.path.startsWith('/') || op.path === '' ? op.path : `/${op.path}`);
		if (op.op === 'remove') {
			root = remove_at(root, keys, mutate);
		} else if (op.op === 'add' && keys.length > 0 && typeof keys[keys.length - 1] === 'number') {
			// RFC 6902 add into an array inserts (shifts right).
			root = insert_at(root, keys, op.value, mutate);
		} else {
			root = set(root, keys, op.value, { mutate });
		}
	}
	return root;
}

function insert_at(root: any, keys: readonly PropertyKey[], value: any, mutate: boolean): any {
	const parentKeys = keys.slice(0, -1);
	const idx = keys[keys.length - 1] as number;
	const parent = parentKeys.length ? get_in(root, parentKeys) : root;
	if (Array.isArray(parent)) {
		if (mutate) {
			parent.splice(idx, 0, value);
			return root;
		}
		const copy = parent.slice();
		copy.splice(idx, 0, value);
		return parentKeys.length ? set(root, parentKeys, copy) : copy;
	}
	return set(root, keys, value, { mutate });
}

// ---------------------------------------------------------------------------
// In-source unit tests.
// ---------------------------------------------------------------------------
if (import.meta.vitest) {
	const { describe, it, expect } = import.meta.vitest;

	describe('diff/patch: round-trips', () => {
		it('produces RFC 6902 ops', () => {
			expect(diff({ a: 1 }, { a: 2, b: 3 })).toEqual([
				{ op: 'replace', path: '/a', value: 2 },
				{ op: 'add', path: '/b', value: 3 },
			]);
		});
		it('patch(a, diff(a,b)) equals b', () => {
			const a = { x: 1, list: [1, 2, 3], nested: { k: 'v' } };
			const b = { x: 2, list: [1, 9], nested: { k: 'v', extra: true } };
			expect(equal(patch(a, diff(a, b)), b)).toBe(true);
		});
		it('undo is diff(b, a)', () => {
			const a = { items: [1, 2], flag: true };
			const b = { items: [1, 2, 3], flag: false };
			const next = patch(a, diff(a, b));
			const back = patch(next, diff(b, a));
			expect(equal(back, a)).toBe(true);
		});
	});

	describe('diff/patch: contracts', () => {
		it('patch([]) returns the input by identity', () => {
			const x = { a: 1 };
			expect(patch(x, [])).toBe(x);
		});
		it('patch is copy-on-write and shares untouched subtrees', () => {
			const x = { a: { keep: 1 }, b: { n: 1 } };
			const out = patch(x, [{ op: 'replace', path: '/b/n', value: 2 }]);
			expect(out).not.toBe(x);
			expect(out.a).toBe(x.a);
			expect(x.b.n).toBe(1);
		});
		it('diff throws on cycles', () => {
			const a: any = {};
			a.self = a;
			expect(() => diff(a, { self: {} })).toThrow(TypeError);
		});
		it('diff throws on cycles inside removed/added subtrees, not just the compared path (regression)', () => {
			const a: any = { x: 1 };
			a.self = a; // self is REMOVED in b — must still throw
			expect(() => diff(a, { x: 2 })).toThrow(TypeError);
			const inner: any = {};
			inner.loop = inner;
			expect(() => diff({ x: 1 }, { data: inner })).toThrow(TypeError); // ADDED cyclic subtree
		});
		it('a DAG (shared non-ancestor) does NOT throw', () => {
			const shared = { v: 1 };
			expect(() => diff({ a: shared, b: shared }, { a: shared, b: shared, c: 1 })).not.toThrow();
		});
		it('patch throws on move/copy/test', () => {
			expect(() => patch({}, [{ op: 'move' } as any])).toThrow(TypeError);
		});
	});
}

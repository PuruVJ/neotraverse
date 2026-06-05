import type { TraverseContext, TraverseOptions } from './modern.ts';
import {
	clone,
	forEach,
	get,
	has,
	map,
	set,
} from './modern.ts';

const to_string = (obj: unknown) => Object.prototype.toString.call(obj);
const is_typed_array = (value: unknown): value is ArrayBufferView & { length: number } =>
	ArrayBuffer.isView(value) && !(value instanceof DataView);
const is_array = Array.isArray;
const has_own_property = Object.prototype.hasOwnProperty;

const is_boxed_primitive = (obj: unknown): boolean => {
	const tag = to_string(obj);
	return tag === '[object Boolean]' || tag === '[object Number]' || tag === '[object String]';
};

const is_unsafe_key = (key: PropertyKey): boolean =>
	key === '__proto__' || key === 'constructor' || key === 'prototype';

/** Locked union — do not rename tags after release. */
export type TraverseNodeType =
	| 'null'
	| 'array'
	| 'object'
	| 'date'
	| 'regexp'
	| 'map'
	| 'set'
	| 'typed-array'
	| 'boxed-primitive'
	| 'error'
	| 'primitive';

export function getType(value: unknown): TraverseNodeType {
	if (value === null) return 'null';
	const t = typeof value;
	if (t !== 'object') return 'primitive';
	if (is_array(value)) return 'array';
	if (value instanceof Date) return 'date';
	if (value instanceof RegExp) return 'regexp';
	if (value instanceof Map) return 'map';
	if (value instanceof Set) return 'set';
	if (is_typed_array(value)) return 'typed-array';
	if (value instanceof Error) return 'error';
	if (is_boxed_primitive(value)) return 'boxed-primitive';
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
		case 'boxed-primitive':
			return Object(a).valueOf() === Object(b).valueOf();
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

	if (ta === 'map' || ta === 'set' || ta === 'date' || ta === 'regexp' || ta === 'error' || ta === 'typed-array') {
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
		safeSet(parent, last, value);
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

function safeSet(obj: any, key: PropertyKey, value: any): void {
	if (is_unsafe_key(key)) return;
	obj[key] = value;
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

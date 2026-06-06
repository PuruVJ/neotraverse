import { describe, expect, test } from 'vitest';
import {
	clone,
	count,
	deepEqual,
	deleteWhere,
	diff,
	filterPaths,
	findPaths,
	freeze,
	getPath,
	getType,
	hasPath,
	parseDotPath,
	parsePath,
	patch,
	prune,
	pruneDeep,
	select,
	setPath,
	size,
	toJSON,
} from '../src/modern';

describe('backlog: paths & types', () => {
	test('parsePath dot and pointer', () => {
		expect(parseDotPath('a.b.0')).toEqual(['a', 'b', 0]);
		expect(parsePath('/a/b/0')).toEqual(['a', 'b', 0]);
		expect(parsePath('a\\.b.c')).toEqual(['a.b', 'c']);
	});

	test('getPath / setPath / hasPath', () => {
		const obj = { a: { b: [1, 2] } };
		expect(getPath(obj, 'a.b.0')).toBe(1);
		expect(hasPath(obj, 'a.b.2')).toBe(false);
		setPath(obj, 'a.b.0', 9);
		expect(obj.a.b[0]).toBe(9);
	});

	test('unsafe path segment throws', () => {
		expect(() => parsePath('a.__proto__.x')).toThrow(/unsafe/);
	});

	test('getType tags', () => {
		expect(getType(null)).toBe('null');
		expect(getType(3)).toBe('primitive');
		expect(getType('hi')).toBe('primitive');
		expect(getType(() => {})).toBe('function');
		expect(getType(new Date())).toBe('date');
		expect(getType(new Map())).toBe('map');
		expect(getType(new WeakMap())).toBe('weakmap');
		expect(getType(new Uint8Array(1))).toBe('typed-array');
		expect(getType(new ArrayBuffer(4))).toBe('arraybuffer');
		expect(getType(new DataView(new ArrayBuffer(4)))).toBe('dataview');
		expect(getType(new String('hi'))).toBe('object');
	});

	test('ArrayBuffer and DataView clone', () => {
		const buf = new Uint8Array([1, 2, 3]).buffer;
		const clonedBuf = clone(buf);
		expect(clonedBuf).not.toBe(buf);
		expect(new Uint8Array(clonedBuf)).toEqual(new Uint8Array([1, 2, 3]));

		const view = new DataView(buf);
		view.setUint8(0, 9);
		const clonedView = clone(view);
		expect(clonedView).not.toBe(view);
		expect(clonedView.getUint8(0)).toBe(9);
	});
});

describe('backlog: findPaths / count', () => {
	const tree = { a: 1, b: { c: 2, d: 3 } };

	test('findPaths and filterPaths', () => {
		expect(findPaths(tree, (_, x) => x === 2)).toEqual(['b', 'c']);
		expect(filterPaths(tree, (ctx) => ctx.isLeaf)).toEqual([
			{ path: ['a'], node: 1 },
			{ path: ['b', 'c'], node: 2 },
			{ path: ['b', 'd'], node: 3 },
		]);
	});

	test('count and size', () => {
		expect(size(tree)).toBe(5);
		expect(count(tree, (ctx) => ctx.isLeaf)).toBe(3);
	});
});

describe('backlog: transform & compare', () => {
	test('deleteWhere and prune', () => {
		const obj = { a: 1, b: { secret: true, ok: 2 }, c: 3 };
		const scrubbed = deleteWhere(structuredClone(obj), (_, x) => x === true);
		expect(scrubbed).toEqual({ a: 1, b: { ok: 2 }, c: 3 });

		const kept = prune(structuredClone(obj), (ctx) => ctx.key !== 'secret' || ctx.isRoot);
		expect(kept.b.secret).toBeUndefined();
	});

	test('pruneDeep', () => {
		const deep = { a: { b: { c: { d: 1 } } } };
		const cut = pruneDeep(deep, 1, '[truncated]');
		expect(cut.a.b).toBe('[truncated]');
	});

	test('freeze', () => {
		const obj = { a: { b: 1 } };
		freeze(obj);
		expect(Object.isFrozen(obj)).toBe(true);
		expect(Object.isFrozen(obj.a)).toBe(true);
	});

	test('deepEqual', () => {
		expect(deepEqual({ a: 1 }, { a: 1 })).toBe(true);
		expect(deepEqual(new Date(0), new Date(0))).toBe(true);
		expect(deepEqual(new String('a'), new String('a'))).toBe(true);
		expect(deepEqual(new String('a'), 'a')).toBe(false);
		expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
		expect(deepEqual(1, 2, { compareFn: () => true })).toBe(true);
	});

	test('toJSON cycles', () => {
		const obj: any = { a: 1 };
		obj.self = obj;
		expect(JSON.parse(toJSON(obj))).toEqual({ a: 1, self: null });
	});
});

describe('backlog: diff / patch / select', () => {
	test('diff and patch round-trip', () => {
		const a = { x: 1, y: [2, 3] };
		const b = { x: 2, y: [2, 4], z: 5 };
		const ops = diff(a, b);
		const result = patch(structuredClone(a), ops);
		expect(result).toEqual(b);
	});

	test('select glob', () => {
		const tree = { users: [{ email: 'a@x.com' }, { email: 'b@x.com' }], meta: {} };
		const hits = select(tree, 'users[*].email');
		expect(hits).toHaveLength(2);
		expect(hits[0].node).toBe('a@x.com');
		expect(hits[1].path).toEqual(['users', 1, 'email']);
	});
});

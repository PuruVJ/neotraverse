import assert from 'node:assert';
import { expect, test } from 'vitest';
import traverse from '../src';
import { Traverse } from '../src/modern';

test('mutate', () => {
	const obj = { a: 1, b: 2, c: [3, 4] };
	const res = traverse(obj).forEach(function (x) {
		if (typeof x === 'number' && x % 2 === 0) {
			this.update(x * 10);
		}
	});

	expect(obj).toEqual(res);
	expect(obj).toEqual({ a: 1, b: 20, c: [3, 40] });
});

test('mutate_modern', () => {
	const obj = { a: 1, b: 2, c: [3, 4] };
	const res = new Traverse(obj).forEach((ctx, x) => {
		if (typeof x === 'number' && x % 2 === 0) {
			ctx.update(x * 10);
		}
	});

	expect(obj).toEqual(res);
	expect(obj).toEqual({ a: 1, b: 20, c: [3, 40] });
});

test('map', () => {
	const obj = { a: 1, b: 2, c: [3, 4] };
	const res = traverse(obj).map(function (x) {
		if (typeof x === 'number' && x % 2 === 0) {
			this.update(x * 10);
		}
	});

	expect(obj).toEqual({ a: 1, b: 2, c: [3, 4] });
	expect(res).toEqual({ a: 1, b: 20, c: [3, 40] });
});

test('map_modern', () => {
	const obj = { a: 1, b: 2, c: [3, 4] };
	const res = new Traverse(obj).map((ctx, x) => {
		if (typeof x === 'number' && x % 2 === 0) {
			ctx.update(x * 10);
		}
	});

	expect(obj).toEqual({ a: 1, b: 2, c: [3, 4] });
	expect(res).toEqual({ a: 1, b: 20, c: [3, 40] });
});

test('clone', () => {
	const obj = { a: 1, b: 2, c: [3, 4] };
	const res = traverse(obj).clone();
	expect(obj).toEqual(res);
	expect(obj).not.toBe(res);

	obj.a += 1;
	expect(res.a).toBe(1);

	obj.c.push(5);
	expect(res.c).toEqual([3, 4]);
});

test('clone_modern', () => {
	const obj = { a: 1, b: 2, c: [3, 4] };
	const res = new Traverse(obj).clone();
	expect(obj).toEqual(res);
	expect(obj).not.toBe(res);

	obj.a += 1;
	expect(res.a).toBe(1);

	obj.c.push(5);
	expect(res.c).toEqual([3, 4]);
});

// TODO: Investigate why clone gives a different Uint8Array
test('cloneTypedArray', () => {
	const obj = new Uint8Array([1]);
	const res = traverse(obj).clone();

	expect(Array.from(obj)).toEqual(Array.from(res));
	expect(obj).not.toBe(res);

	obj.set([2], 0);
	res.set([3], 0);

	expect(obj).toEqual(new Uint8Array([2]));
	expect(res).toEqual(new Uint8Array([3]));
});

test('cloneTypedArray_modern', () => {
	const obj = new Uint8Array([1]);
	const res = new Traverse(obj).clone();

	expect(Array.from(obj)).toEqual(Array.from(res));
	expect(obj).not.toBe(res);

	obj.set([2], 0);
	res.set([3], 0);

	expect(obj).toEqual(new Uint8Array([2]));
	expect(res).toEqual(new Uint8Array([3]));
});

test('reduce', () => {
	const obj = { a: 1, b: 2, c: [3, 4] };
	const res = traverse(obj).reduce(function (acc, x) {
		if (this.isLeaf) {
			acc.push(x);
		}
		return acc;
	}, []);

	expect(obj).toEqual({ a: 1, b: 2, c: [3, 4] });
	expect(res).toEqual([1, 2, 3, 4]);
});

test('reduce_modern', () => {
	const obj = { a: 1, b: 2, c: [3, 4] };
	const res = new Traverse(obj).reduce((ctx, acc, x) => {
		if (ctx.isLeaf) {
			acc.push(x);
		}
		return acc;
	}, []);

	expect(obj).toEqual({ a: 1, b: 2, c: [3, 4] });
	expect(res).toEqual([1, 2, 3, 4]);
});

test('reduceInit', () => {
	const obj = { a: 1, b: 2, c: [3, 4] };
	const res = traverse(obj).reduce(function (acc) {
		if (this.isRoot) {
			assert.fail('got root');
		}
		return acc;
	});
	// t.same(obj, { a: 1, b: 2, c: [3, 4] });
	// t.same(res, obj);
	expect(obj).toEqual({ a: 1, b: 2, c: [3, 4] });
	expect(res).toEqual(obj);
});

test('reduceInit_modern', () => {
	const obj = { a: 1, b: 2, c: [3, 4] };
	const res = new Traverse(obj).reduce((ctx, acc) => {
		if (ctx.isRoot) {
			assert.fail('got root');
		}
		return acc;
	});
	// t.same(obj, { a: 1, b: 2, c: [3, 4] });
	// t.same(res, obj);
	expect(obj).toEqual({ a: 1, b: 2, c: [3, 4] });
	expect(res).toEqual(obj);
});

test('remove', () => {
	const obj = { a: 1, b: 2, c: [3, 4] };
	traverse(obj).forEach(function (x) {
		if (this.isLeaf && x % 2 === 0) {
			this.remove();
		}
	});

	expect(obj).toEqual({ a: 1, c: [3] });
});

test('remove_modern', () => {
	const obj = { a: 1, b: 2, c: [3, 4] };
	new Traverse(obj).forEach((ctx, x) => {
		if (ctx.isLeaf && x % 2 === 0) {
			ctx.remove();
		}
	});

	expect(obj).toEqual({ a: 1, c: [3] });
});

test('removeNoStop', () => {
	const obj = { a: 1, b: 2, c: { d: 3, e: 4 }, f: 5 };

	const keys: (PropertyKey | undefined)[] = [];
	traverse(obj).forEach(function () {
		keys.push(this.key);
		if (this.key === 'c') {
			this.remove();
		}
	});

	expect(keys).toEqual([undefined, 'a', 'b', 'c', 'd', 'e', 'f']);
});

test('removeNoStop_modern', () => {
	const obj = { a: 1, b: 2, c: { d: 3, e: 4 }, f: 5 };

	const keys: (PropertyKey | undefined)[] = [];
	new Traverse(obj).forEach((ctx) => {
		keys.push(ctx.key);
		if (ctx.key === 'c') {
			ctx.remove();
		}
	});

	expect(keys).toEqual([undefined, 'a', 'b', 'c', 'd', 'e', 'f']);
});

test('removeStop', () => {
	const obj = { a: 1, b: 2, c: { d: 3, e: 4 }, f: 5 };

	const keys: (PropertyKey | undefined)[] = [];
	traverse(obj).forEach(function () {
		keys.push(this.key);
		if (this.key === 'c') {
			this.remove(true);
		}
	});

	expect(keys).toEqual([undefined, 'a', 'b', 'c', 'f']);
});

test('removeStop_modern', () => {
	const obj = { a: 1, b: 2, c: { d: 3, e: 4 }, f: 5 };

	const keys: (PropertyKey | undefined)[] = [];
	new Traverse(obj).forEach((ctx) => {
		keys.push(ctx.key);
		if (ctx.key === 'c') {
			ctx.remove(true);
		}
	});

	expect(keys).toEqual([undefined, 'a', 'b', 'c', 'f']);
});

test('removeMap', () => {
	const obj = { a: 1, b: 2, c: [3, 4] };
	const res = traverse(obj).map(function (x) {
		if (this.isLeaf && x % 2 === 0) {
			this.remove();
		}
	});

	expect(obj).toEqual({ a: 1, b: 2, c: [3, 4] });
	expect(res).toEqual({ a: 1, c: [3] });
});

test('removeMap_modern', () => {
	const obj = { a: 1, b: 2, c: [3, 4] };
	const res = new Traverse(obj).map((ctx, x) => {
		if (ctx.isLeaf && x % 2 === 0) {
			ctx.remove();
		}
	});

	expect(obj).toEqual({ a: 1, b: 2, c: [3, 4] });
	expect(res).toEqual({ a: 1, c: [3] });
});

test('delete', () => {
	const obj = { a: 1, b: 2, c: [3, 4] };
	traverse(obj).forEach(function (x) {
		if (this.isLeaf && x % 2 === 0) {
			this.delete();
		}
	});

	expect(obj).toEqual({ a: 1, c: [3, undefined] });

	expect(obj).not.toEqual({ a: 1, c: [3, null] });
});

test('delete_modern', () => {
	const obj = { a: 1, b: 2, c: [3, 4] };
	new Traverse(obj).forEach((ctx, x) => {
		if (ctx.isLeaf && x % 2 === 0) {
			ctx.delete();
		}
	});

	expect(obj).toEqual({ a: 1, c: [3, undefined] });

	expect(obj).not.toEqual({ a: 1, c: [3, null] });
});

test('deleteNoStop', () => {
	const obj = { a: 1, b: 2, c: { d: 3, e: 4 } };

	const keys: (PropertyKey | undefined)[] = [];
	traverse(obj).forEach(function () {
		keys.push(this.key);
		if (this.key === 'c') {
			this.delete();
		}
	});

	expect(keys).toEqual([undefined, 'a', 'b', 'c', 'd', 'e']);
});

test('deleteNoStop_modern', () => {
	const obj = { a: 1, b: 2, c: { d: 3, e: 4 } };

	const keys: (PropertyKey | undefined)[] = [];
	new Traverse(obj).forEach((ctx) => {
		keys.push(ctx.key);
		if (ctx.key === 'c') {
			ctx.delete();
		}
	});

	expect(keys).toEqual([undefined, 'a', 'b', 'c', 'd', 'e']);
});

test('deleteStop', () => {
	const obj = { a: 1, b: 2, c: { d: 3, e: 4 } };

	const keys: (PropertyKey | undefined)[] = [];
	traverse(obj).forEach(function () {
		keys.push(this.key);
		if (this.key === 'c') {
			this.delete(true);
		}
	});

	expect(keys).toEqual([undefined, 'a', 'b', 'c']);
});

test('deleteStop_modern', () => {
	const obj = { a: 1, b: 2, c: { d: 3, e: 4 } };

	const keys: (PropertyKey | undefined)[] = [];
	new Traverse(obj).forEach((ctx) => {
		keys.push(ctx.key);
		if (ctx.key === 'c') {
			ctx.delete(true);
		}
	});

	expect(keys).toEqual([undefined, 'a', 'b', 'c']);
});

test('deleteRedux', () => {
	const obj = { a: 1, b: 2, c: [3, 4, 5] };
	traverse(obj).forEach(function (x) {
		if (this.isLeaf && x % 2 === 0) {
			this.delete();
		}
	});

	expect(obj).toEqual({ a: 1, c: [3, undefined, 5] });
	expect(obj).toEqual({ a: 1, c: [3, , 5] });
	expect(obj).not.toEqual({ a: 1, c: [3, null, 5] });
	expect(obj).not.toEqual({ a: 1, c: [3, 5] });
});

test('deleteRedux_modern', () => {
	const obj = { a: 1, b: 2, c: [3, 4, 5] };
	new Traverse(obj).forEach((ctx, x) => {
		if (ctx.isLeaf && x % 2 === 0) {
			ctx.delete();
		}
	});

	expect(obj).toEqual({ a: 1, c: [3, undefined, 5] });
	expect(obj).toEqual({ a: 1, c: [3, , 5] });
	expect(obj).not.toEqual({ a: 1, c: [3, null, 5] });
	expect(obj).not.toEqual({ a: 1, c: [3, 5] });
});

test('deleteMap', () => {
	const obj = { a: 1, b: 2, c: [3, 4] };
	const res = traverse(obj).map(function (x) {
		if (this.isLeaf && x % 2 === 0) {
			this.delete();
		}
	});

	expect(obj).toEqual({ a: 1, b: 2, c: [3, 4] });

	const xs = [3, 4];
	delete xs[1];

	expect(res).toEqual({ a: 1, c: xs });

	expect(res).toEqual({ a: 1, c: [3, ,] });
	expect(res).toEqual({ a: 1, c: [3, undefined] });
});

test('deleteMap_modern', () => {
	const obj = { a: 1, b: 2, c: [3, 4] };
	const res = new Traverse(obj).map((ctx, x) => {
		if (ctx.isLeaf && x % 2 === 0) {
			ctx.delete();
		}
	});

	expect(obj).toEqual({ a: 1, b: 2, c: [3, 4] });

	const xs = [3, 4];
	delete xs[1];

	expect(res).toEqual({ a: 1, c: xs });

	expect(res).toEqual({ a: 1, c: [3, ,] });
	expect(res).toEqual({ a: 1, c: [3, undefined] });
});

test('deleteMapRedux', () => {
	const obj = { a: 1, b: 2, c: [3, 4, 5] };
	const res = traverse(obj).map(function (x) {
		if (this.isLeaf && x % 2 === 0) {
			this.delete();
		}
	});

	expect(obj).toEqual({ a: 1, b: 2, c: [3, 4, 5] });

	const xs = [3, 4, 5];
	delete xs[1];

	// t.ok(deepEqual(res, { a: 1, c: xs }));
	// t.ok(!deepEqual(res, { a: 1, c: [3, 5] }));
	// t.ok(deepEqual(res, { a: 1, c: [3, , 5] }));
	expect(res).toEqual({ a: 1, c: xs });
	expect(res).toEqual({ a: 1, c: [3, , 5] });
	expect(res).toEqual({ a: 1, c: [3, , 5] });
});

test('deleteMapRedux_modern', () => {
	const obj = { a: 1, b: 2, c: [3, 4, 5] };
	const res = new Traverse(obj).map((ctx, x) => {
		if (ctx.isLeaf && x % 2 === 0) {
			ctx.delete();
		}
	});

	expect(obj).toEqual({ a: 1, b: 2, c: [3, 4, 5] });

	const xs = [3, 4, 5];
	delete xs[1];

	// t.ok(deepEqual(res, { a: 1, c: xs }));
	// t.ok(!deepEqual(res, { a: 1, c: [3, 5] }));
	// t.ok(deepEqual(res, { a: 1, c: [3, , 5] }));
	expect(res).toEqual({ a: 1, c: xs });
	expect(res).toEqual({ a: 1, c: [3, , 5] });
	expect(res).toEqual({ a: 1, c: [3, , 5] });
});

test('objectToString', () => {
	const obj = { a: 1, b: 2, c: [3, 4] };
	const res = traverse(obj).forEach(function (x) {
		if (typeof x === 'object' && !this.isRoot) {
			this.update(JSON.stringify(x));
		}
	});

	expect(obj).toEqual(res);
	expect(obj).toEqual({ a: 1, b: 2, c: '[3,4]' });
});

test('objectToString_modern', () => {
	const obj = { a: 1, b: 2, c: [3, 4] };
	const res = new Traverse(obj).forEach((ctx, x) => {
		if (typeof x === 'object' && !ctx.isRoot) {
			ctx.update(JSON.stringify(x));
		}
	});

	expect(obj).toEqual(res);
	expect(obj).toEqual({ a: 1, b: 2, c: '[3,4]' });
});

test('stringToObject', () => {
	const obj = { a: 1, b: 2, c: '[3,4]' };
	const res = traverse(obj).forEach(function (x) {
		if (typeof x === 'string') {
			this.update(JSON.parse(x));
		} else if (typeof x === 'number' && x % 2 === 0) {
			this.update(x * 10);
		}
	});

	expect(obj).toEqual(res);
	expect(obj).toEqual({ a: 1, b: 20, c: [3, 40] });
});

test('stringToObject_modern', () => {
	const obj = { a: 1, b: 2, c: '[3,4]' };
	const res = new Traverse(obj).forEach((ctx, x) => {
		if (typeof x === 'string') {
			ctx.update(JSON.parse(x));
		} else if (typeof x === 'number' && x % 2 === 0) {
			ctx.update(x * 10);
		}
	});

	expect(obj).toEqual(res);
	expect(obj).toEqual({ a: 1, b: 20, c: [3, 40] });
});

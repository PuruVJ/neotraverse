import assert from 'node:assert';
import { expect, test } from 'vitest';
import { Traverse } from '../src';

test('mutate', function (t) {
	const obj = { a: 1, b: 2, c: [3, 4] };
	const res = new Traverse(obj).forEach(function (x) {
		if (typeof x === 'number' && x % 2 === 0) {
			this.update(x * 10);
		}
	});

	expect(obj).toEqual(res);
	expect(obj).toEqual({ a: 1, b: 20, c: [3, 40] });
});

test('map', function (t) {
	const obj = { a: 1, b: 2, c: [3, 4] };
	const res = new Traverse(obj).map(function (x) {
		if (typeof x === 'number' && x % 2 === 0) {
			this.update(x * 10);
		}
	});

	expect(obj).toEqual({ a: 1, b: 2, c: [3, 4] });
	expect(res).toEqual({ a: 1, b: 20, c: [3, 40] });
});

test('clone', function (t) {
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
test('cloneTypedArray', function (t) {
	const obj = new Uint8Array([1]);
	const res = new Traverse(obj).clone();

	console.log(23, obj, res);

	expect(Array.from(obj)).toEqual(Array.from(res));
	expect(obj).not.toBe(res);

	obj.set([2], 0);
	res.set([3], 0);

	expect(obj).toEqual(new Uint8Array([2]));
	expect(res).toEqual(new Uint8Array([3]));
});

test('reduce', function (t) {
	const obj = { a: 1, b: 2, c: [3, 4] };
	const res = new Traverse(obj).reduce(function (acc, x) {
		if (this.isLeaf) {
			acc.push(x);
		}
		return acc;
	}, []);

	expect(obj).toEqual({ a: 1, b: 2, c: [3, 4] });
	expect(res).toEqual([1, 2, 3, 4]);
});

test('reduceInit', function (t) {
	const obj = { a: 1, b: 2, c: [3, 4] };
	const res = new Traverse(obj).reduce(function (acc) {
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

test('remove', function (t) {
	const obj = { a: 1, b: 2, c: [3, 4] };
	new Traverse(obj).forEach(function (x) {
		if (this.isLeaf && x % 2 === 0) {
			this.remove();
		}
	});

	expect(obj).toEqual({ a: 1, c: [3] });
});

test('removeNoStop', function (t) {
	const obj = { a: 1, b: 2, c: { d: 3, e: 4 }, f: 5 };

	const keys = [];
	new Traverse(obj).forEach(function () {
		keys.push(this.key);
		if (this.key === 'c') {
			this.remove();
		}
	});

	expect(keys).toEqual([undefined, 'a', 'b', 'c', 'd', 'e', 'f']);
});

test('removeStop', function (t) {
	const obj = { a: 1, b: 2, c: { d: 3, e: 4 }, f: 5 };

	const keys = [];
	new Traverse(obj).forEach(function () {
		keys.push(this.key);
		if (this.key === 'c') {
			this.remove(true);
		}
	});

	expect(keys).toEqual([undefined, 'a', 'b', 'c', 'f']);
});

test('removeMap', function (t) {
	const obj = { a: 1, b: 2, c: [3, 4] };
	const res = new Traverse(obj).map(function (x) {
		if (this.isLeaf && x % 2 === 0) {
			this.remove();
		}
	});

	expect(obj).toEqual({ a: 1, b: 2, c: [3, 4] });
	expect(res).toEqual({ a: 1, c: [3] });
});

test('delete', function (t) {
	const obj = { a: 1, b: 2, c: [3, 4] };
	new Traverse(obj).forEach(function (x) {
		if (this.isLeaf && x % 2 === 0) {
			this.delete();
		}
	});

	expect(obj).toEqual({ a: 1, c: [3, undefined] });

	expect(obj).not.toEqual({ a: 1, c: [3, null] });
});

test('deleteNoStop', function (t) {
	const obj = { a: 1, b: 2, c: { d: 3, e: 4 } };

	const keys = [];
	new Traverse(obj).forEach(function () {
		keys.push(this.key);
		if (this.key === 'c') {
			this.delete();
		}
	});

	expect(keys).toEqual([undefined, 'a', 'b', 'c', 'd', 'e']);
});

test('deleteStop', function (t) {
	const obj = { a: 1, b: 2, c: { d: 3, e: 4 } };

	const keys = [];
	new Traverse(obj).forEach(function () {
		keys.push(this.key);
		if (this.key === 'c') {
			this.delete(true);
		}
	});

	expect(keys).toEqual([undefined, 'a', 'b', 'c']);
});

test('deleteRedux', function (t) {
	const obj = { a: 1, b: 2, c: [3, 4, 5] };
	new Traverse(obj).forEach(function (x) {
		if (this.isLeaf && x % 2 === 0) {
			this.delete();
		}
	});

	expect(obj).toEqual({ a: 1, c: [3, undefined, 5] });
	expect(obj).toEqual({ a: 1, c: [3, , 5] });
	expect(obj).not.toEqual({ a: 1, c: [3, null, 5] });
	expect(obj).not.toEqual({ a: 1, c: [3, 5] });
});

test('deleteMap', function (t) {
	const obj = { a: 1, b: 2, c: [3, 4] };
	const res = new Traverse(obj).map(function (x) {
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

test('deleteMapRedux', function (t) {
	const obj = { a: 1, b: 2, c: [3, 4, 5] };
	const res = new Traverse(obj).map(function (x) {
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

test('objectToString', function (t) {
	const obj = { a: 1, b: 2, c: [3, 4] };
	const res = new Traverse(obj).forEach(function (x) {
		if (typeof x === 'object' && !this.isRoot) {
			this.update(JSON.stringify(x));
		}
	});

	expect(obj).toEqual(res);
	expect(obj).toEqual({ a: 1, b: 2, c: '[3,4]' });
});

test('stringToObject', function (t) {
	const obj = { a: 1, b: 2, c: '[3,4]' };
	const res = new Traverse(obj).forEach(function (x) {
		if (typeof x === 'string') {
			this.update(JSON.parse(x));
		} else if (typeof x === 'number' && x % 2 === 0) {
			this.update(x * 10);
		}
	});

	expect(obj).toEqual(res);
	expect(obj).toEqual({ a: 1, b: 20, c: [3, 40] });
});

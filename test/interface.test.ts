import { expect, test } from 'vitest';
import traverse from '../src';
import { Traverse } from '../src/modern';

test('interface map', function (t) {
	const obj = { a: [5, 6, 7], b: { c: [8] } };

	expect(
		traverse(obj)
			.paths()
			.sort()
			.map((path) => path.join('/'))
			.slice(1)
			.join(' '),
	).toBe('a a/0 a/1 a/2 b b/c b/c/0');

	expect(traverse(obj).nodes()).toEqual([
		{ a: [5, 6, 7], b: { c: [8] } },
		[5, 6, 7],
		5,
		6,
		7,
		{ c: [8] },
		[8],
		8,
	]);

	expect(
		traverse(obj).map((node) => {
			if (typeof node === 'number') {
				return node + 1000;
			}
			if (Array.isArray(node)) {
				return node.join(' ');
			}
			return void undefined;
		}),
	).toEqual({ a: '5 6 7', b: { c: '8' } });

	var nodes = 0;
	traverse(obj).forEach(function () {
		nodes += 1;
	});

	expect(nodes).toBe(8);
});

test('interface map_modern', function (t) {
	const obj = { a: [5, 6, 7], b: { c: [8] } };

	expect(
		new Traverse(obj)
			.paths()
			.sort()
			.map((path) => path.join('/'))
			.slice(1)
			.join(' '),
	).toBe('a a/0 a/1 a/2 b b/c b/c/0');

	expect(new Traverse(obj).nodes()).toEqual([
		{ a: [5, 6, 7], b: { c: [8] } },
		[5, 6, 7],
		5,
		6,
		7,
		{ c: [8] },
		[8],
		8,
	]);

	expect(
		new Traverse(obj).map((_, node) => {
			if (typeof node === 'number') {
				return node + 1000;
			}
			if (Array.isArray(node)) {
				return node.join(' ');
			}
			return void undefined;
		}),
	).toEqual({ a: '5 6 7', b: { c: '8' } });

	var nodes = 0;
	new Traverse(obj).forEach(function () {
		nodes += 1;
	});

	expect(nodes).toBe(8);
});

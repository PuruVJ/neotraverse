import { expect, test } from 'vitest';
import traverse from '../src';
import { Traverse } from '../src/modern';

test('dateEach', () => {
	const obj = { x: new Date(), y: 10, z: 5 };

	const counts: Record<string, number> = {};

	traverse(obj).forEach(function (node) {
		const type = (node instanceof Date && 'Date') || typeof node;
		counts[type] = (counts[type] || 0) + 1;
	});

	expect(counts).toEqual({
		object: 1,
		Date: 1,
		number: 2,
	});
});

test('dateEach_modern', () => {
	const obj = { x: new Date(), y: 10, z: 5 };

	const counts: Record<string, number> = {};

	new Traverse(obj).forEach((_, node) => {
		const type = (node instanceof Date && 'Date') || typeof node;
		counts[type] = (counts[type] || 0) + 1;
	});

	expect(counts).toEqual({
		object: 1,
		Date: 1,
		number: 2,
	});
});

test('dateMap', () => {
	const obj = { x: new Date(), y: 10, z: 5 };

	const res = traverse(obj).map(function (node) {
		if (typeof node === 'number') {
			this.update(node + 100);
		}
	});

	expect(obj.x).not.toBe(res.x);
	expect(res).toEqual({
		x: obj.x,
		y: 110,
		z: 105,
	});
});

test('dateMap_modern', () => {
	const obj = { x: new Date(), y: 10, z: 5 };

	const res = new Traverse(obj).map((ctx, node) => {
		if (typeof node === 'number') {
			ctx.update(node + 100);
		}
	});

	expect(obj.x).not.toBe(res.x);
	expect(res).toEqual({
		x: obj.x,
		y: 110,
		z: 105,
	});
});

import { expect, test } from 'vitest';
import { traverse } from '../src';

test('dateEach', function (t) {
	var obj = { x: new Date(), y: 10, z: 5 };

	var counts = {};

	traverse(obj).forEach(function (node) {
		var type = (node instanceof Date && 'Date') || typeof node;
		counts[type] = (counts[type] || 0) + 1;
	});

	expect(counts).toEqual({
		object: 1,
		Date: 1,
		number: 2,
	});
});

test('dateMap', function (t) {
	var obj = { x: new Date(), y: 10, z: 5 };

	var res = traverse(obj).map(function (node) {
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

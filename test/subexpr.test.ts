import { expect, test } from 'vitest';
import { Traverse } from '../src';

test('subexpr', function (t) {
	var obj = ['a', 4, 'b', 5, 'c', 6];
	var r = new Traverse(obj).map(function (x) {
		if (typeof x === 'number') {
			this.update([x - 0.1, x, x + 0.1], true);
		}
	});

	expect(obj).toEqual(['a', 4, 'b', 5, 'c', 6]);
	expect(r).toEqual(['a', [3.9, 4, 4.1], 'b', [4.9, 5, 5.1], 'c', [5.9, 6, 6.1]]);
});

test('block', { skip: true }, function (t) {
	var obj = [[1], [2], [3]];
	var r = new Traverse(obj).map(function (x) {
		if (Array.isArray(x) && !this.isRoot) {
			if (x[0] === 5) {
				this.block();
			} else {
				this.update([[x[0] + 1]]);
			}
		}
	});

	expect(r).toEqual([[[[[5]]]], [[[[5]]]], [[[5]]]]);
});

import { describe, expect, test } from 'vitest';
import { Traverse } from '../src';

describe('negative update test', function (t) {
	var obj = [5, 6, -3, [7, 8, -2, 1], { f: 10, g: -13 }];
	var fixed = new Traverse(obj).map(function (x) {
		if (x < 0) {
			this.update(x + 128);
		}
	});

	test('Negative values += 128', () => {
		expect(fixed).toEqual([5, 6, 125, [7, 8, 126, 1], { f: 10, g: 115 }]);
	});

	test('Original references not modified', () => {
		expect(obj).toEqual([5, 6, -3, [7, 8, -2, 1], { f: 10, g: -13 }]);
	});
});

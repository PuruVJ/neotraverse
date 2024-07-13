import { describe, expect, test } from 'vitest';
import traverse from '../src';
import { Traverse } from '../src/modern';

describe('negative update test', () => {
	const obj = [5, 6, -3, [7, 8, -2, 1], { f: 10, g: -13 }];
	const fixed = traverse(obj).map(function (x) {
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

describe('negative update test_modern', () => {
	const obj = [5, 6, -3, [7, 8, -2, 1], { f: 10, g: -13 }];
	const fixed = new Traverse(obj).map((ctx, x) => {
		if (x < 0) {
			ctx.update(x + 128);
		}
	});

	test('Negative values += 128', () => {
		expect(fixed).toEqual([5, 6, 125, [7, 8, 126, 1], { f: 10, g: 115 }]);
	});

	test('Original references not modified', () => {
		expect(obj).toEqual([5, 6, -3, [7, 8, -2, 1], { f: 10, g: -13 }]);
	});
});

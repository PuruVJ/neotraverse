import { expect, test } from 'vitest';
import traverse from '../src';
import { Traverse } from '../src/modern';

test('subexpr', () => {
	const obj = ['a', 4, 'b', 5, 'c', 6];
	const r = traverse(obj).map(function (x) {
		if (typeof x === 'number') {
			this.update([x - 0.1, x, x + 0.1], true);
		}
	});

	expect(obj).toEqual(['a', 4, 'b', 5, 'c', 6]);
	expect(r).toEqual(['a', [3.9, 4, 4.1], 'b', [4.9, 5, 5.1], 'c', [5.9, 6, 6.1]]);
});

test('block', { skip: true }, () => {
	const obj = [[1], [2], [3]];
	const r = traverse(obj).map(function (x) {
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

test('subexpr_modern', () => {
	const obj = ['a', 4, 'b', 5, 'c', 6];
	const r = new Traverse(obj).map((ctx, x) => {
		if (typeof x === 'number') {
			ctx.update([x - 0.1, x, x + 0.1], true);
		}
	});

	expect(obj).toEqual(['a', 4, 'b', 5, 'c', 6]);
	expect(r).toEqual(['a', [3.9, 4, 4.1], 'b', [4.9, 5, 5.1], 'c', [5.9, 6, 6.1]]);
});

test('block_modern', { skip: true }, () => {
	const obj = [[1], [2], [3]];
	const r = new Traverse(obj).map((ctx, x) => {
		if (Array.isArray(x) && !ctx.isRoot) {
			if (x[0] === 5) {
				ctx.block();
			} else {
				ctx.update([[x[0] + 1]]);
			}
		}
	});

	expect(r).toEqual([[[[[5]]]], [[[[5]]]], [[[5]]]]);
});

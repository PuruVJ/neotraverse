import { expect, test } from 'vitest';
import traverse from '../src';
import { Traverse } from '../src/modern';

test('leaves test', () => {
	const acc: any[] = [];

	traverse({
		a: [1, 2, 3],
		b: 4,
		c: [5, 6],
		d: { e: [7, 8], f: 9 },
	}).forEach(function (x) {
		if (this.isLeaf) {
			acc.push(x);
		}
	});

	expect(acc.join(' ')).toBe('1 2 3 4 5 6 7 8 9');
});

test('leaves test_modern', () => {
	const acc: any[] = [];

	new Traverse({
		a: [1, 2, 3],
		b: 4,
		c: [5, 6],
		d: { e: [7, 8], f: 9 },
	}).forEach((ctx, x) => {
		if (ctx.isLeaf) {
			acc.push(x);
		}
	});

	expect(acc.join(' ')).toBe('1 2 3 4 5 6 7 8 9');
});

import { expect, test } from 'vitest';
import traverse from '../src';
import { Traverse } from '../src/modern';

test('sort test', () => {
	const acc: any[] = [];

	traverse({
		a: 30,
		b: 22,
		id: 9,
	}).forEach(function (node) {
		if (!Array.isArray(node) && typeof node === 'object') {
			this.before(function (beforeNode) {
				this.keys = Object.keys(beforeNode);
				this.keys.sort(function (a, b) {
					const aA = [a === 'id' ? 0 : 1, a];
					const bA = [b === 'id' ? 0 : 1, b];
					return aA < bA ? -1 : aA > bA ? 1 : 0;
				});
			});
		}
		if (this.isLeaf) {
			acc.push(node);
		}
	});

	expect(acc.join(' ')).toBe('9 30 22');
});

test('sort test_modern', () => {
	const acc: any[] = [];

	new Traverse({
		a: 30,
		b: 22,
		id: 9,
	}).forEach((ctx, node) => {
		if (!Array.isArray(node) && typeof node === 'object') {
			ctx.before((ctx_before, beforeNode) => {
				ctx_before.keys = Object.keys(beforeNode);
				ctx_before.keys.sort((a, b) => {
					const a_A = [a === 'id' ? 0 : 1, a];
					const b_A = [b === 'id' ? 0 : 1, b];
					return a_A < b_A ? -1 : a_A > b_A ? 1 : 0;
				});
			});
		}
		if (ctx.isLeaf) {
			acc.push(node);
		}
	});

	expect(acc.join(' ')).toBe('9 30 22');
});

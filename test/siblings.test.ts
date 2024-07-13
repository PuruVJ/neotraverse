import { expect, test } from 'vitest';
import traverse from '../src';
import { Traverse } from '../src/modern';

test('siblings', () => {
	const obj = { a: 1, b: 2, c: [4, 5, 6] };

	const res = traverse(obj).reduce(function (acc) {
		/* eslint no-param-reassign: 0 */
		const p = '/' + this.path.join('/');
		if (this.parent) {
			acc[p] = {
				siblings: this.parent.keys,
				key: this.key,
				index: this.key ? this.parent.keys?.indexOf(this.key) : -1,
			};
		} else {
			acc[p] = {
				siblings: [],
				key: this.key,
				index: -1,
			};
		}
		return acc;
	}, {});

	expect(res).toEqual({
		'/': { siblings: [], key: undefined, index: -1 },
		'/a': { siblings: ['a', 'b', 'c'], key: 'a', index: 0 },
		'/b': { siblings: ['a', 'b', 'c'], key: 'b', index: 1 },
		'/c': { siblings: ['a', 'b', 'c'], key: 'c', index: 2 },
		'/c/0': { siblings: ['0', '1', '2'], key: '0', index: 0 },
		'/c/1': { siblings: ['0', '1', '2'], key: '1', index: 1 },
		'/c/2': { siblings: ['0', '1', '2'], key: '2', index: 2 },
	});
});

test('siblings_modern', () => {
	const obj = { a: 1, b: 2, c: [4, 5, 6] };

	const res = new Traverse(obj).reduce((ctx, acc) => {
		/* eslint no-param-reassign: 0 */
		const p = '/' + ctx.path.join('/');
		if (ctx.parent) {
			acc[p] = {
				siblings: ctx.parent.keys,
				key: ctx.key,
				index: ctx.key ? ctx.parent.keys?.indexOf(ctx.key) : -1,
			};
		} else {
			acc[p] = {
				siblings: [],
				key: ctx.key,
				index: -1,
			};
		}
		return acc;
	}, {});

	expect(res).toEqual({
		'/': { siblings: [], key: undefined, index: -1 },
		'/a': { siblings: ['a', 'b', 'c'], key: 'a', index: 0 },
		'/b': { siblings: ['a', 'b', 'c'], key: 'b', index: 1 },
		'/c': { siblings: ['a', 'b', 'c'], key: 'c', index: 2 },
		'/c/0': { siblings: ['0', '1', '2'], key: '0', index: 0 },
		'/c/1': { siblings: ['0', '1', '2'], key: '1', index: 1 },
		'/c/2': { siblings: ['0', '1', '2'], key: '2', index: 2 },
	});
});

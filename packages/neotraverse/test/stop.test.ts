import { expect, test } from 'vitest';
import traverse from '../src';
import { Traverse } from '../src/modern';

test('stop', () => {
	let visits = 0;
	traverse('abcdefghij'.split('')).forEach(function (node) {
		if (typeof node === 'string') {
			visits += 1;
			if (node === 'e') {
				this.stop();
			}
		}
	});

	expect(visits).toBe(5);
});

test('stop_modern', () => {
	let visits = 0;
	new Traverse('abcdefghij'.split('')).forEach((ctx, node) => {
		if (typeof node === 'string') {
			visits += 1;
			if (node === 'e') {
				ctx.stop();
			}
		}
	});

	expect(visits).toBe(5);
});

test('stopMap', () => {
	const s = traverse('abcdefghij'.split(''))
		.map(function (node) {
			if (typeof node === 'string') {
				if (node === 'e') {
					this.stop();
				}
				return node.toUpperCase();
			}
			return void undefined;
		})
		.join('');

	expect(s).toBe('ABCDEfghij');
});

test('stopMap_modern', () => {
	const s = new Traverse('abcdefghij'.split(''))
		.map((ctx, node) => {
			if (typeof node === 'string') {
				if (node === 'e') {
					ctx.stop();
				}
				return node.toUpperCase();
			}
			return void undefined;
		})
		.join('');

	expect(s).toBe('ABCDEfghij');
});

test('stopReduce', () => {
	const obj = {
		a: [4, 5],
		b: [6, [7, 8, 9]],
	};
	const xs = traverse(obj).reduce(function (acc, node) {
		if (this.isLeaf) {
			if (node === 7) {
				this.stop();
			} else {
				acc.push(node);
			}
		}
		return acc;
	}, []);

	expect(xs).toEqual([4, 5, 6]);
});

test('stopReduce_modern', () => {
	const obj = {
		a: [4, 5],
		b: [6, [7, 8, 9]],
	};
	const xs = new Traverse(obj).reduce((ctx, acc, node) => {
		if (ctx.isLeaf) {
			if (node === 7) {
				ctx.stop();
			} else {
				acc.push(node);
			}
		}
		return acc;
	}, []);

	expect(xs).toEqual([4, 5, 6]);
});

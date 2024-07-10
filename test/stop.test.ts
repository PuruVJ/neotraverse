import { expect, test } from 'vitest';
import { Traverse } from '../src';

test('stop', function (t) {
	let visits = 0;
	new Traverse('abcdefghij'.split('')).forEach(function (node) {
		if (typeof node === 'string') {
			visits += 1;
			if (node === 'e') {
				this.stop();
			}
		}
	});

	expect(visits).toBe(5);
});

test('stopMap', function (t) {
	var s = new Traverse('abcdefghij'.split(''))
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

test('stopReduce', function (t) {
	var obj = {
		a: [4, 5],
		b: [6, [7, 8, 9]],
	};
	var xs = new Traverse(obj).reduce(function (acc, node) {
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

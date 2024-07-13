import { expect, test } from 'vitest';
import traverse from '../src';
import { Traverse } from '../src/modern';

test('stringify', function (t) {
	var obj = [5, 6, -3, [7, 8, -2, 1], { f: 10, g: -13 }];

	var s = '';
	traverse(obj).forEach(function (node) {
		if (Array.isArray(node)) {
			this.before(function () {
				s += '[';
			});
			this.post(function (child) {
				if (!child.isLast) {
					s += ',';
				}
			});
			this.after(function () {
				s += ']';
			});
		} else if (typeof node === 'object') {
			this.before(function () {
				s += '{';
			});
			this.pre(function (x, key) {
				s += '"' + key + '":';
			});
			this.post(function (child) {
				if (!child.isLast) {
					s += ',';
				}
			});
			this.after(function () {
				s += '}';
			});
		} else if (typeof node === 'function') {
			s += 'null';
		} else {
			s += node.toString();
		}
	});

	expect(s).toBe('[5,6,-3,[7,8,-2,1],{"f":10,"g":-13}]');
});

test('stringify_modern', () => {
	const obj = [5, 6, -3, [7, 8, -2, 1], { f: 10, g: -13 }];

	let s = '';
	new Traverse(obj).forEach((ctx, node) => {
		if (Array.isArray(node)) {
			ctx.before(() => {
				s += '[';
			});
			ctx.post((_, child) => {
				if (!child.isLast) {
					s += ',';
				}
			});
			ctx.after(() => {
				s += ']';
			});
		} else if (typeof node === 'object') {
			ctx.before(() => {
				s += '{';
			});
			ctx.pre((_, _x, key) => {
				s += '"' + key + '":';
			});
			ctx.post((_ctx, child) => {
				if (!child.isLast) {
					s += ',';
				}
			});
			ctx.after(() => {
				s += '}';
			});
		} else if (typeof node === 'function') {
			s += 'null';
		} else {
			s += node.toString();
		}
	});

	expect(s).toBe('[5,6,-3,[7,8,-2,1],{"f":10,"g":-13}]');
});

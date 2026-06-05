import { expect, test } from 'vitest';
import traverse from '../src';
import { Traverse } from '../src/modern';

test('json test', () => {
	let id = 54;
	const callbacks: Record<number, { id: number; f: Function; path: PropertyKey[] }> = {};
	const obj = { moo: function () {}, foo: [2, 3, 4, function () {}] };

	const scrubbed = traverse(obj).map(function (x) {
		if (typeof x === 'function') {
			callbacks[id] = { id: id, f: x, path: this.path };
			this.update('[Function]');
			id += 1;
		}
	});

	expect(scrubbed.moo).toBe('[Function]');
	expect(scrubbed.foo[3]).toBe('[Function]');

	expect(scrubbed).toEqual({
		moo: '[Function]',
		foo: [2, 3, 4, '[Function]'],
	});

	expect(typeof obj.moo).toBe('function');
	expect(typeof obj.foo[3]).toBe('function');

	expect(callbacks).toEqual({
		54: { id: 54, f: obj.moo, path: ['moo'] },
		55: { id: 55, f: obj.foo[3], path: ['foo', '3'] },
	});
});

test('json test_modern', () => {
	let id = 54;
	const callbacks: Record<number, { id: number; f: Function; path: PropertyKey[] }> = {};
	const obj = { moo: function () {}, foo: [2, 3, 4, function () {}] };

	const scrubbed = new Traverse(obj).map((ctx, x) => {
		if (typeof x === 'function') {
			callbacks[id] = { id: id, f: x, path: ctx.path };
			ctx.update('[Function]');
			id += 1;
		}
	});

	expect(scrubbed.moo).toBe('[Function]');
	expect(scrubbed.foo[3]).toBe('[Function]');

	expect(scrubbed).toEqual({
		moo: '[Function]',
		foo: [2, 3, 4, '[Function]'],
	});

	expect(typeof obj.moo).toBe('function');
	expect(typeof obj.foo[3]).toBe('function');

	expect(callbacks).toEqual({
		54: { id: 54, f: obj.moo, path: ['moo'] },
		55: { id: 55, f: obj.foo[3], path: ['foo', '3'] },
	});
});

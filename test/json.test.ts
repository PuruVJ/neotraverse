import { expect, test } from 'vitest';
import { Traverse } from '../src';

test('json test', function (t) {
	var id = 54;
	var callbacks = {};
	var obj = { moo: function () {}, foo: [2, 3, 4, function () {}] };

	var scrubbed = new Traverse(obj).map(function (x) {
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

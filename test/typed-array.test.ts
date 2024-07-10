import { expect, test } from 'vitest';
import { traverse } from '../src';

test('traverse an Uint8Array', { skip: typeof Uint8Array !== 'function' }, function (t) {
	var obj = new Uint8Array(4);
	var results = traverse(obj).map(function () {});

	console.log(obj, results);

	expect(results).toEqual(obj);
});

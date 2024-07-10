import { expect, test } from 'vitest';
import { Traverse } from '../src';

test('new Traverse an Uint8Array', { skip: typeof Uint8Array !== 'function' }, function (t) {
	var obj = new Uint8Array(4);
	var results = new Traverse(obj).map(function () {});

	expect(results).toEqual(obj);
});

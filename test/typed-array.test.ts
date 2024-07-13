import { expect, test } from 'vitest';
import traverse from '../src';
import { Traverse } from '../src/modern';

test('new Traverse an Uint8Array', function (t) {
	var obj = new Uint8Array(4);
	var results = traverse(obj).map(function () {});

	expect(results).toEqual(obj);
});

test('new Traverse an Uint8Array_modern', function (t) {
	var obj = new Uint8Array(4);
	var results = new Traverse(obj).map(() => {});

	expect(results).toEqual(obj);
});

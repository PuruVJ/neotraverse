import { expect, test } from 'vitest';
import { Traverse } from '../src';

test('new Traverse an Error', () => {
	var obj = new Error('test');
	var results = new Traverse(obj).map(function () {});
	// t.same(results, { message: 'test' });
	expect(results).toEqual({ message: 'test' });
});

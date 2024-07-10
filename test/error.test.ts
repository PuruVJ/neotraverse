import { expect, test } from 'vitest';
import { traverse } from '../src';

test('traverse an Error', () => {
	var obj = new Error('test');
	var results = traverse(obj).map(function () {});
	// t.same(results, { message: 'test' });
	expect(results).toEqual({ message: 'test' });
});

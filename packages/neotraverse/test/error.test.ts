import { expect, test } from 'vitest';
import traverse from '../src';
import { Traverse } from '../src/modern';

test('error', () => {
	const obj = new Error('test');
	const results = traverse(obj).map(function () {});
	// t.same(results, { message: 'test' });
	expect(results).toEqual({ message: 'test' });
});

test('error_modern', () => {
	const obj = new Error('test');
	const results = new Traverse(obj).map(() => {});
	// t.same(results, { message: 'test' });
	expect(results).toEqual({ message: 'test' });
});

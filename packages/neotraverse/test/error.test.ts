import { expect, test } from 'vite-plus/test';
import traverse from '../src/legacy';
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
	// C-8: the modern build preserves the Error type (instanceof / name / message /
	// stack), rather than degrading it to a plain `{ message }` object.
	expect(results).toBeInstanceOf(Error);
	expect(results.message).toBe('test');
});

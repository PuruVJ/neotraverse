import { expect, test } from 'vitest';
import traverse from '../src';
import { Traverse } from '../src/modern';

test('new Traverse an object with nested functions', () => {
	function Cons(x: number) {
		expect(x).toBe(10);
	}
	// @ts-ignore
	traverse(new Cons(10));
});

test('new Traverse an object with nested functions_modern', () => {
	function Cons(x: number) {
		expect(x).toBe(10);
	}
	// @ts-ignore
	new Traverse(new Cons(10));
});

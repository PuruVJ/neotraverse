import { expect, test } from 'vitest';
import { Traverse } from '../src';

test('new Traverse an object with nested functions', function (t) {
	function Cons(x) {
		expect(x).toBe(10);
	}
	new Traverse(new Cons(10));
});

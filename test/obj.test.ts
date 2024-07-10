import { expect, test } from 'vitest';
import { traverse } from '../src';

test('traverse an object with nested functions', function (t) {
	function Cons(x) {
		expect(x).toBe(10);
	}
	traverse(new Cons(10));
});

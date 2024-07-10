import { describe, expect, test } from 'vitest';
import { Traverse } from '../src';

describe('has', function (t) {
	var obj = { a: 2, b: [4, 5, { c: 6 }] };

	expect(new Traverse(obj).has(['b', 2, 'c'])).toBe(true);
	expect(new Traverse(obj).has(['b', 2, 'c', 0])).toBe(false);
	expect(new Traverse(obj).has(['b', 2, 'd'])).toBe(false);
	expect(new Traverse(obj).has([])).toBe(true);
	expect(new Traverse(obj).has(['a'])).toBe(true);
	expect(new Traverse(obj).has(['a', 2])).toBe(false);

	test('symbols', () => {
		/* eslint no-restricted-properties: 1 */
		const globalSymbol = Symbol.for('d');
		const localSymbol = Symbol('e');

		obj[globalSymbol] = {};
		obj[globalSymbol][localSymbol] = 7;
		obj[localSymbol] = 8;

		expect(new Traverse(obj).has([globalSymbol])).toBe(false);
		expect(new Traverse(obj, { includeSymbols: true }).has([globalSymbol])).toBe(true);

		expect(new Traverse(obj).has([globalSymbol, globalSymbol])).toBe(false);
		expect(new Traverse(obj, { includeSymbols: true }).has([globalSymbol, globalSymbol])).toBe(
			false
		);

		expect(new Traverse(obj).has([globalSymbol, localSymbol])).toBe(false);
		expect(new Traverse(obj, { includeSymbols: true }).has([globalSymbol, localSymbol])).toBe(true);

		expect(new Traverse(obj).has([localSymbol])).toBe(false);
		expect(new Traverse(obj, { includeSymbols: true }).has([localSymbol])).toBe(true);

		expect(new Traverse(obj).has([Symbol('d')])).toBe(false);
		expect(new Traverse(obj, { includeSymbols: true }).has([Symbol('d')])).toBe(false);

		expect(new Traverse(obj).has([Symbol('e')])).toBe(false);
	});
});

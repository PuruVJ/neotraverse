import { describe, expect, test } from 'vitest';
import {
	clone,
	entries,
	filter,
	find,
	forEach,
	map,
	nodes,
	paths,
	reduce,
	some,
	Traverse,
	values,
} from '../src/modern';

const obj = { a: 1, b: { c: 2, d: 3 }, e: 4 };

describe('functional parity vs Traverse class', () => {
	test('forEach mutates in place and returns the same reference', () => {
		const input = structuredClone(obj);
		const viaFn = forEach(input, (ctx, x) => {
			if (typeof x === 'number' && x < 3) ctx.update(x + 10);
		});
		const viaClass = structuredClone(obj);
		const classRet = new Traverse(viaClass).forEach((ctx, x) => {
			if (typeof x === 'number' && x < 3) ctx.update(x + 10);
		});
		expect(viaFn).toBe(input);
		expect(classRet).toBe(viaClass);
		expect(input).toEqual(viaClass);
	});

	test('map is immutable', () => {
		const input = structuredClone(obj);
		const out = map(input, (ctx, x) => {
			if (typeof x === 'number') ctx.update(x * 10);
		});
		const classOut = new Traverse(structuredClone(obj)).map((ctx, x) => {
			if (typeof x === 'number') ctx.update(x * 10);
		});
		expect(out).toEqual(classOut);
		expect(input).toEqual(obj);
	});

	test('reduce seeded and seedless', () => {
		const sum = reduce(
			obj,
			(_, acc, x) => (typeof x === 'number' ? acc + x : acc),
			0,
		);
		expect(sum).toEqual(
			new Traverse(obj).reduce((_, acc, x) => (typeof x === 'number' ? acc + x : acc), 0),
		);

		const seedless = reduce(obj, (_, acc, x) => (typeof x === 'number' ? acc + x : acc));
		expect(seedless).toEqual(
			new Traverse(obj).reduce((_, acc, x) => (typeof x === 'number' ? acc + x : acc)),
		);

		const explicitUndef = reduce(
			obj,
			(_, acc, x) => (typeof x === 'number' ? acc + x : acc),
			undefined,
		);
		expect(explicitUndef).toEqual(
			new Traverse(obj).reduce((_, acc, x) => (typeof x === 'number' ? acc + x : acc), undefined),
		);
	});

	test('find / filter / some / every and early-stop counts', () => {
		expect(find(obj, (_, x) => x === 3)).toBe(new Traverse(obj).find((_, x) => x === 3));
		expect(filter(obj, (ctx) => ctx.isLeaf)).toEqual(new Traverse(obj).filter((ctx) => ctx.isLeaf));

		let fnVisits = 0;
		find(obj, (_, x) => {
			fnVisits++;
			return x === 2;
		});
		let classVisits = 0;
		new Traverse(obj).find((_, x) => {
			classVisits++;
			return x === 2;
		});
		expect(fnVisits).toBe(classVisits);

		expect(some(obj, (_, x) => x === 3)).toBe(new Traverse(obj).some((_, x) => x === 3));
		let someVisits = 0;
		some(obj, (_, x) => {
			someVisits++;
			return x === 1;
		});
		let someClass = 0;
		new Traverse(obj).some((_, x) => {
			someClass++;
			return x === 1;
		});
		expect(someVisits).toBe(someClass);
	});

	test('paths / nodes / clone', () => {
		expect(paths(obj)).toEqual(new Traverse(obj).paths());
		expect(nodes(obj)).toEqual(new Traverse(obj).nodes());
		expect(clone(obj)).toEqual(new Traverse(obj).clone());
	});

	test('entries and values', () => {
		const fnEntries = [...entries(obj)];
		const classEntries = [...new Traverse(obj).entries()];
		expect(fnEntries.map((e) => e[0])).toEqual(classEntries.map((e) => e[0]));
		expect(fnEntries.map((e) => e[1])).toEqual(classEntries.map((e) => e[1]));
		expect([...values(obj)]).toEqual([...new Traverse(obj)]);
	});
});

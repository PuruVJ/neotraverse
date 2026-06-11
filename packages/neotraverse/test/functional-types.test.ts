import { describe, expect, test } from 'vite-plus/test';
import { clone, entries, map, values } from '../src/index';
import { Traverse } from '../src/modern';

describe('functional Map/Set/circular', () => {
	test('clone deep-clones Map/Set', () => {
		const inner = { n: 1 };
		const src = new Map<string, unknown>([
			['k', inner],
			['m', 2],
		]);
		const cloned = clone(src);
		expect(cloned).toBeInstanceOf(Map);
		expect(cloned).not.toBe(src);
		expect(cloned.get('k')).not.toBe(inner);
		expect(cloned).toEqual(new Traverse(src).clone());

		const setCloned = clone(new Set([inner, 2]));
		expect(setCloned).toBeInstanceOf(Set);
		expect([...setCloned][0]).not.toBe(inner);
	});

	test('map shallow-copies Map', () => {
		const inner = { n: 1 };
		const src = new Map([['k', inner]]);
		const mapped = map(src, () => {});
		expect(mapped).not.toBe(src);
		expect(mapped.get('k')).toBe(inner);
		expect(mapped).toEqual(new Traverse(src).map(() => {}));
	});

	test('entries treats Map/Set as leaves; circular visited once', () => {
		expect([...entries(new Map([['k', 1]]))]).toHaveLength(1);
		const o: any = { a: 1 };
		o.self = o;
		expect([...entries(o)]).toHaveLength(3);
		expect([...entries(o)].map((e) => e[1])).toEqual([...values(o)]);
	});
});

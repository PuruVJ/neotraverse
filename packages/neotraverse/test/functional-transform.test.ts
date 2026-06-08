import { describe, expect, test } from 'vitest';
import { deleteWhere, groupBy, prune, pruneDeep, select } from '../src/index';

/**
 * Behavior spec for transform helpers (audit C-3) + select glob semantics.
 * RED until the array-splice fix lands.
 */

describe('deleteWhere / prune on arrays (C-3)', () => {
	test('deleteWhere removes every matching array element (no skipping)', () => {
		expect(deleteWhere([1, 2, 3, 4, 5, 6], (_, x) => typeof x === 'number' && x % 2 === 0)).toEqual([1, 3, 5]);
	});

	test('deleteWhere removing consecutive runs', () => {
		expect(deleteWhere([0, 0, 0, 1], (_, x) => x === 0)).toEqual([1]);
		expect(deleteWhere([1, 0, 0, 0], (_, x) => x === 0)).toEqual([1]);
	});

	test('prune keeps only matching array elements', () => {
		expect(prune([1, 2, 3, 4], (ctx, x) => ctx.isRoot || (typeof x === 'number' && x % 2 === 1))).toEqual([1, 3]);
	});

	test('deleteWhere on nested arrays', () => {
		const out = deleteWhere({ a: [1, 2, 3, 4] }, (_, x) => typeof x === 'number' && x % 2 === 0);
		expect(out).toEqual({ a: [1, 3] });
	});
});

describe('pruneDeep', () => {
	test('replaces nodes deeper than maxDepth', () => {
		expect(pruneDeep({ a: { b: { c: { d: 1 } } } }, 1, '[cut]').a.b).toBe('[cut]');
	});
});

describe('groupBy', () => {
	test('buckets visited values by key', () => {
		const g = groupBy({ a: 1, b: 2, c: 3, d: 4 }, (ctx, v) => (ctx.isLeaf ? (v % 2 ? 'odd' : 'even') : 'branch'));
		expect(g.get('odd')?.sort()).toEqual([1, 3]);
		expect(g.get('even')?.sort()).toEqual([2, 4]);
	});
});

describe('select glob semantics', () => {
	const tree = { a: { b: 1, c: 2 }, list: [{ id: 1 }, { id: 2 }], x: 9 };

	test('"*" matches exactly one level', () => {
		expect(select(tree, 'a.*').map((h) => h.node).sort()).toEqual([1, 2]);
	});

	test('"key[*]" matches array elements under key', () => {
		const hits = select(tree, 'list[*]');
		expect(hits).toHaveLength(2);
		expect(hits.map((h) => h.path)).toEqual([['list', 0], ['list', 1]]);
	});

	test('literal dotted path', () => {
		expect(select(tree, 'a.b').map((h) => h.node)).toEqual([1]);
	});
});

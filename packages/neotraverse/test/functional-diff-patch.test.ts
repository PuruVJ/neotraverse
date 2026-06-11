import { describe, expect, test } from 'vite-plus/test';
import { clone, diff, patch } from '../src/index';

/**
 * Behavior spec for diff/patch. Pins the INTENDED contract (audit C-1, C-5, C-6, S-1).
 * These should be RED until the corresponding fixes land.
 */

const roundTrips = (a: any, b: any) => {
	const ops = diff(a, b);
	const out = patch(clone(a), ops);
	expect(out).toEqual(b);
};

describe('diff/patch — shared references (C-1)', () => {
	test('detects a change under a shared sub-object (DAG), does not treat reuse as a cycle', () => {
		const shared = { v: 1 };
		const a = { x: shared, y: shared };
		const b = { x: { v: 1 }, y: { v: 999 } };
		const ops = diff(a, b);
		// the divergence under /y must be captured
		expect(ops.some((o) => o.path === '/y/v')).toBe(true);
		roundTrips(a, b);
	});

	test('a real cycle is still tolerated (no infinite recursion)', () => {
		const a: any = { n: 1 };
		a.self = a;
		const b: any = { n: 1 };
		b.self = b;
		expect(() => diff(a, b)).not.toThrow();
	});
});

describe('diff/patch — array shrink/grow round-trips (C-5)', () => {
	test('array shrinks by more than one element', () => {
		roundTrips({ y: [1, 2, 3, 4] }, { y: [1, 2] });
		roundTrips({ y: [1, 2, 3, 4, 5] }, { y: [9] });
	});

	test('array grows', () => {
		roundTrips({ y: [1] }, { y: [1, 2, 3] });
	});

	test('array element changes + length change together', () => {
		roundTrips({ y: [1, 2, 3, 4] }, { y: [1, 9] });
	});
});

describe('patch — RFC 6902 array add inserts (C-6)', () => {
	test('add at an in-range index inserts (shifts right), not replaces', () => {
		const out = patch({ arr: [1, 2, 3] }, [{ op: 'add', path: '/arr/1', value: 99 }]);
		expect(out.arr).toEqual([1, 99, 2, 3]);
	});

	test('add at the tail appends', () => {
		const out = patch({ arr: [1, 2] }, [{ op: 'add', path: '/arr/2', value: 3 }]);
		expect(out.arr).toEqual([1, 2, 3]);
	});
});

describe('diff/patch — typed values round-trip', () => {
	test('Date / Map / Set / nested objects', () => {
		roundTrips({ d: new Date(0) }, { d: new Date(1000) });
		roundTrips({ m: new Map([['a', 1]]) }, { m: new Map([['a', 2]]) });
		roundTrips({ s: new Set([1, 2]) }, { s: new Set([1, 2, 3]) });
		roundTrips({ a: { b: { c: 1 } } }, { a: { b: { c: 2 }, d: 3 } });
	});
});

describe('diff — depth bounding for untrusted input (S-1)', () => {
	function deep(n: number): any {
		const root: any = {};
		let cur = root;
		for (let i = 0; i < n; i++) cur = cur.next = {};
		return root;
	}

	test('diff honors maxDepth instead of overflowing the native stack', () => {
		expect(() => diff(deep(5000), deep(5000), { maxDepth: 50 } as any)).toThrow(
			/maximum traversal depth/,
		);
	});
});

import { describe, expect, test } from 'vite-plus/test';
import { dereference } from '../src/index';

/**
 * Behavior spec for dereference (audit C-7, S-2).
 * RED until chained-ref resolution lands.
 */

describe('dereference — local JSON pointers', () => {
	test('resolves a single local $ref', () => {
		const out = dereference({ defs: { Foo: { type: 'string' } }, node: { $ref: '#/defs/Foo' } });
		expect(out.node).toEqual({ type: 'string' });
	});

	test('resolves chained $ref (ref -> ref -> value) (C-7)', () => {
		const out = dereference({
			defs: { A: { $ref: '#/defs/B' }, B: { v: 1 } },
			node: { $ref: '#/defs/A' },
		});
		expect(out.node).toEqual({ v: 1 });
	});

	test('leaves missing local refs unresolved', () => {
		const out = dereference({ node: { $ref: '#/nope' } });
		expect(out.node).toEqual({ $ref: '#/nope' });
	});

	test('leaves external/URL refs unchanged (localOnly default)', () => {
		const out = dereference({ node: { $ref: 'https://example.com/x' } });
		expect(out.node).toEqual({ $ref: 'https://example.com/x' });
	});

	test('a self-referential ref terminates (no infinite expansion)', () => {
		let out: any;
		expect(() => {
			out = dereference({ a: { $ref: '#/a' } });
		}).not.toThrow();
		expect(out.a).toEqual({ $ref: '#/a' });
	});

	test('an object with $ref plus a symbol sibling is not treated as a pure ref', () => {
		const sym = Symbol('s');
		const node: any = { $ref: '#/defs/Foo', [sym]: 1 };
		const out = dereference({ defs: { Foo: { type: 'string' } }, node }, { includeSymbols: true });
		expect(out.node.$ref).toBe('#/defs/Foo');
		expect(out.node[sym]).toBe(1);
	});
});

describe('dereference — depth bounding (S-2)', () => {
	function deep(n: number): any {
		const root: any = {};
		let cur = root;
		for (let i = 0; i < n; i++) cur = cur.next = {};
		return root;
	}
	test('honors maxDepth', () => {
		expect(() => dereference(deep(500), { maxDepth: 50 })).toThrow(/maximum traversal depth/);
	});
});

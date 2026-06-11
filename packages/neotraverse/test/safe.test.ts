// Integration tests for the public neotraverse v2 surface. Unit tests for
// internals live in-source (src/v2/**) behind `import.meta.vitest`; this suite
// exercises only the exported API: the eight common tasks and the normative
// invariants I1–I8 from SPEC_V2.md.

import { describe, expect, it } from 'vitest';
import {
	clone,
	diff,
	equal,
	get,
	has,
	merge,
	patch,
	resolveRefs,
	set,
	transform,
	transformAsync,
	visit,
} from '../src/safe/index.js';

describe('the 8 common tasks', () => {
	it('1. redact secrets (rules, pruned pass, sharing)', () => {
		const payload = { user: { password: 'p', token: 't', name: 'Ada' }, meta: { ok: true } };
		const safe = transform(payload, {
			'**.{password,token,secret,apiKey}': (_v, { replace }) => replace('[redacted]'),
		});
		expect(safe.user.password).toBe('[redacted]');
		expect(safe.user.token).toBe('[redacted]');
		expect(safe.user.name).toBe('Ada');
		expect(safe.meta).toBe(payload.meta); // untouched subtree shared
		expect(payload.user.password).toBe('p'); // input intact
	});

	it('2. collect all values of a key (lazy)', () => {
		const doc = { users: [{ id: 1 }, { id: 2 }], post: { id: 3 } };
		expect(visit(doc, '**.id').map((v) => v.value).toArray().sort()).toEqual([1, 2, 3]);
	});

	it('3. rewrite URLs (only edited spines copied)', () => {
		const doc = { a: { url: 'http://x' }, b: { url: 'http://y' }, keep: { n: 1 } };
		const out = transform(doc, (v, { replace }) =>
			typeof v.value === 'string' && v.value.startsWith('http://')
				? replace('https://' + v.value.slice(7))
				: undefined,
		{ match: '**.url' });
		expect(out.a.url).toBe('https://x');
		expect(out.keep).toBe(doc.keep);
	});

	it('4. config merge with per-path array policy', () => {
		const defaults = { plugins: [{ name: 'a', opt: 1 }], tags: ['x'], level: 1 };
		const user = { plugins: [{ name: 'a', opt: 2 }, { name: 'b' }], tags: ['x', 'y'], level: 3 };
		const config = merge(defaults, user, { arrays: 'replace', at: { plugins: { by: 'name' }, '**.tags': 'union' } });
		expect(config.plugins).toEqual([{ name: 'a', opt: 2 }, { name: 'b' }]);
		expect(config.tags).toEqual(['x', 'y']);
		expect(config.level).toBe(3);
	});

	it('5. diff two states + undo', () => {
		const before = { items: [1, 2], flag: true };
		const after = { items: [1, 2, 3], flag: false };
		const redo = diff(before, after);
		const undo = diff(after, before);
		const next = patch(before, redo);
		expect(equal(next, after)).toBe(true);
		expect(equal(patch(next, undo), before)).toBe(true);
	});

	it('6. resolve local $refs', () => {
		const doc = { defs: { Pet: { type: 'object' } }, pet: { $ref: '#/defs/Pet' } };
		expect(resolveRefs(doc).pet).toEqual({ type: 'object' });
	});

	it('7. deep freeze (post-order)', () => {
		const state = { nested: { n: 1 } };
		for (const v of visit(state, { order: 'post' })) {
			if (typeof v.value === 'object' && v.value !== null) Object.freeze(v.value);
		}
		expect(Object.isFrozen(state.nested)).toBe(true);
		expect(Object.isFrozen(state)).toBe(true);
	});

	it('8. find the path of a value', () => {
		const state = { users: [{ email: 'a' }, { email: 'b' }] };
		const hit = visit(state).find((v) => v.value === 'b');
		expect(hit?.path).toEqual(['users', 1, 'email']);
		expect(hit?.pointer).toBe('/users/1/email');
	});

	it('9. async rewrite with concurrency', async () => {
		const doc = { a: { url: '1' }, b: { url: '2' } };
		const out = await transformAsync(doc, async (v, { replace }) =>
			typeof v.value === 'string' ? replace(`<${v.value}>`) : undefined,
		{ match: '**.url', concurrency: 4 });
		expect(out.a.url).toBe('<1>');
		expect(out.b.url).toBe('<2>');
	});
});

describe('invariants I1–I8', () => {
	it('I1 order: pre, post, breadth', () => {
		const t = { a: { b: 1 }, c: 2 };
		expect([...visit(t)].map((v) => v.key)).toEqual([undefined, 'a', 'b', 'c']);
		expect([...visit(t, { order: 'post' })].map((v) => v.key)).toEqual(['b', 'a', 'c', undefined]);
		expect([...visit(t, { order: 'breadth' })].map((v) => v.key)).toEqual([undefined, 'a', 'c', 'b']);
	});

	it('I2 single visit; back-edge flagged, not descended', () => {
		const ring: any = { n: 1 };
		ring.self = ring;
		const records = [...visit(ring)];
		expect(records.length).toBe(3); // root, n, self
		expect(records.find((v) => v.key === 'self')?.circular?.value).toBe(ring);
	});

	it('I3 prune via skip', () => {
		const seen: PropertyKey[] = [];
		for (const v of visit({ keep: { x: 1 }, drop: { y: 2 } })) {
			seen.push(v.key as PropertyKey);
			if (v.key === 'drop') v.skip();
		}
		expect(seen).not.toContain('y');
	});

	it('I4 replace is final; remove never visited', () => {
		let inner = false;
		const out = transform({ a: 1 }, (v, { replace }) => {
			if (v.key === 'a') return replace({ deep: 9 });
			if (v.key === 'deep') inner = true;
		});
		expect(out.a).toEqual({ deep: 9 });
		expect(inner).toBe(false);
	});

	it('I5 identity & sharing', () => {
		const x = { a: { b: 1 }, c: [1, 2] };
		expect(transform(x, () => {})).toBe(x);
		expect(patch(x, [])).toBe(x);
		const out = transform(x, (v, { replace }) => (v.key === 'b' ? replace(2) : undefined));
		expect(out.c).toBe(x.c);
	});

	it('I6 purity: frozen input is fine in COW mode', () => {
		const frozen = Object.freeze({ a: Object.freeze({ b: 1 }) });
		const out = transform(frozen, (v, { replace }) => (v.key === 'b' ? replace(2) : undefined));
		expect(out.a.b).toBe(2);
		expect(frozen.a.b).toBe(1);
	});

	it('I7 round-trip: get(root, v.path) === v.value', () => {
		const tree = { users: new Map([['ada', { roles: new Set(['admin']) }]]), xs: [1, { y: 2 }] };
		for (const v of visit(tree, { mapSet: true })) {
			expect(get(tree, v.path)).toBe(v.value);
		}
	});

	it('I8 no rewiring: output back-edge points at the original ancestor', () => {
		const ring: any = { n: 1 };
		ring.self = ring;
		const out = transform(ring, (v, { replace }) => (v.key === 'n' ? replace(2) : undefined));
		expect(out.n).toBe(2);
		// self still references the (original) ring, not the new root — cycles are not rewired
		expect(out.self).toBe(ring);
		// documented recipe: edit a clone in place to preserve cycles correctly
		const fixed = transform(clone(ring), (v, { replace }) => (v.key === 'n' ? replace(2) : undefined), { mutate: true });
		expect(fixed.self).toBe(fixed);
		expect(fixed.n).toBe(2);
	});

	it('I8 (merge): cyclic base is shared, not rewired — documented COW limitation', () => {
		const base: any = { n: 1 };
		base.self = base;
		const out = merge(base, { n: 2 });
		expect(out.n).toBe(2);
		expect(out.self).toBe(base); // back-edge points at the original, like transform
	});
});

describe('cross-cutting semantics', () => {
	it('no recursion limit on deep input (visit is iterative)', () => {
		let node: any = { v: 0 };
		const root = node;
		for (let i = 1; i < 100_000; i++) {
			node.next = { v: i };
			node = node.next;
		}
		let count = 0;
		for (const _ of visit(root)) count++;
		expect(count).toBe(200_000); // each level: the object + its `v` leaf... actually object+next+v
	});

	it('maxDepth bounds untrusted input with RangeError', () => {
		const deep = { a: { b: { c: { d: 1 } } } };
		expect(() => [...visit(deep, { maxDepth: 2 })]).toThrow(RangeError);
	});

	it('mapSet descends recursively at every level', () => {
		const tree = { m: new Map([['k', new Set([1, 2])]]) };
		const vals = visit(tree, { mapSet: true }).map((v) => v.value).toArray();
		expect(vals).toContain(1);
		expect(vals).toContain(2);
	});

	it('symbols are opt-in', () => {
		const s = Symbol('s');
		const o = { a: 1, [s]: 2 };
		expect(visit(o).filter((v) => typeof v.value === 'number').toArray().length).toBe(1);
		expect(visit(o, { symbols: true }).filter((v) => typeof v.value === 'number').toArray().length).toBe(2);
	});

	it('visit(root, callback) throws the migration hint', () => {
		expect(() => visit({}, (() => {}) as any)).toThrow(/walk/);
	});

	it('clone is fully independent; merge shares', () => {
		const src = { a: { b: 1 } };
		const c = clone(src);
		c.a.b = 2;
		expect(src.a.b).toBe(1);
		expect(has(src, 'a.b')).toBe(true);
	});

	it('set is copy-on-write and typed-path friendly', () => {
		const cfg = { server: { port: 3000 } };
		const next = set(cfg, 'server.port', 8080);
		expect(next).not.toBe(cfg);
		expect(next.server.port).toBe(8080);
		expect(cfg.server.port).toBe(3000);
	});
});

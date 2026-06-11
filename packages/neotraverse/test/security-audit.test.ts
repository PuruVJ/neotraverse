import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, test } from 'vite-plus/test';
import { clone, deepEqual, dereference, diff, map, merge, sanitize, set } from '../src/index';

/**
 * Regression tests for the security audit findings. These pin attacker-reachable
 * behavior (prototype pollution, DoS via recursion/complexity, type confusion,
 * immutability isolation) and must NEVER regress — they gate the GitHub CI.
 */

const PROBE = ['p', 'polluted', 'x', 'isAdmin'] as const;
const protoClean = () => PROBE.every((k) => (Object.prototype as any)[k] === undefined);
afterEach(() => {
	for (const k of PROBE) delete (Object.prototype as any)[k];
});

describe('A1 — non-string/boxed key cannot bypass the pollution guard', () => {
	test('boxed String("__proto__") does not hijack the target prototype or pollute globally', () => {
		const a: any = {};
		set(a, [new String('__proto__') as any], { polluted: 'yes' });
		expect((a as any).polluted).toBeUndefined();
		expect(Object.getPrototypeOf(a)).toBe(Object.prototype);
		expect(protoClean()).toBe(true);
	});

	test('{toString:()=>"__proto__"} key is neutralized', () => {
		const b: any = {};
		set(b, [{ toString: () => '__proto__' } as any], { polluted: 'yes' });
		expect((b as any).polluted).toBeUndefined();
		expect(protoClean()).toBe(true);
	});

	test('boxed key cannot reach global Object.prototype even with an own __proto__ slot', () => {
		const o: any = {};
		Object.defineProperty(o, '__proto__', {
			value: Object.prototype,
			enumerable: true,
			writable: true,
			configurable: true,
		});
		set(o, [new String('__proto__') as any, 'polluted'], 'yes');
		expect(({} as any).polluted).toBeUndefined();
		expect(protoClean()).toBe(true);
	});

	test('a toString that toggles its return (TOCTOU) is coerced once', () => {
		let n = 0;
		const o: any = {};
		set(o, [{ toString: () => (n++ === 0 ? 'safe' : '__proto__') } as any], { p: 1 });
		expect(({} as any).p).toBeUndefined();
		expect(Object.keys(o)).toEqual(['safe']);
		expect(protoClean()).toBe(true);
	});

	test('legitimate writes still work', () => {
		const o: any = {};
		set(o, ['a', 'b'], 1);
		expect(o).toEqual({ a: { b: 1 } });
	});
});

describe('B — DoS bounding (recursion / complexity)', () => {
	test('B1: dereference resolves a long $ref chain without overflowing the stack', () => {
		const defs: any = {};
		for (let i = 0; i < 60000; i++) defs['r' + i] = { $ref: '#/defs/r' + (i + 1) };
		defs.r60000 = { v: 1 };
		const out = dereference({ defs, node: { $ref: '#/defs/r0' } });
		expect(out.node).toEqual({ v: 1 });
	});

	test('B2: diff is not exponential on shared-subtree (DAG) inputs', () => {
		const dag = (d: number) => {
			let n: any = { v: 0 };
			for (let i = 0; i < d; i++) n = { l: n, r: n };
			return n;
		};
		const start = performance.now();
		const ops = diff(dag(30), dag(30)); // equal DAGs → no ops; 2^30 without memoization
		expect(ops).toEqual([]);
		expect(performance.now() - start).toBeLessThan(1000);
	});

	test('B5: merge of a cyclic source terminates (intrinsic cycle guard)', () => {
		const a: any = { n: 1 };
		a.self = a;
		const b: any = { n: 2 };
		b.self = b;
		expect(() => merge(a, b)).not.toThrow();
	});

	test('B6: deepEqual of large primitive Sets is fast (O(n), not O(n^2))', () => {
		const a = new Set(Array.from({ length: 50000 }, (_, i) => i));
		const b = new Set(Array.from({ length: 50000 }, (_, i) => i));
		const start = performance.now();
		expect(deepEqual(a, b)).toBe(true);
		expect(performance.now() - start).toBeLessThan(500);
		// still correct for object-element sets (structural path)
		expect(deepEqual(new Set([{ x: 1 }]), new Set([{ x: 1 }]))).toBe(true);
		expect(deepEqual(new Set([1, 2]), new Set([1, 3]))).toBe(false);
	});
});

describe('C — type confusion / spoofing is contained', () => {
	test('C1: a Symbol.toStringTag "RegExp" spoof with an invalid source does not crash clone', () => {
		const evil: any = { [Symbol.toStringTag]: 'RegExp', source: '(', flags: '', data: 1 };
		let c: any;
		expect(() => {
			c = clone(evil);
		}).not.toThrow();
		expect(c.data).toBe(1);
	});

	test('C2: a boxed-primitive spoof is cloned by value, not returned by reference', () => {
		const evil: any = { [Symbol.toStringTag]: 'String', data: 1 };
		const c = clone(evil);
		expect(c).not.toBe(evil);
		c.data = 999;
		expect(evil.data).toBe(1);
	});

	test('C3: cross-realm Map/Set are cloned (no silent entry loss)', () => {
		const realmMap = runInNewContext('new Map([["a",1],["b",2]])');
		const realmSet = runInNewContext('new Set([1,2,3])');
		const c = clone({ mp: realmMap, st: realmSet });
		expect(c.mp.size).toBe(2);
		expect(c.mp.get('a')).toBe(1);
		expect(c.st.size).toBe(3);
	});

	test('C3: cross-realm DataView clones without crashing', () => {
		const dv = runInNewContext('new DataView(new Uint8Array([1,2,3]).buffer)');
		let c: any;
		expect(() => {
			c = clone({ d: dv });
		}).not.toThrow();
		expect(c.d.byteLength).toBe(3);
		expect(c.d.getUint8(0)).toBe(1);
	});
});

describe('D — immutability isolation', () => {
	test('D1: map()+stop() does not leak input references to unvisited siblings', () => {
		const input = [{ a: 1 }, { b: 2 }, { c: 3 }];
		const out = map(input, (ctx) => {
			if (ctx.key === 0) ctx.stop();
		});
		expect(out[1]).not.toBe(input[1]);
		expect(out[2]).not.toBe(input[2]);
		expect(out).toEqual(input);
	});

	test('D2: clone() deep-clones Error.cause (no aliasing)', () => {
		const cause = { x: 1 };
		const c: any = clone(new Error('boom', { cause }));
		expect(c.cause).not.toBe(cause);
		expect(c.cause).toEqual({ x: 1 });
	});
});

describe('sanitize — strips pollution keys at the trust boundary', () => {
	test('removes own __proto__/constructor/prototype keys at every level', () => {
		const dirty = JSON.parse(
			'{"user":"bob","__proto__":{"isAdmin":true},"nested":{"constructor":{"prototype":{"x":1}}},"keep":1}',
		);
		const clean: any = sanitize(dirty);
		expect(clean.user).toBe('bob');
		expect(clean.keep).toBe(1);
		expect(Object.prototype.hasOwnProperty.call(clean, '__proto__')).toBe(false);
		expect(Object.prototype.hasOwnProperty.call(clean.nested, 'constructor')).toBe(false);
		expect(clean.nested).toEqual({});
	});

	test('the cleaned object is safe to feed to a naive deep-merge', () => {
		const naiveMerge = (t: any, s: any) => {
			for (const k of Object.keys(s)) {
				if (s[k] && typeof s[k] === 'object') naiveMerge((t[k] ??= {}), s[k]);
				else t[k] = s[k];
			}
			return t;
		};
		const dirty = JSON.parse('{"__proto__":{"polluted":"yes"}}');
		naiveMerge({}, sanitize(dirty));
		expect(({} as any).polluted).toBeUndefined();
	});

	test('returns a deep, independent clone (does not mutate input)', () => {
		const input = { a: { b: 1 } };
		const out: any = sanitize(input);
		expect(out).toEqual({ a: { b: 1 } });
		out.a.b = 999;
		expect(input.a.b).toBe(1);
	});
});

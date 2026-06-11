import { afterEach, describe, expect, test } from 'vite-plus/test';
import traverse from '../src/legacy';
import { Traverse } from '../src/modern';

/**
 * Security regression suite. These tests lock the hardening added for:
 *  - prototype POLLUTION (global Object.prototype) via `set`
 *  - prototype INJECTION (localized) via `clone`/`map`/`forEach` of untrusted JSON
 *  - the confirmed-safe behaviors (`get`/`has` never walk the prototype chain)
 *  - DoS bounding via the `maxDepth` option
 *  - resilience to boxed primitives / Symbol.toStringTag spoofing
 *
 * They must NEVER regress. The existing test/* suite is the frozen behavioral
 * spec; this file only ADDS coverage and is run by the same `pnpm test`.
 */

// Probe keys an attacker would try to plant on Object.prototype.
const PROBE_KEYS = ['polluted', 'isAdmin', 'pp', 'x', 'y'] as const;

function protoIsClean(): boolean {
	const proto = Object.prototype as any;
	return PROBE_KEYS.every((k) => proto[k] === undefined) && ({} as any).polluted === undefined;
}

afterEach(() => {
	// Defensive cleanup so a hypothetical failure can't contaminate other tests.
	for (const k of PROBE_KEYS) delete (Object.prototype as any)[k];
});

// Uniform adapter over both public builds (default `this`-bound + modern `ctx`-arg).
const apis = [
	{ name: 'default', make: (obj: any, opts?: any) => traverse(obj, opts) },
	{ name: 'modern', make: (obj: any, opts?: any) => new Traverse(obj, opts) },
] as const;

describe.each(apis)('[$name] global prototype-pollution prevention via set()', ({ make }) => {
	test('set(["__proto__", k]) does not pollute Object.prototype', () => {
		make({}).set(['__proto__', 'polluted'], 'yes');
		expect(({} as any).polluted).toBeUndefined();
		expect(protoIsClean()).toBe(true);
	});

	test('set(["constructor","prototype",k]) gadget on object with own constructor is neutralized', () => {
		make({ constructor: Object }).set(['constructor', 'prototype', 'polluted'], 'yes');
		expect(({} as any).polluted).toBeUndefined();
		expect(protoIsClean()).toBe(true);
	});

	test('two-call constructor gadget is neutralized', () => {
		const o: any = {};
		make(o).set(['constructor'], Object); // no-op: dangerous key
		make(o).set(['constructor', 'prototype', 'pp'], 'yes'); // no-op: dangerous key
		expect(({} as any).pp).toBeUndefined();
		expect(protoIsClean()).toBe(true);
	});

	test('dangerous keys anywhere in the path neutralize the whole set (no mutation)', () => {
		const o: any = { a: {} };
		make(o).set(['a', '__proto__', 'polluted'], 'yes');
		expect(({} as any).polluted).toBeUndefined();
		// nothing was written
		expect(o.a.polluted).toBeUndefined();
		expect(protoIsClean()).toBe(true);
	});

	test('safe paths still work (set is not over-blocked)', () => {
		const o: any = {};
		make(o).set(['a', 'b'], 1);
		expect(o).toEqual({ a: { b: 1 } });
	});
});

describe.each(apis)(
	'[$name] prototype-injection prevention (clone/map/forEach of untrusted JSON)',
	({ make }) => {
		const payload = () => JSON.parse('{"user":"bob","__proto__":{"isAdmin":true}}');

		test('clone() neutralizes injected __proto__ but preserves data', () => {
			const c = make(payload()).clone();
			// no global pollution
			expect(({} as any).isAdmin).toBeUndefined();
			// the clone does NOT inherit attacker data
			expect((c as any).isAdmin).toBeUndefined();
			expect(Object.getPrototypeOf(c)).toBe(Object.prototype);
			// legit data preserved
			expect(c.user).toBe('bob');
			// the injected value is kept as an inert OWN data key, not as the prototype
			expect(Object.prototype.hasOwnProperty.call(c, '__proto__')).toBe(true);
			expect(protoIsClean()).toBe(true);
		});

		test('map() neutralizes injected __proto__', () => {
			const m = make(payload()).map(() => {});
			expect(({} as any).isAdmin).toBeUndefined();
			expect((m as any).isAdmin).toBeUndefined();
			expect(Object.getPrototypeOf(m)).toBe(Object.prototype);
			expect(m.user).toBe('bob');
			expect(protoIsClean()).toBe(true);
		});

		test('forEach() traversal of injected JSON does not pollute', () => {
			make(payload()).forEach(() => {});
			expect(({} as any).isAdmin).toBeUndefined();
			expect(protoIsClean()).toBe(true);
		});

		test('nested injected __proto__ stays localized', () => {
			make(JSON.parse('{"a":{"__proto__":{"polluted":"yes"}}}')).clone();
			expect(({} as any).polluted).toBeUndefined();
			expect(protoIsClean()).toBe(true);
		});
	},
);

// The update() write-sink uses safe_set; assert it cannot hijack a prototype.
describe('update() write-sink does not pollute (per-build)', () => {
	test('default: this.update on a __proto__ node stays localized', () => {
		traverse(JSON.parse('{"__proto__":{"a":1}}')).forEach(function () {
			if (this.key === '__proto__') this.update({ y: 2 });
		});
		expect(({} as any).y).toBeUndefined();
		expect(protoIsClean()).toBe(true);
	});

	test('modern: ctx.update on a __proto__ node stays localized', () => {
		new Traverse(JSON.parse('{"__proto__":{"a":1}}')).forEach((ctx) => {
			if (ctx.key === '__proto__') ctx.update({ y: 2 });
		});
		expect(({} as any).y).toBeUndefined();
		expect(protoIsClean()).toBe(true);
	});
});

describe.each(apis)(
	'[$name] prototype PRESERVATION is intact (fix did not over-reach)',
	({ make }) => {
		class Foo {
			greet() {
				return 'hi';
			}
		}

		test('clone() keeps the real prototype / instanceof', () => {
			const c = make(new Foo()).clone();
			expect(c instanceof Foo).toBe(true);
			expect(c.greet()).toBe('hi');
		});

		test('map() keeps the real prototype / instanceof', () => {
			const m = make(new Foo()).map(() => {});
			expect(m instanceof Foo).toBe(true);
		});
	},
);

describe.each(apis)('[$name] get()/has() never walk the prototype chain', ({ make }) => {
	test('get() does not read inherited properties', () => {
		const obj = Object.create({ secret: 1 });
		expect(make(obj).get(['secret'])).toBeUndefined();
	});

	test('has() returns false for inherited / gadget keys', () => {
		const obj = { a: 1 };
		expect(make(obj).has(['constructor'])).toBe(false);
		expect(make(obj).has(['__proto__'])).toBe(false);
		expect(make(obj).has(['toString'])).toBe(false);
		expect(make(obj).has(['a'])).toBe(true);
	});

	test('get() returns undefined for gadget keys', () => {
		expect(make({}).get(['__proto__'])).toBeUndefined();
		expect(make({}).get(['constructor'])).toBeUndefined();
	});
});

describe.each(apis)('[$name] DoS bounding via maxDepth', ({ make }) => {
	function deep(n: number): any {
		const root: any = {};
		let cur = root;
		for (let i = 0; i < n; i++) cur = cur.next = {};
		return root;
	}

	test('clone() throws a descriptive RangeError past maxDepth', () => {
		expect(() => make(deep(500), { maxDepth: 50 }).clone()).toThrow(/maximum traversal depth/);
	});

	test('forEach() throws past maxDepth', () => {
		expect(() => make(deep(500), { maxDepth: 50 }).forEach(() => {})).toThrow(
			/maximum traversal depth/,
		);
	});

	test('map() throws past maxDepth', () => {
		expect(() => make(deep(500), { maxDepth: 50 }).map(() => {})).toThrow(
			/maximum traversal depth/,
		);
	});

	test('within the limit there is no throw', () => {
		expect(() => make(deep(10), { maxDepth: 1000 }).clone()).not.toThrow();
	});
});

describe.each(apis)('[$name] resilience to hostile inputs', ({ make }) => {
	test('clone() of a boxed primitive does not throw', () => {
		const c = make({ s: Object('ab') }).clone();
		expect(String(c.s)).toBe('ab');
	});

	test('Symbol.toStringTag spoof falls through to generic copy (no data loss / no Invalid Date)', () => {
		const spoof: any = { [Symbol.toStringTag]: 'Date', realData: 'x', nested: { a: 1 } };
		const c = make(spoof).clone();
		expect(c.realData).toBe('x');
		expect(c.nested).toEqual({ a: 1 });
	});
});

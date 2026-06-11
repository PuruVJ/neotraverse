// Type-level tests for the v2 type system. Run with `vitest typecheck`.
// These assert the hardest signatures behave: template-literal Get<T,P>,
// SetValue<T,P> with the autovivify fallback, and the layered Merge overloads.

import { assertType, describe, expectTypeOf, it } from 'vite-plus/test';
import { get, type Get, merge, type Merge, type SetValue, set, visit } from '../src/safe/index.js';

interface Config {
	server: { port: number; host: string; tls?: { cert: string } };
	plugins: { name: string; opts: Record<string, unknown> }[];
	flags: boolean[];
}

const cfg = {} as Config;

describe('Get<T, P> — dot strings', () => {
	it('resolves nested literal paths', () => {
		expectTypeOf<Get<Config, 'server.port'>>().toEqualTypeOf<number>();
		expectTypeOf<Get<Config, 'server.host'>>().toEqualTypeOf<string>();
	});
	it('indexes arrays with a numeric segment (element type, like TS arr[0])', () => {
		expectTypeOf<Get<Config, 'plugins.0.name'>>().toEqualTypeOf<string>();
		expectTypeOf<Get<Config, 'flags.0'>>().toEqualTypeOf<boolean>();
	});
	it('resolves JSON Pointer strings', () => {
		expectTypeOf<Get<Config, '/server/port'>>().toEqualTypeOf<number>();
	});
	it('bails to unknown for a dynamic string path', () => {
		expectTypeOf<Get<Config, string>>().toEqualTypeOf<unknown>();
	});
});

describe('get() runtime signature carries the types', () => {
	it('infers the value type from a literal path', () => {
		assertType<number>(get(cfg, 'server.port'));
		assertType<string>(get(cfg, 'plugins.0.name'));
	});
	it('widens with a fallback', () => {
		const v = get(cfg, 'server.host', 0 as const);
		expectTypeOf(v).toEqualTypeOf<string | 0>();
	});
	it('dynamic path is unknown', () => {
		const dyn: string = 'server.port';
		expectTypeOf(get(cfg, dyn)).toEqualTypeOf<unknown>();
	});
});

describe('SetValue<T, P> — typed writes with autovivify', () => {
	it('constrains a statically-known slot', () => {
		expectTypeOf<SetValue<Config, 'server.port'>>().toEqualTypeOf<number>();
	});
	it('loosens to unknown when autovivifying a new path', () => {
		// `tls` is optional, so the slot is string | undefined (still constrained)
		expectTypeOf<SetValue<Config, 'server.tls.cert'>>().toEqualTypeOf<string | undefined>();
		// a path entirely absent in the type is loose
		expectTypeOf<SetValue<Config, 'server.brandNew'>>().toEqualTypeOf<unknown>();
	});
	it('set rejects a mistyped value', () => {
		// @ts-expect-error string is not assignable to number
		set(cfg, 'server.port', 'nope');
		// ok
		set(cfg, 'server.port', 8080);
	});
});

describe('Merge<A, B> — default-strategy overload', () => {
	it('unions keys, recurses overlaps', () => {
		type A = { a: number; nested: { x: number } };
		type B = { b: string; nested: { y: number } };
		type R = Merge<A, B>;
		expectTypeOf<R['a']>().toEqualTypeOf<number>();
		expectTypeOf<R['b']>().toEqualTypeOf<string>();
		expectTypeOf<R['nested']>().toEqualTypeOf<{ x: number; y: number }>();
	});
	it('DeepPartial overlay returns T', () => {
		const base = { a: 1, nested: { x: 1, y: 2 } };
		const out = merge(base, { nested: { x: 9 } });
		expectTypeOf(out).toEqualTypeOf<{ a: number; nested: { x: number; y: number } }>();
	});
});

describe('visit yields Visit<unknown>', () => {
	it('value is unknown by default', () => {
		for (const v of visit(cfg)) {
			expectTypeOf(v.value).toEqualTypeOf<unknown>();
			expectTypeOf(v.depth).toEqualTypeOf<number>();
			expectTypeOf(v.path).toEqualTypeOf<PropertyKey[]>();
		}
	});
});

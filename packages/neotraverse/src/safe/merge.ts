// Deep merge that SHARES wholly-kept branches with its inputs (no defensive
// deep clones) and returns the base by identity when the overlay changes
// nothing. Plain objects and Maps merge by key; arrays follow a configurable
// strategy, optionally overridden per-path via `at` using the pattern language.
// `clone(merge(a, b))` for full independence; `{ mutate: true }` merges into base.

import { has_own, type KeyOptions, safe_set, shallow_shell, type_tag } from './kernel/keys.js';
import { compile_pattern, type Matcher, type MatchStates } from './kernel/pattern.js';
import { equal } from './equal.js';

export type ArrayStrategy =
	| 'replace'
	| 'concat'
	| 'union'
	| { by: string | ((item: unknown) => unknown) }
	| ((a: readonly unknown[], b: readonly unknown[], path: PropertyKey[]) => unknown[]);

export interface MergeOptions extends KeyOptions {
	/** How to combine two arrays at the same path. @default 'replace' (overlay wins). */
	arrays?: ArrayStrategy;
	/** Per-pattern array-strategy overrides, using the same glob language. */
	at?: Record<string, ArrayStrategy>;
	/** Merge into `base` in place instead of copy-on-write. @default false. */
	mutate?: boolean;
}

export type DeepPartial<T> = T extends readonly unknown[]
	? T
	: T extends object
		? { [K in keyof T]?: DeepPartial<T[K]> }
		: T;

export type Merge<A, B> = B extends readonly unknown[]
	? B
	: A extends readonly unknown[]
		? B
		: A extends object
			? B extends object
				? {
						[K in keyof A | keyof B]: K extends keyof B
							? K extends keyof A
								? Merge<A[K], B[K]>
								: B[K]
							: K extends keyof A
								? A[K]
								: never;
					}
				: B
			: B;

const object_keys = Object.keys;
const get_symbols = Object.getOwnPropertySymbols;
const is_enumerable = Object.prototype.propertyIsEnumerable;

function own_keys(obj: object, symbols: boolean): PropertyKey[] {
	const keys: PropertyKey[] = object_keys(obj);
	if (symbols) {
		const syms = get_symbols(obj);
		for (let i = 0; i < syms.length; i++) {
			if (is_enumerable.call(obj, syms[i])) keys.push(syms[i]);
		}
	}
	return keys;
}

interface MergeCtx {
	defaultArrays: ArrayStrategy;
	atEntries: Array<{ matcher: Matcher; strategy: ArrayStrategy }>;
	symbols: boolean;
	mutate: boolean;
	seen: WeakSet<object>;
}

function mergeable(t: ReturnType<typeof type_tag>): boolean {
	return t === 'object' || t === 'array' || t === 'map';
}

function resolve_strategy(ctx: MergeCtx, states: MatchStates[]): ArrayStrategy {
	for (let i = 0; i < ctx.atEntries.length; i++) {
		if (ctx.atEntries[i].matcher.accepts(states[i])) return ctx.atEntries[i].strategy;
	}
	return ctx.defaultArrays;
}

function merge_arrays(base: any[], overlay: any[], strat: ArrayStrategy, path: PropertyKey[], ctx: MergeCtx, states: MatchStates[]): any[] {
	if (typeof strat === 'function') return strat(base, overlay, path);
	if (strat === 'replace') return overlay;
	if (strat === 'concat') return base.concat(overlay);
	if (strat === 'union') {
		const out = base.slice();
		for (const el of overlay) {
			let dup = false;
			for (let i = 0; i < out.length; i++) {
				if (equal(out[i], el)) {
					dup = true;
					break;
				}
			}
			if (!dup) out.push(el);
		}
		return out;
	}
	// { by }
	const by = strat.by;
	const keyFn = typeof by === 'function' ? by : (x: any) => (x == null ? undefined : x[by]);
	const out = base.slice();
	const indexByKey = new Map<unknown, number>();
	for (let i = 0; i < out.length; i++) indexByKey.set(keyFn(out[i]), i);
	for (const el of overlay) {
		const k = keyFn(el);
		const at = indexByKey.get(k);
		if (at !== undefined) {
			out[at] = merge_pair(out[at], el, path.concat((out[at] as any)?.length ?? at), ctx, states);
		} else {
			indexByKey.set(k, out.length);
			out.push(el);
		}
	}
	return out;
}

function child_states(ctx: MergeCtx, states: MatchStates[], key: PropertyKey): MatchStates[] {
	if (ctx.atEntries.length === 0) return states;
	const next: MatchStates[] = new Array(ctx.atEntries.length);
	for (let i = 0; i < ctx.atEntries.length; i++) next[i] = ctx.atEntries[i].matcher.step(states[i], key);
	return next;
}

function merge_pair(base: any, overlay: any, path: PropertyKey[], ctx: MergeCtx, states: MatchStates[]): any {
	if (overlay === undefined) return base; // overlay absent — keep base (shared)
	const ot = type_tag(overlay);
	const bt = type_tag(base);
	if (!mergeable(ot) || !mergeable(bt) || ot !== bt) return overlay; // type mismatch / leaf — overlay wins
	if (ctx.seen.has(overlay)) return overlay; // cyclic overlay — take by reference at the back-edge
	ctx.seen.add(overlay);
	let result: any;

	if (ot === 'array') {
		const strat = resolve_strategy(ctx, states);
		result = merge_arrays(base, overlay, strat, path, ctx, child_states(ctx, states, 0));
		if (ctx.mutate) {
			base.length = 0;
			for (let i = 0; i < result.length; i++) base.push(result[i]);
			result = base;
		}
	} else if (ot === 'map') {
		const out: Map<any, any> = ctx.mutate ? base : new Map(base);
		let changed = ctx.mutate;
		for (const [k, ov] of overlay as Map<any, any>) {
			const cs = child_states(ctx, states, k);
			if (out.has(k)) {
				const merged = merge_pair(out.get(k), ov, path.concat(k), ctx, cs);
				if (merged !== out.get(k)) changed = true;
				out.set(k, merged);
			} else {
				out.set(k, ov);
				changed = true;
			}
		}
		result = changed ? out : base;
	} else {
		// plain object
		const okeys = own_keys(overlay, ctx.symbols);
		const out = ctx.mutate ? base : shallow_shell(base, ctx.symbols);
		let changed = ctx.mutate;
		for (let i = 0; i < okeys.length; i++) {
			const k = okeys[i];
			const ov = (overlay as any)[k];
			const cs = child_states(ctx, states, k);
			if (has_own.call(base, k)) {
				const merged = merge_pair((base as any)[k], ov, path.concat(k), ctx, cs);
				if (merged !== (base as any)[k]) changed = true;
				safe_set(out, k, merged);
			} else {
				safe_set(out, k, ov);
				changed = true;
			}
		}
		result = changed ? out : base;
	}

	ctx.seen.delete(overlay);
	return result;
}

export function merge<T>(base: T, overlay: DeepPartial<T>, options?: MergeOptions): T;
export function merge<A, B>(
	base: A,
	overlay: B,
	options?: { arrays?: 'replace'; symbols?: boolean; maxDepth?: number },
): Merge<A, B>;
export function merge(base: unknown, overlay: unknown, options?: MergeOptions): unknown;
export function merge(base: any, overlay: any, options: MergeOptions = {}): any {
	const atEntries = options.at
		? Object.keys(options.at).map((pat) => ({ matcher: compile_pattern(pat), strategy: options.at![pat] }))
		: [];
	const ctx: MergeCtx = {
		defaultArrays: options.arrays ?? 'replace',
		atEntries,
		symbols: !!options.symbols,
		mutate: !!options.mutate,
		seen: new WeakSet(),
	};
	const states = atEntries.map((e) => e.matcher.initial);
	return merge_pair(base, overlay, [], ctx, states);
}

// ---------------------------------------------------------------------------
// In-source unit tests.
// ---------------------------------------------------------------------------
if (import.meta.vitest) {
	const { describe, it, expect } = import.meta.vitest;

	describe('merge: basics & sharing', () => {
		it('deep-merges objects, source wins leaves', () => {
			expect(merge({ x: 1, nested: { a: 1 } }, { y: 2, nested: { b: 2 } })).toEqual({
				x: 1,
				y: 2,
				nested: { a: 1, b: 2 },
			});
		});
		it('shares untouched base branches', () => {
			const base = { keep: { deep: 1 }, edit: { a: 1 } };
			const out = merge(base, { edit: { b: 2 } });
			expect(out.keep).toBe(base.keep);
		});
		it('does not mutate inputs by default', () => {
			const base = { nested: { a: 1 } };
			merge(base, { nested: { b: 2 } });
			expect(base).toEqual({ nested: { a: 1 } });
		});
	});

	describe('merge: array strategies', () => {
		it('replace (default) takes the overlay array', () => {
			expect(merge({ xs: [1, 2, 3] }, { xs: [9] }).xs).toEqual([9]);
		});
		it('concat appends', () => {
			expect(merge({ xs: [1] }, { xs: [2] }, { arrays: 'concat' }).xs).toEqual([1, 2]);
		});
		it('union dedupes via equal', () => {
			expect(merge({ xs: [1, 2] }, { xs: [2, 3] }, { arrays: 'union' }).xs).toEqual([1, 2, 3]);
		});
		it('by-key upserts and deep-merges matches', () => {
			const out = merge(
				{ plugins: [{ name: 'a', opt: 1 }, { name: 'b' }] },
				{ plugins: [{ name: 'a', opt: 2 }, { name: 'c' }] },
				{ arrays: { by: 'name' } },
			);
			expect(out.plugins).toEqual([{ name: 'a', opt: 2 }, { name: 'b' }, { name: 'c' }]);
		});
	});

	describe('merge: per-path `at`', () => {
		it('applies different strategies by pattern', () => {
			const out = merge(
				{ plugins: [{ name: 'a' }], tags: ['x'], other: [1] },
				{ plugins: [{ name: 'b' }], tags: ['x', 'y'], other: [2] },
				{ arrays: 'replace', at: { plugins: { by: 'name' }, tags: 'union' } },
			);
			expect(out.plugins).toEqual([{ name: 'a' }, { name: 'b' }]);
			expect(out.tags).toEqual(['x', 'y']);
			expect(out.other).toEqual([2]); // default replace
		});
	});

	describe('merge: mutate mode', () => {
		it('merges into base in place', () => {
			const base: any = { nested: { a: 1 } };
			const out = merge(base, { nested: { b: 2 } }, { mutate: true });
			expect(out).toBe(base);
			expect(base.nested).toEqual({ a: 1, b: 2 });
		});
	});
}

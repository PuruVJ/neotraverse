// Async twin of transform(). Same copy-on-write contract and command protocol,
// but visitors may be async and sibling batches run with bounded concurrency.
// Accepts an AbortSignal — the ONLY signal-taking export, since a signal cannot
// fire during synchronous traversal. Kept in its own module so sync users never
// bundle it. Recursion here unwinds across every `await`, so it does not
// accumulate synchronous call-stack frames on deep input.

import { assert_depth, type KeyOptions, list_keys } from './kernel/keys.js';
import { compile_pattern, type Matcher, type MatchStates } from './kernel/pattern.js';
import {
	_apply_edits as apply_edits,
	_as_command as as_command,
	_COMMAND as COMMAND,
	_CompiledRule as CompiledRule,
	_edit as edit,
	_normalize as normalize,
	_REMOVED as REMOVED,
	type Command,
	type Edits,
	type Visitor,
} from './transform.js';
import { Visit } from './visit.js';

export type AsyncVisitor<V = unknown> = (
	v: Visit<V>,
	edit: Edits,
) => Command | undefined | void | Promise<Command | undefined | void>;
export type AsyncRules = Record<string, AsyncVisitor>;

export interface TransformAsyncOptions extends KeyOptions {
	order?: 'pre' | 'post';
	match?: string;
	mutate?: boolean;
	/** Reject with the signal's reason at the next visited node. */
	signal?: AbortSignal;
	/** Max parallel sibling visits. @default 1 */
	concurrency?: number;
}

interface Ctx {
	symbols: boolean;
	mapSet: boolean;
	maxDepth: number | undefined;
	mutate: boolean;
	post: boolean;
	signal: AbortSignal | undefined;
	concurrency: number;
	fns: Visitor[] | null;
	rules: CompiledRule[] | null;
	matchMatcher: Matcher | undefined;
	stopped: boolean;
	session: { cursor: undefined; post: boolean; current: undefined };
}

interface FoldResult {
	value: any;
	changed: boolean;
	removed: boolean;
}

async function dispatch(
	ctx: Ctx,
	value: any,
	key: PropertyKey | undefined,
	parentVisit: Visit | undefined,
	depth: number,
	isLeaf: boolean,
	circular: Visit | undefined,
	states: MatchStates[] | null,
	matched: boolean,
): Promise<{ cmd: Command | undefined; lastVisit: Visit }> {
	let current = value;
	let replaced = false;
	let descend = false;
	let lastVisit = new Visit(ctx.session as any, current, key, parentVisit, depth, isLeaf, circular);

	const runOne = async (fn: Visitor): Promise<Command | undefined | 0> => {
		lastVisit = new Visit(ctx.session as any, current, key, parentVisit, depth, isLeaf, circular);
		const cmd = as_command(await fn(lastVisit, edit as Edits));
		if (cmd === undefined) return 0;
		const t = (cmd as any)[COMMAND];
		if (t === 'replace') {
			current = (cmd as any).value;
			replaced = true;
			descend = (cmd as any).descend;
			return 0;
		}
		return cmd;
	};

	if (ctx.rules !== null) {
		for (let i = 0; i < ctx.rules.length; i++) {
			if (!ctx.rules[i].matcher.accepts(states![i])) continue;
			const out = await runOne(ctx.rules[i].fn);
			if (out !== 0) return { cmd: out, lastVisit };
		}
	} else if (ctx.matchMatcher === undefined || matched) {
		for (let i = 0; i < ctx.fns!.length; i++) {
			const out = await runOne(ctx.fns![i]);
			if (out !== 0) return { cmd: out, lastVisit };
		}
	}

	if (replaced) return { cmd: descend ? edit.replace(current, { descend: true }) : edit.replace(current), lastVisit };
	return { cmd: undefined, lastVisit };
}

async function fold(
	ctx: Ctx,
	node: any,
	key: PropertyKey | undefined,
	parentVisit: Visit | undefined,
	depth: number,
	ancestors: Map<object, true>,
	states: MatchStates[] | null,
	matchStates: MatchStates,
): Promise<FoldResult> {
	ctx.signal?.throwIfAborted();
	assert_depth(depth, ctx.maxDepth);

	const isObj = typeof node === 'object' && node !== null;
	let circularHit = false;
	let circularVisit: Visit | undefined = undefined;
	if (isObj && ancestors.has(node)) {
		circularHit = true;
		// Resolve the ancestor's Visit so v.circular matches the sync engine (parity).
		for (let p = parentVisit; p !== undefined; p = p.parent) {
			if (p.value === node) {
				circularVisit = p;
				break;
			}
		}
	}

	let keys = isObj && !circularHit ? list_keys(node, ctx.symbols, ctx.mapSet) : null;
	const isLeaf = keys === null || keys.length === 0;
	const matched = ctx.matchMatcher === undefined ? true : ctx.matchMatcher.accepts(matchStates);
	const viable = ctx.matchMatcher === undefined ? true : ctx.matchMatcher.viable(matchStates);

	// rules pruning
	let anyRuleViable = true;
	if (ctx.rules !== null && states !== null) {
		anyRuleViable = false;
		for (let i = 0; i < ctx.rules.length; i++) if (ctx.rules[i].matcher.viable(states[i])) anyRuleViable = true;
	}

	let base = node;
	let result = node;
	let changed = false;
	let removed = false;
	let ownVisit = new Visit(ctx.session as any, node, key, parentVisit, depth, isLeaf, circularVisit);

	// pre-order visitor
	if (!ctx.post && !ctx.stopped && (ctx.matchMatcher === undefined || true)) {
		const { cmd, lastVisit } = await dispatch(ctx, node, key, parentVisit, depth, isLeaf, circularVisit, states, matched);
		ownVisit = lastVisit;
		if (cmd !== undefined) {
			const t = (cmd as any)[COMMAND];
			if (t === 'replace') {
				changed = true;
				if ((cmd as any).descend) {
					base = (cmd as any).value;
					// descend into the replacement's children
					keys = typeof base === 'object' && base !== null ? list_keys(base, ctx.symbols, ctx.mapSet) : null;
				} else {
					return { value: (cmd as any).value, changed: true, removed: false };
				}
			} else if (t === 'remove') {
				return { value: undefined, changed: true, removed: true };
			} else if (t === 'skip') {
				return { value: node, changed: false, removed: false };
			} else {
				ctx.stopped = true;
				return { value: node, changed: false, removed: false };
			}
		}
	}

	// prune: nothing below can match
	if ((ctx.matchMatcher !== undefined && !viable) || (ctx.rules !== null && !anyRuleViable)) {
		keys = null;
	}

	// descend
	if (keys !== null && !ctx.stopped && !circularHit) {
		const baseIsObj = typeof base === 'object' && base !== null;
		if (baseIsObj) ancestors.set(base, true);
		const edits = new Map<PropertyKey, any>();
		const tag = ctx.mapSet && base instanceof Map ? 'map' : ctx.mapSet && base instanceof Set ? 'set' : '';

		const childList: Array<{ k: PropertyKey; child: any }> = [];
		if (tag === 'map') {
			for (const [k, val] of base as Map<any, any>) childList.push({ k, child: val });
		} else if (tag === 'set') {
			let i = 0;
			for (const val of base as Set<any>) childList.push({ k: i++, child: val });
		} else {
			for (let i = 0; i < keys.length; i++) childList.push({ k: keys[i], child: (base as any)[keys[i]] });
		}

		const limit = ctx.concurrency;
		for (let start = 0; start < childList.length; start += limit) {
			if (ctx.stopped) break;
			const batch = childList.slice(start, start + limit);
			const results = await Promise.all(
				batch.map((c) => {
					const childStates =
						ctx.rules !== null && states !== null
							? states.map((s, i) => ctx.rules![i].matcher.step(s, c.k))
							: null;
					const childMatch =
						ctx.matchMatcher !== undefined ? ctx.matchMatcher.step(matchStates, c.k) : 0;
					return fold(ctx, c.child, c.k, ownVisit, depth + 1, ancestors, childStates, childMatch);
				}),
			);
			for (let i = 0; i < results.length; i++) {
				const r = results[i];
				if (r.removed) {
					edits.set(batch[i].k, REMOVED);
					changed = true;
				} else if (r.changed) {
					edits.set(batch[i].k, r.value);
					changed = true;
				}
			}
		}
		if (baseIsObj) ancestors.delete(base);

		if (edits.size > 0) result = apply_edits(base, edits, ctx.mutate, ctx.symbols);
		else result = base;
	} else {
		result = base;
	}

	// post-order visitor sees the folded value
	if (ctx.post && !ctx.stopped) {
		const { cmd } = await dispatch(ctx, result, key, parentVisit, depth, isLeaf, circularVisit, states, matched);
		if (cmd !== undefined) {
			const t = (cmd as any)[COMMAND];
			if (t === 'replace') {
				result = (cmd as any).value;
				changed = true;
			} else if (t === 'remove') {
				return { value: undefined, changed: true, removed: true };
			} else if (t === 'stop') {
				ctx.stopped = true;
			}
		}
	}

	return { value: result, changed, removed };
}

/**
 * Async copy-on-write transform. Visitors may be async; `concurrency` bounds
 * parallel sibling visits; `signal` cancels at the next node.
 */
export function transformAsync<T>(
	root: T,
	visitor: AsyncVisitor | readonly AsyncVisitor[] | AsyncRules,
	options?: TransformAsyncOptions,
): Promise<T>;
export async function transformAsync(
	root: any,
	visitor: AsyncVisitor | readonly AsyncVisitor[] | AsyncRules,
	options: TransformAsyncOptions = {},
): Promise<any> {
	const { fns, rules } = normalize(visitor as any);
	if (rules !== null && options.match !== undefined) {
		throw new TypeError('neotraverse: the Rules form carries its own patterns; do not also pass options.match');
	}
	const matchMatcher = rules === null && options.match !== undefined ? compile_pattern(options.match) : undefined;
	const ctx: Ctx = {
		symbols: !!options.symbols,
		mapSet: !!options.mapSet,
		maxDepth: options.maxDepth,
		mutate: !!options.mutate,
		post: options.order === 'post',
		signal: options.signal,
		concurrency: typeof options.concurrency === 'number' && options.concurrency >= 1 ? Math.floor(options.concurrency) : 1,
		fns,
		rules,
		matchMatcher,
		stopped: false,
		session: { cursor: undefined, post: options.order === 'post', current: undefined },
	};
	const states = rules !== null ? rules.map((r) => r.matcher.initial) : null;
	const matchStates: MatchStates = matchMatcher !== undefined ? matchMatcher.initial : 0;
	const r = await fold(ctx, root, undefined, undefined, 0, new Map(), states, matchStates);
	return r.removed ? undefined : r.value;
}

// ---------------------------------------------------------------------------
// In-source unit tests.
// ---------------------------------------------------------------------------
if (import.meta.vitest) {
	const { describe, it, expect } = import.meta.vitest;

	describe('transformAsync', () => {
		it('awaits async visitors and shares untouched subtrees', async () => {
			const x = { keep: { a: 1 }, n: 5 };
			const out = await transformAsync(x, async (v, { replace }) => {
				if (v.key === 'n') return replace((v.value as number) * 2);
			});
			expect(out.n).toBe(10);
			expect(out.keep).toBe(x.keep);
		});
		it('no-op returns input by identity', async () => {
			const x = { a: { b: 1 } };
			expect(await transformAsync(x, async () => {})).toBe(x);
		});
		it('runs sibling batches with concurrency', async () => {
			const order: number[] = [];
			const out = await transformAsync(
				{ xs: [1, 2, 3, 4] },
				async (v, { replace }) => {
					if (typeof v.value === 'number') {
						await Promise.resolve();
						order.push(v.value);
						return replace(v.value * 10);
					}
				},
				{ concurrency: 2 },
			);
			expect(out.xs).toEqual([10, 20, 30, 40]);
		});
		it('aborts with the signal reason', async () => {
			const ac = new AbortController();
			ac.abort(new Error('stop now'));
			await expect(transformAsync({ a: 1 }, async () => {}, { signal: ac.signal })).rejects.toThrow('stop now');
		});
		it('sets Visit.circular on a back-edge, matching sync (regression)', async () => {
			const cyc: any = { n: 1 };
			cyc.self = cyc;
			let circ: any;
			await transformAsync(cyc, async (v) => {
				if (v.key === 'self') circ = v.circular;
			});
			expect(circ).toBeDefined();
			expect(circ.value).toBe(cyc);
		});

		it('rules form works async', async () => {
			const out = await transformAsync(
				{ user: { password: 'x' } },
				{ '**.password': async (_v, { replace }) => replace('***') },
			);
			expect(out.user.password).toBe('***');
		});
	});
}

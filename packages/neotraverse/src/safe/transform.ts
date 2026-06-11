// The WRITE primitive. `transform()` rewrites a tree copy-on-write: it walks the
// original, and only where an edit lands does it materialize one shallow shell
// per ancestor on the edited path — untouched subtrees are shared with the
// input by reference, and a no-op transform returns the input itself. The
// visitor expresses edits by returning branded Commands from the `edit` factory
// (its second argument); returning a bare value is a loud TypeError.
//
// One engine, three driver shapes: a single visitor, an array pipeline, or a
// Record of pattern→rule fused into one descent-pruned pass.

import { Cursor, ENTER } from './kernel/cursor.js';
import {
	is_array,
	type KeyOptions,
	safe_set,
	shallow_shell,
	type_tag,
} from './kernel/keys.js';
import { compile_pattern, type Matcher, type MatchStates } from './kernel/pattern.js';
import { makeVisit, type Visit } from './visit.js';

// --- command protocol --------------------------------------------------------

const COMMAND = Symbol('neotraverse.command');

/** Opaque edit/control instruction produced by the {@link Edits} factory. */
export interface Command {
	readonly [COMMAND]: 'replace' | 'remove' | 'skip' | 'stop';
}
interface ReplaceCommand extends Command {
	readonly value: any;
	readonly descend: boolean;
}

const REMOVE: Command = { [COMMAND]: 'remove' };
const SKIP: Command = { [COMMAND]: 'skip' };
const STOP: Command = { [COMMAND]: 'stop' };

/**
 * The visitor's second argument: a stateless, `this`-free factory so it can be
 * destructured (`(v, { replace, remove }) => ...`).
 */
export interface Edits {
	/** Substitute `value`. Final by default; `{ descend: true }` recurses into the replacement's children. */
	replace(value: any, opts?: { descend?: boolean }): Command;
	/** Delete this entry from its parent (arrays splice, never holes). */
	remove(): Command;
	/** Keep the value but do not descend. */
	skip(): Command;
	/** End the whole pass; edits already made still fold up. */
	stop(): Command;
}

const edit: Edits = {
	replace: (value, opts) => ({ [COMMAND]: 'replace', value, descend: !!(opts && opts.descend) } as ReplaceCommand),
	remove: () => REMOVE,
	skip: () => SKIP,
	stop: () => STOP,
};

export type Visitor<V = unknown> = (v: Visit<V>, edit: Edits) => Command | undefined | void;
export type Rules = Record<string, Visitor>;

export interface TransformOptions extends KeyOptions {
	/** Visitor order. @default 'pre'. No 'breadth' — BFS rewrites are incoherent. */
	order?: 'pre' | 'post';
	/** Glob pattern scoping a function/array visitor; a TypeError with the Rules form. */
	match?: string;
	/** Edit the input in place instead of copy-on-write. @default false. */
	mutate?: boolean;
}

function as_command(ret: unknown): Command | undefined {
	if (ret == null) return undefined;
	if (typeof ret === 'object' && (COMMAND as any) in (ret as object)) return ret as Command;
	throw new TypeError('neotraverse: visitor returned a non-command value; did you mean edit.replace(...)?');
}

// --- per-frame fold state (stashed on frame.tx) ------------------------------

const REMOVED = Symbol('removed');

interface TState {
	/** child key → new value | REMOVED; null until a child reports a change. */
	edits: Map<PropertyKey, any> | null;
	/** this node's result differs from the original. */
	dirty: boolean;
	/** this node should be deleted from its parent. */
	removed: boolean;
	/** result is set directly (final replace) — no child fold. */
	final: boolean;
	/** the value to shell from (original node, or a descend-replacement). */
	base: any;
	/** the folded value, valid at EXIT. */
	result: any;
	/** rules only: live pattern states per rule. */
	states: MatchStates[] | null;
}

interface CompiledRule {
	matcher: Matcher;
	fn: Visitor;
}

// Session shape shared with visit.ts's makeVisit (skip() is never called here).
interface Session {
	cursor: Cursor | undefined;
	post: boolean;
	current: Visit | undefined;
}

// Apply a frame's collected child edits to its base, producing the folded node.
// Shares untouched children by reference; in mutate mode edits the base in place.
function apply_edits(base: any, edits: Map<PropertyKey, any>, mutate: boolean, symbols: boolean): any {
	const tag = type_tag(base);
	if (tag === 'array') {
		const out: any[] = [];
		const len = base.length;
		for (let i = 0; i < len; i++) {
			if (edits.has(i)) {
				const e = edits.get(i);
				if (e !== REMOVED) out.push(e);
			} else {
				out.push(base[i]);
			}
		}
		if (mutate) {
			base.length = 0;
			for (let i = 0; i < out.length; i++) base.push(out[i]);
			// extra (non-index) own keys edited in place
			for (const [k, v] of edits) {
				if (typeof k === 'number') continue;
				if (v === REMOVED) delete (base as any)[k];
				else (base as any)[k] = v;
			}
			return base;
		}
		// COW: carry over every non-index own key (e.g. `arr.meta`), applying any
		// edit to it — unedited extras must survive an element removal too (bug: lost before).
		const xkeys: PropertyKey[] = symbols
			? (Object.keys(base) as PropertyKey[]).concat(Object.getOwnPropertySymbols(base))
			: (Object.keys(base) as PropertyKey[]);
		for (let j = 0; j < xkeys.length; j++) {
			const k = xkeys[j];
			if (typeof k === 'string' && '' + +k === k && +k < len) continue; // a real index, already placed
			if (edits.has(k)) {
				const e = edits.get(k);
				if (e !== REMOVED) (out as any)[k] = e;
			} else {
				(out as any)[k] = (base as any)[k];
			}
		}
		return out;
	}
	if (tag === 'map') {
		const out: Map<any, any> = mutate ? base : new Map(base);
		for (const [k, v] of edits) {
			if (v === REMOVED) out.delete(k);
			else out.set(k, v);
		}
		return out;
	}
	if (tag === 'set') {
		const arr = [...base];
		const out: any[] = [];
		for (let i = 0; i < arr.length; i++) {
			if (edits.has(i)) {
				const e = edits.get(i);
				if (e !== REMOVED) out.push(e);
			} else {
				out.push(arr[i]);
			}
		}
		if (mutate) {
			base.clear();
			for (let i = 0; i < out.length; i++) base.add(out[i]);
			return base;
		}
		return new Set(out);
	}
	// plain object (and exotic key-bearing types)
	const out = mutate ? base : shallow_shell(base, symbols);
	for (const [k, v] of edits) {
		if (v === REMOVED) delete out[k];
		else safe_set(out, k, v);
	}
	return out;
}

function compute_fold(tx: TState, mutate: boolean, symbols: boolean): any {
	if (tx.final) return tx.result;
	if (tx.edits === null) return tx.base; // unchanged (or replacement with no child edits) — shared
	return apply_edits(tx.base, tx.edits, mutate, symbols);
}

// Run the applicable visitor(s) at one node, threading the value through a
// replace so later visitors see it. Returns a single synthesized command.
function dispatch(
	session: Session,
	f: any,
	baseValue: any,
	fns: Visitor[] | null,
	rules: CompiledRule[] | null,
	matchScoped: boolean,
): Command | undefined {
	let current = baseValue;
	let replaced = false;
	let descend = false;

	const runOne = (fn: Visitor): Command | undefined | 0 => {
		const v = makeVisit(session, f, current);
		const cmd = as_command(fn(v, edit));
		if (cmd === undefined) return 0;
		const t = cmd[COMMAND];
		if (t === 'replace') {
			current = (cmd as ReplaceCommand).value;
			replaced = true;
			descend = (cmd as ReplaceCommand).descend;
			return 0;
		}
		return cmd; // remove / skip / stop short-circuit the chain at this node
	};

	if (rules !== null) {
		const states = (f.tx as TState).states!;
		for (let i = 0; i < rules.length; i++) {
			if (!rules[i].matcher.accepts(states[i])) continue;
			const out = runOne(rules[i].fn);
			if (out !== 0) return out;
		}
	} else if (!matchScoped || f.matched) {
		for (let i = 0; i < fns!.length; i++) {
			const out = runOne(fns![i]);
			if (out !== 0) return out;
		}
	}

	if (replaced) return descend ? edit.replace(current, { descend: true }) : edit.replace(current);
	return undefined;
}

function run(root: any, fns: Visitor[] | null, rules: CompiledRule[] | null, options: TransformOptions): any {
	const symbols = !!options.symbols;
	const mapSet = !!options.mapSet;
	const mutate = !!options.mutate;
	const post = options.order === 'post';
	const matchScoped = rules === null && options.match !== undefined;

	const cursor = new Cursor(root, {
		symbols,
		mapSet,
		maxDepth: options.maxDepth,
		match: rules === null ? options.match : undefined,
	});
	const session: Session = { cursor, post, current: undefined };
	let stopped = false;
	let rootResult = root;

	while (cursor.step()) {
		const f = cursor.frame;

		if (cursor.phase === ENTER) {
			const tx: TState = { edits: null, dirty: false, removed: false, final: false, base: f.node, result: f.node, states: null };
			f.tx = tx;

			if (rules !== null) {
				const states: MatchStates[] = new Array(rules.length);
				const parentStates = f.parent ? (f.parent.tx as TState).states : null;
				let anyViable = false;
				for (let i = 0; i < rules.length; i++) {
					const m = rules[i].matcher;
					states[i] = f.parent ? m.step(parentStates![i], f.key as PropertyKey) : m.initial;
					if (m.viable(states[i])) anyViable = true;
				}
				tx.states = states;
				if (!anyViable) cursor.skip(); // prune: no rule can match in this subtree
			}

			if (stopped) {
				cursor.skip();
				continue;
			}
			if (post) {
				makeVisit(session, f, f.node); // linkage only; visitor runs at EXIT
				continue;
			}

			const cmd = dispatch(session, f, f.node, fns, rules, matchScoped);
			if (cmd !== undefined) {
				const t = cmd[COMMAND];
				if (t === 'replace') {
					const rc = cmd as ReplaceCommand;
					tx.dirty = true;
					if (rc.descend) {
						tx.base = rc.value;
						cursor.replaceCurrent(rc.value);
					} else {
						tx.final = true;
						tx.result = rc.value;
						cursor.skip();
					}
				} else if (t === 'remove') {
					tx.removed = true;
					tx.dirty = true;
					cursor.skip();
				} else if (t === 'skip') {
					cursor.skip();
				} else {
					// stop
					cursor.skip();
					stopped = true;
				}
			}
		} else {
			// EXIT — fold this frame, optionally run the post-order visitor, propagate up.
			const tx = f.tx as TState;
			let folded = compute_fold(tx, mutate, symbols);

			if (post && !stopped && !tx.removed && !tx.final) {
				const cmd = dispatch(session, f, folded, fns, rules, matchScoped);
				if (cmd !== undefined) {
					const t = cmd[COMMAND];
					if (t === 'replace') {
						folded = (cmd as ReplaceCommand).value;
						tx.dirty = true;
					} else if (t === 'remove') {
						tx.removed = true;
						tx.dirty = true;
					} else if (t === 'stop') {
						stopped = true;
					}
					// skip: no-op in post (children already visited)
				}
			}

			tx.result = tx.removed ? undefined : folded;

			if (f.parent) {
				if (tx.dirty || tx.removed) {
					const ptx = f.parent.tx as TState;
					(ptx.edits ??= new Map()).set(f.key as PropertyKey, tx.removed ? REMOVED : tx.result);
					ptx.dirty = true;
				}
			} else {
				rootResult = tx.removed ? undefined : tx.result;
			}
		}
	}

	return rootResult;
}

function normalize(visitor: Visitor | readonly Visitor[] | Rules): {
	fns: Visitor[] | null;
	rules: CompiledRule[] | null;
} {
	if (typeof visitor === 'function') return { fns: [visitor], rules: null };
	if (is_array(visitor)) return { fns: visitor as Visitor[], rules: null };
	const rules: CompiledRule[] = [];
	for (const key of Object.keys(visitor)) {
		rules.push({ matcher: compile_pattern(key), fn: (visitor as Rules)[key] });
	}
	return { fns: null, rules };
}

/**
 * Rewrite `root` copy-on-write. Untouched subtrees are shared with the input,
 * and `transform(x, () => {}) === x`. Pass a single visitor, an array pipeline,
 * or a Record of pattern→rule.
 *
 * @example
 * ```js
 * transform(payload, (v, { replace }) => v.key === 'password' ? replace('***') : undefined);
 * transform(doc, { '**.url': (v, { replace }) => replace(secure(v.value)) });
 * ```
 */
export function transform<T>(root: T, visitor: Visitor | readonly Visitor[] | Rules, options?: TransformOptions): T;
export function transform(root: any, visitor: Visitor | readonly Visitor[] | Rules, options: TransformOptions = {}): any {
	const { fns, rules } = normalize(visitor);
	if (rules !== null && options.match !== undefined) {
		throw new TypeError('neotraverse: the Rules form carries its own patterns; do not also pass options.match');
	}
	if (options.order === ('breadth' as any)) {
		throw new TypeError("neotraverse: transform supports order 'pre' | 'post' only (no breadth rewrites)");
	}
	return run(root, fns, rules, options);
}

// Shared internals for the async twin (not part of the public surface).
export {
	apply_edits as _apply_edits,
	as_command as _as_command,
	COMMAND as _COMMAND,
	edit as _edit,
	normalize as _normalize,
	REMOVED as _REMOVED,
};
export type { CompiledRule as _CompiledRule };

// ---------------------------------------------------------------------------
// In-source unit tests (internals: fold, identity, command protocol).
// Public-API breadth is covered by the integration suite in test/.
// ---------------------------------------------------------------------------
if (import.meta.vitest) {
	const { describe, it, expect } = import.meta.vitest;

	describe('transform: identity & structural sharing (I5)', () => {
		it('no-op returns the input by reference', () => {
			const x = { a: { b: 1 }, c: [1, 2] };
			expect(transform(x, () => {})).toBe(x);
		});
		it('shares untouched subtrees, copies only the edited spine', () => {
			const x = { keep: { deep: 1 }, edit: { n: 1 } };
			const out = transform(x, (v, { replace }) => (v.key === 'n' ? replace(2) : undefined));
			expect(out).not.toBe(x);
			expect(out.keep).toBe(x.keep); // untouched subtree shared
			expect(out.edit).not.toBe(x.edit); // edited spine copied
			expect(out.edit.n).toBe(2);
			expect(x.edit.n).toBe(1); // input unchanged
		});
	});

	describe('transform: command protocol (I4)', () => {
		it('replace is final — not re-visited, not descended', () => {
			let sawWrapped = false;
			const out = transform({ a: 1 }, (v, { replace }) => {
				if (v.key === 'a') return replace({ wrapped: v.value });
				if (v.key === 'wrapped') sawWrapped = true; // must NOT fire
			});
			expect(out.a).toEqual({ wrapped: 1 });
			expect(sawWrapped).toBe(false);
		});
		it('replace(undefined) sets undefined (closes the v1 ambiguity)', () => {
			const out = transform({ a: 1 }, (v, { replace }) => (v.key === 'a' ? replace(undefined) : undefined));
			expect('a' in out).toBe(true);
			expect(out.a).toBe(undefined);
		});
		it('descend:true recurses into the replacement children', () => {
			const out = transform({ a: 1 }, (v, { replace }) => {
				if (v.key === 'a') return replace({ n: 5 }, { descend: true });
				if (v.key === 'n') return replace((v.value as number) * 2);
			});
			expect(out.a).toEqual({ n: 10 });
		});
		it('remove splices arrays with no holes', () => {
			const out = transform({ xs: [1, 2, 3, 4] }, (v, { remove }) =>
				typeof v.value === 'number' && v.value % 2 === 0 ? remove() : undefined,
			);
			expect(out.xs).toEqual([1, 3]);
		});
		it('skip keeps the value but prunes descent', () => {
			let deepSeen = false;
			transform({ box: { secret: 1 } }, (v, { skip }) => {
				if (v.key === 'box') return skip();
				if (v.key === 'secret') deepSeen = true;
			});
			expect(deepSeen).toBe(false);
		});
		it('stop ends the pass; prior edits still fold', () => {
			const out = transform({ a: 1, b: 2, c: 3 }, (v, { replace, stop }) => {
				if (v.key === 'a') return replace(10);
				if (v.key === 'b') return stop();
			});
			expect(out.a).toBe(10);
			expect(out.b).toBe(2);
		});
		it('throws on a non-command return', () => {
			expect(() => transform({ a: 1 }, ((v: any) => v.value) as any)).toThrow(TypeError);
		});
	});

	describe('transform: post-order folds children first', () => {
		it('visitor sees already-folded children', () => {
			const tree = { a: { n: 1 }, b: { n: 2 } };
			const order: any[] = [];
			const out = transform(
				tree,
				(v) => {
					order.push(v.key);
				},
				{ order: 'post' },
			);
			expect(out).toBe(tree); // no edits -> identity even in post
			// children (n, a's object, n, b's object) seen before the root
			expect(order[order.length - 1]).toBe(undefined); // root last
		});
		it('post-order replace sees folded children', () => {
			const tree = { wrap: { inner: 1 } };
			const out = transform(
				tree,
				(v, { replace }) => {
					if (v.key === 'inner') return replace(2);
					if (v.key === 'wrap') {
						// children already folded: inner is 2 here
						return replace({ doubled: (v.value as any).inner });
					}
				},
				{ order: 'post' },
			);
			expect(out.wrap).toEqual({ doubled: 2 });
		});
	});

	describe('transform: rules form (pruned multi-pattern pass)', () => {
		it('applies pattern-scoped rules in one pass', () => {
			const doc = { user: { password: 'x', url: 'http://a' }, list: [{ url: 'http://b' }] };
			const out = transform(doc, {
				'**.password': (_v, { replace }) => replace('***'),
				'**.url': (v, { replace }) => replace(String(v.value).replace('http:', 'https:')),
			});
			expect(out.user.password).toBe('***');
			expect(out.user.url).toBe('https://a');
			expect(out.list[0].url).toBe('https://b');
		});
		it('rules + options.match throws', () => {
			expect(() => transform({}, { '*': () => {} }, { match: 'a' })).toThrow(TypeError);
		});
	});

	describe('transform: array with extra own keys (regression)', () => {
		it('preserves unedited non-index keys when an element is removed', () => {
			const xs: any = [1, 2, 3];
			xs.meta = 'keep';
			const out = transform({ xs }, (v, { remove }) => (v.value === 2 ? remove() : undefined));
			expect([...out.xs]).toEqual([1, 3]);
			expect(out.xs.meta).toBe('keep');
		});
		it('mutate mode: removes a deleted extra key, keeps the rest', () => {
			const xs: any = [1, 2];
			xs.tag = 'a';
			xs.note = 'b';
			transform({ xs }, (v, { remove }) => (v.key === 'tag' ? remove() : undefined), { mutate: true });
			expect(xs.tag).toBeUndefined();
			expect(xs.note).toBe('b');
		});
	});

	describe('transform: mutate mode', () => {
		it('edits in place and returns the root', () => {
			const x = { a: 1, xs: [1, 2, 3] };
			const out = transform(x, (v, { replace, remove }) => {
				if (v.key === 'a') return replace(9);
				if (v.value === 2) return remove();
			}, { mutate: true });
			expect(out).toBe(x);
			expect(x.a).toBe(9);
			expect(x.xs).toEqual([1, 3]);
		});
	});
}

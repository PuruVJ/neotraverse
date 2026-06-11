// v2 kernel — THE single traversal engine. An explicit-stack depth-first step
// machine emitting ENTER / EXIT events; no recursion (deep input can never blow
// the call stack) and no generator frames on the hot path. One cursor drives
// reads (visit) and writes (transform); breadth-first reads use the queue walk
// below, sharing the SAME key model, cycle rule, and pattern semantics.
//
// Frames carry an opaque `view` slot so the cursor stays agnostic of the
// read-facing Visit record (created by visit.ts / transform.ts and stashed
// here only so a child can link to its parent's record for lazy paths).

import { assert_depth, child_at, type KeyOptions, list_keys } from './keys.js';
import { compile_pattern, type Matcher, type MatchStates } from './pattern.js';

export const ENTER = 1;
export const EXIT = 2;
export type Phase = typeof ENTER | typeof EXIT;

export interface Frame {
	node: any;
	keys: PropertyKey[] | null;
	/** -1 = freshly pushed (needs ENTER); otherwise the next child index. */
	index: number;
	depth: number;
	key: PropertyKey | undefined;
	parent: Frame | undefined;
	/** opaque stash for the consumer's Visit record (parent linkage + lazy path). */
	view: any;
	/** opaque stash for transform's per-frame fold state (kernel never reads it). */
	tx: any;
	/** the ancestor frame this node points back to, or undefined. */
	circular: Frame | undefined;
	/** pattern live-states entering this node (0 / empty when no matcher). */
	states: MatchStates;
	/** matcher.accepts(states) — true when no matcher (match-all). */
	matched: boolean;
	/** descent suppressed (leaf, cycle, pattern-pruned, or consumer skip()). */
	skipped: boolean;
	isLeaf: boolean;
}

// Reset a frame (fresh or recycled) to a clean, monomorphic shape.
function reset_frame(f: Frame, node: any, key: PropertyKey | undefined, parent: Frame | undefined, depth: number): Frame {
	f.node = node;
	f.keys = null;
	f.index = -1;
	f.depth = depth;
	f.key = key;
	f.parent = parent;
	f.view = undefined;
	f.tx = undefined;
	f.circular = undefined;
	f.states = 0;
	f.matched = true;
	f.skipped = false;
	f.isLeaf = true;
	return f;
}

// Cycle detection: is `node` one of the ancestors on the current path? Scans the
// parent chain (like v1) instead of maintaining a per-node ancestry map — cheaper
// for the shallow trees that dominate, and zero per-node bookkeeping on descent/ascent.
function ancestor_of(node: object, from: Frame | undefined): Frame | undefined {
	for (let p = from; p !== undefined; p = p.parent) {
		if (p.node === node) return p;
	}
	return undefined;
}

function make_frame(node: any, key: PropertyKey | undefined, parent: Frame | undefined, depth: number): Frame {
	// One literal shape so every frame shares a hidden class (monomorphic).
	return {
		node,
		keys: null,
		index: -1,
		depth,
		key,
		parent,
		view: undefined,
		tx: undefined,
		circular: undefined,
		states: 0,
		matched: true,
		skipped: false,
		isLeaf: true,
	};
}

export interface CursorOptions extends KeyOptions {
	/** Glob pattern; only matched frames are surfaced and descent prunes to viable prefixes. */
	match?: string;
	/**
	 * Surface EXIT events. Post-order reads and transform need them; a plain
	 * pre-order read does not, so it sets this false and the cursor does the
	 * EXIT bookkeeping internally — halving step() calls per node. @default true
	 */
	exits?: boolean;
}

/**
 * Depth-first ENTER/EXIT cursor. Pull one event at a time via {@link step};
 * after it returns true, read {@link phase} and {@link frame}. ENTER fires when
 * a node is first reached (parents before children); EXIT fires once all of a
 * node's descendants have been processed (children before parents).
 */
export class Cursor {
	phase: Phase = ENTER;
	frame: Frame;

	private readonly stack: Frame[];
	// O(1) cycle membership for the current path. A Set (not Map) — lighter per
	// node — keeps deep/adversarial input O(n), not O(n²) like a parent-chain
	// scan. The actual ancestor frame (for Visit.circular) is resolved by a
	// one-off parent walk only on the rare cycle hit.
	private readonly ancestors = new Set<object>();
	private readonly symbols: boolean;
	private readonly mapSet: boolean;
	private readonly maxDepth: number | undefined;
	private readonly matcher: Matcher | undefined;
	// Surface EXIT events to the consumer. A plain pre-order read sets this false:
	// the cursor still does the EXIT bookkeeping (pop, ancestor delete, recycle)
	// internally, but skips returning a second event per node — halving step() calls.
	private readonly emitExits: boolean;
	// Frame free-list: visiting is the hot path and Visit records are already one
	// allocation per node, so frames are pooled (recycled at EXIT) to avoid a
	// second. Visit records copy out what they need, so a recycled frame is safe.
	private readonly pool: Frame[] = [];
	private recyclable: Frame | undefined = undefined;

	constructor(root: any, options: CursorOptions = {}) {
		this.symbols = !!options.symbols;
		this.mapSet = !!options.mapSet;
		this.maxDepth = options.maxDepth;
		this.matcher = options.match !== undefined ? compile_pattern(options.match) : undefined;
		this.emitExits = options.exits !== false;

		const f = make_frame(root, undefined, undefined, 0);
		if (this.matcher) f.states = this.matcher.initial;
		this.stack = [f];
		this.frame = f;
	}

	private acquire(node: any, key: PropertyKey | undefined, parent: Frame | undefined, depth: number): Frame {
		const pooled = this.pool.pop();
		return pooled !== undefined ? reset_frame(pooled, node, key, parent, depth) : make_frame(node, key, parent, depth);
	}

	/** Advance to the next ENTER/EXIT event. Returns false when traversal is done. */
	step(): boolean {
		const stack = this.stack;
		// The previous EXIT frame has now been fully processed by the consumer
		// (its Visit copied out what it needs), so it can return to the pool.
		if (this.recyclable !== undefined) {
			this.pool.push(this.recyclable);
			this.recyclable = undefined;
		}
		for (;;) {
			const top = stack.length - 1;
			if (top < 0) return false;
			const f = stack[top];

			if (f.index === -1) {
				// First touch: compute children, cycle, pattern viability, then ENTER.
				this.enter(f);
				f.index = 0;
				this.frame = f;
				this.phase = ENTER;
				return true;
			}

			// The consumer may have called skip() on the node we just ENTERed
			// (Visit.skip() sets f.skipped directly while this frame is current).
			const keys = f.keys;
			const descend = keys !== null && !f.skipped && f.circular === undefined;
			if (descend && f.index < keys!.length) {
				const k = keys![f.index++];
				const child = this.acquire(child_at(f.node, k, this.mapSet), k, f, f.depth + 1);
				if (this.matcher !== undefined) child.states = this.matcher.step(f.states, k);
				assert_depth(child.depth, this.maxDepth);
				stack.push(child);
				continue; // loop around to ENTER the child
			}

			// No (more) children to descend into: EXIT this frame and pop it.
			stack.pop();
			// Only the frame that ADDED the node removes it. A circular frame
			// (f.circular set) never added it — the real ancestor still owns the
			// Set entry and must keep it for sibling subtrees that point back too.
			const node = f.node;
			if (f.circular === undefined && typeof node === 'object' && node !== null) {
				this.ancestors.delete(node);
			}
			if (this.emitExits) {
				this.frame = f;
				this.phase = EXIT;
				this.recyclable = f; // recycled at the start of the next step()
				return true;
			}
			// Pre-order read: no consumer for EXIT — recycle now and keep going.
			this.pool.push(f);
			continue;
		}
	}

	/** Mark the current node so its descendants are not visited. */
	skip(): void {
		this.frame.skipped = true;
	}

	/**
	 * Swap the current node for `value` and descend into the REPLACEMENT's
	 * children instead of the original's (transform's `replace(v, {descend:true})`).
	 * The replacement node itself is not re-entered. Must be called during the
	 * current frame's ENTER, before the next {@link step}.
	 */
	replaceCurrent(value: any): void {
		const f = this.frame;
		const old = f.node;
		// Drop `old` from the ancestry only if THIS frame added it (not a back-edge).
		if (f.circular === undefined && typeof old === 'object' && old !== null) {
			this.ancestors.delete(old);
		}
		f.node = value;
		f.circular = undefined;
		if (typeof value === 'object' && value !== null) {
			if (this.ancestors.has(value)) {
				f.circular = ancestor_of(value, f.parent);
				f.keys = null;
			} else {
				this.ancestors.add(value);
				f.keys = list_keys(value, this.symbols, this.mapSet);
			}
		} else {
			f.keys = null;
		}
		f.index = 0;
		f.isLeaf = f.keys === null || f.keys.length === 0;
	}

	private enter(f: Frame): void {
		const node = f.node;
		const is_obj = typeof node === 'object' && node !== null;
		if (is_obj) {
			if (this.ancestors.has(node)) {
				f.circular = ancestor_of(node, f.parent); // rare: resolve the ancestor frame
			} else {
				this.ancestors.add(node);
				f.keys = list_keys(node, this.symbols, this.mapSet);
			}
		}
		f.isLeaf = f.keys === null || f.keys.length === 0;

		const m = this.matcher;
		if (m !== undefined) {
			f.matched = m.accepts(f.states);
			// Prune: a node whose state set can never lead to a match is not descended.
			// Child states are threaded at push time in step().
			if (!m.viable(f.states)) f.skipped = true;
		}
	}

	get hasMatcher(): boolean {
		return this.matcher !== undefined;
	}
}

// Breadth-first frames (read-only; transform forbids breadth). Level-by-level,
// FIFO within a level. Shares the key model and cycle rule; a parent is always
// dequeued (and its view created) before its children, so lazy paths resolve.
export function* breadthFrames(root: any, options: CursorOptions = {}): Generator<Frame> {
	const symbols = !!options.symbols;
	const mapSet = !!options.mapSet;
	const maxDepth = options.maxDepth;
	const matcher = options.match !== undefined ? compile_pattern(options.match) : undefined;

	const rootFrame = make_frame(root, undefined, undefined, 0);
	if (matcher) rootFrame.states = matcher.initial;
	const queue: Frame[] = [rootFrame];
	// Per-path ancestry can't be a single shared map in BFS; track each frame's
	// ancestor chain by walking parents on demand (cheap; cycles are rare).
	let head = 0;
	while (head < queue.length) {
		const f = queue[head++];
		assert_depth(f.depth, maxDepth);
		const node = f.node;
		const is_obj = typeof node === 'object' && node !== null;
		if (is_obj) {
			// cycle: is `node` an ancestor on this frame's own path?
			for (let p = f.parent; p !== undefined; p = p.parent) {
				if (p.node === node) {
					f.circular = p;
					break;
				}
			}
			if (f.circular === undefined) f.keys = list_keys(node, symbols, mapSet);
		}
		f.isLeaf = f.keys === null || f.keys.length === 0;
		if (matcher) {
			f.matched = matcher.accepts(f.states);
			if (!matcher.viable(f.states)) f.skipped = true;
		}

		yield f;

		const keys = f.keys;
		if (keys !== null && !f.skipped && f.circular === undefined) {
			for (let i = 0; i < keys.length; i++) {
				const k = keys[i];
				const child = make_frame(child_at(node, k, mapSet), k, f, f.depth + 1);
				if (matcher) child.states = matcher.step(f.states, k);
				queue.push(child);
			}
		}
	}
}

// ---------------------------------------------------------------------------
// In-source unit tests (stripped from the production build). Exercise the
// internal step machine directly so we never export frames just to test them.
// ---------------------------------------------------------------------------
if (import.meta.vitest) {
	const { describe, it, expect } = import.meta.vitest;

	// Drive the cursor to completion, collecting (phase, key, depth) tuples.
	const drive = (root: any, options?: CursorOptions) => {
		const c = new Cursor(root, options);
		const events: Array<{ phase: string; key: PropertyKey | undefined; depth: number }> = [];
		// patch step() to thread child pattern states (mirrors visit.ts wiring)
		while (c.step()) {
			const f = c.frame;
			events.push({ phase: c.phase === ENTER ? 'enter' : 'exit', key: f.key, depth: f.depth });
		}
		return events;
	};

	describe('cursor: ENTER/EXIT order (I1)', () => {
		it('pre-order parents before children, post-order via EXIT', () => {
			const ev = drive({ a: { b: 1 }, c: 2 });
			const enters = ev.filter((e) => e.phase === 'enter').map((e) => e.key);
			expect(enters).toEqual([undefined, 'a', 'b', 'c']);
			// EXIT of `a` comes after EXIT of `b` (children before parents)
			const seq = ev.map((e) => `${e.phase}:${String(e.key)}`);
			expect(seq.indexOf('exit:b')).toBeLessThan(seq.indexOf('exit:a'));
		});

		it('every ENTER has a matching EXIT (balanced)', () => {
			const ev = drive({ x: [1, 2], y: { z: 3 } });
			expect(ev.filter((e) => e.phase === 'enter').length).toBe(
				ev.filter((e) => e.phase === 'exit').length,
			);
		});
	});

	describe('cursor: cycles (I2)', () => {
		it('visits a back-edge once and does not descend it', () => {
			const ring: any = { name: 'root' };
			ring.self = ring;
			const c = new Cursor(ring);
			let selfCircular: Frame | undefined;
			let enters = 0;
			while (c.step()) {
				if (c.phase === ENTER) {
					enters++;
					if (c.frame.key === 'self') selfCircular = c.frame.circular;
				}
			}
			// root + name + self  (self not descended back into root)
			expect(enters).toBe(3);
			expect(selfCircular).toBeDefined();
			expect(selfCircular!.node).toBe(ring);
		});

		it('an ancestor referenced by TWO sibling subtrees is detected both times (no premature Set delete)', () => {
			const root: any = { x: {}, y: {} };
			root.x.self = root; // first back-edge to root
			root.y.self = root; // second back-edge — must ALSO be flagged, not re-descended
			const c = new Cursor(root);
			let enters = 0;
			const circulars: PropertyKey[] = [];
			while (c.step()) {
				if (c.phase === ENTER) {
					enters++;
					if (c.frame.circular !== undefined) circulars.push(c.frame.key as PropertyKey);
					if (enters > 50) throw new Error('runaway — cycle not detected on second subtree');
				}
			}
			// root, x, x.self(cycle), y, y.self(cycle) = 5
			expect(enters).toBe(5);
			expect(circulars).toEqual(['self', 'self']);
		});

		it('a DAG (shared non-ancestor) is visited on every path, not flagged circular', () => {
			const shared = { v: 1 };
			const c = new Cursor({ a: shared, b: shared });
			const enters: PropertyKey[] = [];
			let anyCircular = false;
			while (c.step()) {
				if (c.phase === ENTER) {
					enters.push(c.frame.key as PropertyKey);
					if (c.frame.circular !== undefined) anyCircular = true;
				}
			}
			// root, a(=shared), v, b(=shared), v  → `v` entered on both paths
			expect(enters).toEqual([undefined, 'a', 'v', 'b', 'v']);
			expect(anyCircular).toBe(false); // a sibling-shared node is NOT a cycle
		});
	});

	describe('cursor: skip prunes descent (I3)', () => {
		it('skip() on a node suppresses its subtree', () => {
			const c = new Cursor({ keep: { deep: 1 }, drop: { deep: 2 } });
			const entered: PropertyKey[] = [];
			while (c.step()) {
				if (c.phase === ENTER) {
					entered.push(c.frame.key!);
					if (c.frame.key === 'drop') c.skip();
				}
			}
			expect(entered).toContain('keep');
			// 'drop' entered, but its child 'deep' under drop pruned
			const deepCount = entered.filter((k) => k === 'deep').length;
			expect(deepCount).toBe(1); // only keep.deep
		});
	});

	describe('cursor: maxDepth bound', () => {
		it('throws RangeError past the bound', () => {
			const deep = { a: { b: { c: { d: 1 } } } };
			expect(() => drive(deep, { maxDepth: 2 })).toThrow(RangeError);
		});
	});

	describe('breadthFrames: level order', () => {
		it('yields shallower nodes before deeper ones', () => {
			const depths = [...breadthFrames({ a: 1, b: { c: { d: 2 } } })].map((f) => f.depth);
			// non-decreasing
			for (let i = 1; i < depths.length; i++) expect(depths[i]).toBeGreaterThanOrEqual(depths[i - 1]);
		});
	});
}

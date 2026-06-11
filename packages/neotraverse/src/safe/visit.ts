// The READ primitive. `visit()` returns a lazy iterator of fresh, monomorphic
// Visit records — one per node, in pre-order (default), post-order, or breadth
// order. Because the iterator is a subclass of the native ES2025 `Iterator`,
// every helper (.map/.filter/.find/.take/.toArray/.reduce, Map.groupBy, spread,
// for-of + break) comes for free with zero bundle cost; the library ships only
// next()/return() and the Visit record itself.
//
// Visit records are self-contained (they copy value/key/depth/isLeaf/circular
// out of the pooled frame and link parent → parent's Visit), so retaining them
// — `visit(o).toArray()`, storing `.find(...)` — is always safe. `.path` and
// `.pointer` stay lazy: you pay for the array/string only when you read it.

import { breadthFrames, Cursor, ENTER, type Frame } from './kernel/cursor.js';
import { type KeyOptions } from './kernel/keys.js';

export interface VisitOptions extends KeyOptions {
	/** Traversal order. @default 'pre' (parents before children). */
	order?: 'pre' | 'post' | 'breadth';
	/** Glob pattern; yields only matching nodes and prunes descent to viable prefixes. */
	match?: string;
}

/**
 * One visited node. Created fresh per node and safe to retain. The control
 * method {@link skip} is meaningful only during the current iteration step.
 */
export class Visit<V = unknown> {
	/** The node's value. */
	readonly value: V;
	/** The node's key in its parent (`undefined` at the root). Map keys appear as-is. */
	readonly key: PropertyKey | undefined;
	/** The parent node's Visit (`undefined` at the root). */
	readonly parent: Visit | undefined;
	/** Depth from the root (`0` at the root). */
	readonly depth: number;
	/** No traversable children under the current options. */
	readonly isLeaf: boolean;
	/** The ancestor Visit this node points back to, if it is a back-edge. */
	readonly circular: Visit | undefined;

	/** @internal owning session, for {@link skip}. */
	private readonly s: Session;

	constructor(session: Session, value: V, key: PropertyKey | undefined, parent: Visit | undefined, depth: number, isLeaf: boolean, circular: Visit | undefined) {
		this.s = session;
		this.value = value;
		this.key = key;
		this.parent = parent;
		this.depth = depth;
		this.isLeaf = isLeaf;
		this.circular = circular;
	}

	/** Key path from the root. Lazily rebuilt from the parent chain on each read. */
	get path(): PropertyKey[] {
		const out = new Array<PropertyKey>(this.depth);
		// eslint-disable-next-line @typescript-eslint/no-this-alias
		let v: Visit | undefined = this;
		for (let i = this.depth - 1; i >= 0; i--) {
			out[i] = v!.key as PropertyKey;
			v = v!.parent;
		}
		return out;
	}

	/** RFC 6901 JSON Pointer to this node (`/users/0/name`). Lazy. */
	get pointer(): string {
		const path = this.path;
		let out = '';
		for (let i = 0; i < path.length; i++) {
			let s = String(path[i]);
			if (s.indexOf('~') !== -1 || s.indexOf('/') !== -1) {
				s = s.replace(/~/g, '~0').replace(/\//g, '~1');
			}
			out += '/' + s;
		}
		return out;
	}

	/**
	 * Do not descend into this node's children (pre/breadth order only).
	 * Throws in post-order, where children are already visited. A no-op when
	 * called on a stale (already-passed) record.
	 */
	skip(): void {
		if (this.s.post) {
			throw new TypeError("neotraverse: skip() is not available in order: 'post' (children are already visited)");
		}
		if (this.s.current === this && this.s.cursor) this.s.cursor.skip();
	}
}

// Shared per-walk context. One allocation per visit() call; every Visit holds a
// reference so skip() can reach the live cursor and the order flag.
interface Session {
	cursor: Cursor | undefined;
	post: boolean;
	current: Visit | undefined;
}

// Build a Visit from a frame, linking parent → parent frame's stashed Visit and
// stashing this Visit back on the frame for its own children. `value` is passed
// explicitly so transform can supply a folded value in post-order.
export function makeVisit(session: Session, f: Frame, value: any): Visit {
	const parent = f.parent !== undefined ? (f.parent.view as Visit | undefined) : undefined;
	const circular = f.circular !== undefined ? (f.circular.view as Visit | undefined) : undefined;
	const v = new Visit(session, value, f.key, parent, f.depth, f.isLeaf, circular);
	f.view = v;
	return v;
}

// The iterator. Subclasses the native Iterator so helper methods are inherited.
const IteratorBase: any = (globalThis as any).Iterator ?? class {};

class VisitIterator extends IteratorBase {
	private readonly cursor: Cursor;
	private readonly session: Session;
	private readonly post: boolean;
	private readonly hasMatcher: boolean;
	private done = false;
	// One reused IteratorResult — native helpers read .value/.done before the next
	// pull, so a single shared box is safe and saves an allocation per node.
	private readonly result: IteratorResult<Visit, undefined> = { value: undefined as any, done: false };

	constructor(root: any, options: VisitOptions) {
		super();
		this.post = options.order === 'post';
		// Pre-order never consumes EXIT events; tell the cursor to suppress them.
		this.cursor = new Cursor(root, { ...options, exits: this.post });
		this.hasMatcher = options.match !== undefined;
		this.session = { cursor: this.cursor, post: this.post, current: undefined };
	}

	private yield(v: Visit): IteratorResult<Visit, undefined> {
		this.session.current = v;
		this.result.value = v;
		this.result.done = false;
		return this.result;
	}

	private finish(): IteratorResult<Visit, undefined> {
		this.done = true;
		this.session.current = undefined;
		this.result.value = undefined as any;
		this.result.done = true;
		return this.result;
	}

	next(): IteratorResult<Visit, undefined> {
		if (this.done) return this.finish();
		const cursor = this.cursor;
		while (cursor.step()) {
			const f = cursor.frame;
			if (cursor.phase === ENTER) {
				// Always materialize at ENTER so children can link their parent.
				const v = makeVisit(this.session, f, f.node);
				if (!this.post && (!this.hasMatcher || f.matched)) return this.yield(v);
			} else if (this.post && (!this.hasMatcher || f.matched)) {
				return this.yield(f.view as Visit);
			}
		}
		return this.finish();
	}

	// Early exit (break / .find / .take) tears down the walk.
	return(): IteratorResult<Visit, undefined> {
		return this.finish();
	}
}

class BreadthIterator extends IteratorBase {
	private readonly gen: Generator<Frame>;
	private readonly session: Session;
	private readonly hasMatcher: boolean;
	private readonly result: IteratorResult<Visit, undefined> = { value: undefined as any, done: false };

	constructor(root: any, options: VisitOptions) {
		super();
		this.gen = breadthFrames(root, options);
		this.hasMatcher = options.match !== undefined;
		this.session = { cursor: undefined, post: false, current: undefined };
	}

	next(): IteratorResult<Visit, undefined> {
		for (;;) {
			const r = this.gen.next();
			if (r.done) {
				this.result.value = undefined as any;
				this.result.done = true;
				return this.result;
			}
			const f = r.value;
			const v = makeVisit(this.session, f, f.node);
			if (!this.hasMatcher || f.matched) {
				this.result.value = v;
				this.result.done = false;
				return this.result;
			}
		}
	}
}

/** Iterator of {@link Visit} records; native iterator helpers attach. */
export type Visits<V = unknown> = IteratorObject<Visit<V>, undefined, unknown>;

/**
 * Lazily walk every node of `root`. Pass a glob string as the second argument
 * as shorthand for `{ match }`.
 *
 * @example
 * ```js
 * for (const v of visit(doc)) console.log(v.path, v.value);
 * visit(doc, '**.email').map(v => v.value).toArray();
 * visit(doc, { order: 'post' });
 * ```
 */
export function visit<T>(root: T, options?: VisitOptions): Visits;
export function visit<T>(root: T, pattern: string, options?: Omit<VisitOptions, 'match'>): Visits;
export function visit(root: any, optionsOrPattern?: VisitOptions | string, maybeOptions?: VisitOptions): Visits {
	if (typeof optionsOrPattern === 'function') {
		throw new TypeError(
			'neotraverse: visit(root, callback) is not the v1 walk(); use transform(root, visitor) for edits or `for (const v of visit(root))` for reads',
		);
	}
	const options: VisitOptions =
		typeof optionsOrPattern === 'string'
			? { ...maybeOptions, match: optionsOrPattern }
			: optionsOrPattern ?? {};
	const it = options.order === 'breadth' ? new BreadthIterator(root, options) : new VisitIterator(root, options);
	return it as unknown as Visits;
}

// ---------------------------------------------------------------------------
// In-source unit tests — only those that need to reach internals. Public-API
// behavior is covered by the integration suite in test/.
// ---------------------------------------------------------------------------
if (import.meta.vitest) {
	const { describe, it, expect } = import.meta.vitest;

	describe('visit: order (I1)', () => {
		it('pre-order yields parents before children, root first', () => {
			const keys = [...visit({ a: { b: 1 }, c: 2 })].map((v) => v.key);
			expect(keys).toEqual([undefined, 'a', 'b', 'c']);
		});
		it('post-order yields children before parents', () => {
			const keys = [...visit({ a: { b: 1 } }, { order: 'post' })].map((v) => v.key);
			expect(keys).toEqual(['b', 'a', undefined]);
		});
		it('breadth yields level by level', () => {
			const keys = [...visit({ a: 1, b: { c: 2 } }, { order: 'breadth' })].map((v) => v.key);
			expect(keys).toEqual([undefined, 'a', 'b', 'c']);
		});
	});

	describe('visit: lazy path & pointer (I7 shape)', () => {
		it('derives path and pointer from the parent chain', () => {
			const hit = [...visit({ users: [{ email: 'a@b.c' }] })].find((v) => v.value === 'a@b.c')!;
			expect(hit.path).toEqual(['users', 0, 'email']);
			expect(hit.pointer).toBe('/users/0/email');
		});
	});

	describe('visit: retention is safe (fresh records)', () => {
		it('toArray keeps distinct records', () => {
			const all = visit({ a: 1, b: 2 }).toArray();
			expect(all.map((v) => v.value)).toEqual([{ a: 1, b: 2 }, 1, 2]);
			expect(all[1]).not.toBe(all[2]);
		});
	});

	describe('visit: skip prunes (I3)', () => {
		it('v.skip() suppresses a subtree', () => {
			const seen: PropertyKey[] = [];
			for (const v of visit({ keep: { x: 1 }, drop: { y: 2 } })) {
				seen.push(v.key as PropertyKey);
				if (v.key === 'drop') v.skip();
			}
			expect(seen).toContain('x');
			expect(seen).not.toContain('y');
		});
		it('skip() throws in post-order', () => {
			expect(() => {
				for (const v of visit({ a: 1 }, { order: 'post' })) v.skip();
			}).toThrow(TypeError);
		});
	});

	describe('visit: match prunes and filters', () => {
		it('yields only matched nodes', () => {
			const vals = visit({ users: [{ email: 'x' }, { email: 'y' }], other: { email: 'z' } }, 'users.*.email')
				.map((v) => v.value)
				.toArray();
			expect(vals).toEqual(['x', 'y']);
		});
		it('** recursive descent', () => {
			const vals = visit({ a: { b: { id: 1 } }, c: { id: 2 } }, '**.id').map((v) => v.value).toArray();
			expect(vals.sort()).toEqual([1, 2]);
		});
	});

	describe('visit: guards', () => {
		it('throws when handed a callback', () => {
			expect(() => visit({ a: 1 }, (() => {}) as any)).toThrow(TypeError);
		});
	});
}

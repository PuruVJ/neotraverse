import { copy } from './clone.js';
import type { TraverseContext, TraverseOptions } from './utils.js';
import {
	array_keys,
	assert_within_depth,
	clamp_concurrency,
	empty_null,
	get_child_at,
	has_own_property,
	is_array,
	is_non_writable,
	is_unsafe_key,
	map_set_child_keys,
	object_keys,
	own_enumerable_keys,
	safe_set,
} from './utils.js';

// Lazy, read-only depth-first walk yielding `[path, node]`. Pull-based, so it
// never materializes the full paths()/nodes() arrays. Circular-safe via an
// ancestry Set (a node that points back to an ancestor is yielded but not
// descended, matching walk()'s circular rule). Honors includeSymbols/maxDepth.
function* iterate(
	node: any,
	path: PropertyKey[],
	iter: (obj: object) => PropertyKey[],
	seen: Set<object>,
	max_depth: number | undefined,
	depth: number,
): Generator<[PropertyKey[], any]> {
	yield [path, node];
	if (typeof node !== 'object' || node === null) return;
	if (seen.has(node)) return; // circular — visited, but don't descend
	assert_within_depth(depth, max_depth);
	seen.add(node);
	const keys = is_array(node) ? array_keys(node, iter(node)) : iter(node);
	for (let i = 0; i < keys.length; i++) {
		yield* iterate(node[keys[i]], path.concat(keys[i]), iter, seen, max_depth, depth + 1);
	}
	seen.delete(node);
}

// Shared per-walk state — one allocation per traversal, referenced by every node.
interface WalkState {
	alive: boolean;
	immutable: boolean;
	iter: (obj: object) => PropertyKey[];
	max_depth: number | undefined;
	path: PropertyKey[];
	parents: WalkContext[];
	descend_map_set: boolean;
	concurrency: number;
	// walk(): the ancestor Map while the stack is deeper than SCAN_DEPTH, else null
	deep: Map<object, WalkContext> | null;
	// walk(): a check found a match in `deep`, so an object may be on the stack twice
	// (a callback can clear ctx.circular and descend); see enter_deep
	deep_hit: boolean;
	// walk_async() child states: the context the state was made for, while its
	// `parents` array is not built yet (see build_parents); null otherwise
	owner: WalkContext | null;
	// walk_async(): true while `owner` descends (it is then the last of its parents)
	descending: boolean;
}

// walk_async() child states start with these: their context sets its own
// parent/key/level, and `parents` is built only when it is read. Never written.
// One element each, so the constructor's `[level - 1]` reads stay in bounds
// (an index of -1 is a slow named-property lookup).
const NO_PATH: PropertyKey[] = [undefined as unknown as PropertyKey];
const NO_PARENTS: WalkContext[] = [undefined as unknown as WalkContext];

// The ancestors of an async child state's context, built from its parent chain
// the first time `ctx.parents` is read. From then on the walker pushes and pops
// the array like any other.
function build_parents(w: WalkState, owner: WalkContext): WalkContext[] {
	const n = owner.level;
	const out = new Array<WalkContext>(w.descending ? n + 1 : n);
	let c = owner.parent as WalkContext;
	for (let i = n - 1; i >= 0; i--) {
		out[i] = c;
		c = c.parent as WalkContext;
	}
	if (w.descending) out[n] = owner;
	w.parents = out;
	w.owner = null;
	return out;
}

// before/after/pre/post hooks — lazily allocated, so the common path that uses
// none of them carries a single `null` field instead of four.
interface Modifiers {
	before?: (ctx: TraverseContext, value: any) => void;
	after?: (ctx: TraverseContext, value: any) => void;
	pre?: (ctx: TraverseContext, child: any, key: any) => void;
	post?: (ctx: TraverseContext, child: any) => void;
}

/**
 * The traversal context. Every method lives on the prototype, so visiting a
 * node allocates a *single* object — not a context object plus a fresh closure
 * for each of `update`/`remove`/`before`/… and a separate `modifiers` object.
 * That, plus the lazily-derived {@link path}, is what makes the modern build
 * dramatically faster and lighter on the GC than the classic design.
 *
 * @see https://neotraverse.puruvj.dev/guide/context
 */
class WalkContext implements TraverseContext {
	node: any;
	node_: any;
	parent: TraverseContext | undefined;
	key: PropertyKey | undefined;
	isRoot: boolean;
	isLeaf = false;
	isFirst = false;
	isLast = false;
	level: number;
	circular: TraverseContext | undefined = undefined;
	keys: PropertyKey[] | null = null;

	// internal (kept as plain fields for a monomorphic shape)
	w: WalkState;
	keep_going = true;
	// set by remove()/delete(): tells the parent's descend loop to skip the writeback
	// so the slot isn't re-added. The array index shift (after a remove() splice) is
	// detected separately by array length, so a delete() hole doesn't shift (C-3).
	removed = false;
	mods: Modifiers | null = null;
	constructor(w: WalkState, node_: any, node: any) {
		const path = w.path;
		const level = path.length;
		this.w = w;
		this.node = node;
		this.node_ = node_;
		this.parent = w.parents[level - 1];
		this.key = path[level - 1];
		this.isRoot = level === 0;
		this.level = level;
	}

	// the live ancestor stack — shared, so it's read straight off the walk state
	get parents(): TraverseContext[] {
		const w = this.w;
		return w.owner === null ? w.parents : build_parents(w, w.owner);
	}

	// derived flags — no per-node storage
	get notRoot(): boolean {
		return !this.isRoot;
	}
	get notLeaf(): boolean {
		return !this.isLeaf;
	}

	// `path` is derived from the parent chain on demand, so the common ops
	// (forEach/map/clone/reduce/nodes) never pay for a per-node array copy.
	get path(): PropertyKey[] {
		// Fill a pre-sized array back-to-front — no push, no reverse()/toReversed().
		const out = new Array<PropertyKey>(this.level);
		let c: WalkContext = this;
		for (let i = this.level - 1; i >= 0; i--) {
			out[i] = c.key as PropertyKey;
			c = c.parent as WalkContext;
		}
		return out;
	}
	update(x: any, stopHere: boolean = false): void {
		if (!this.isRoot) {
			safe_set((this.parent as WalkContext).node, this.key as PropertyKey, x);
		}
		this.node = x;
		if (stopHere) this.keep_going = false;
	}
	delete(stopHere?: boolean): void {
		delete (this.parent as WalkContext).node[this.key as PropertyKey];
		// Mark so the descend writeback doesn't re-add the just-deleted slot. Unlike
		// remove(), delete() leaves an array hole (no length change), so it triggers
		// no index shift — the descend loop detects shifts by array length (DEEP-1).
		this.removed = true;
		if (stopHere) this.keep_going = false;
	}
	remove(stopHere?: boolean): void {
		const parent = (this.parent as WalkContext).node;
		if (is_array(parent)) {
			parent.splice(this.key as number, 1);
		} else {
			delete parent[this.key as PropertyKey];
		}
		this.removed = true;
		if (stopHere) this.keep_going = false;
	}
	before(f: (ctx: TraverseContext, value: any) => void): void {
		(this.mods ??= {}).before = f;
	}
	after(f: (ctx: TraverseContext, value: any) => void): void {
		(this.mods ??= {}).after = f;
	}
	pre(f: (ctx: TraverseContext, child: any, key: any) => void): void {
		(this.mods ??= {}).pre = f;
	}
	post(f: (ctx: TraverseContext, child: any) => void): void {
		(this.mods ??= {}).post = f;
	}
	stop(): void {
		this.w.alive = false;
	}
	block(): void {
		this.keep_going = false;
	}
	nextSibling(): WalkContext | undefined {
		const parent = this.parent as WalkContext | undefined;
		if (!parent?.keys || this.key === undefined) return undefined;
		const keys = parent.keys;
		const idx = keys.indexOf(this.key);
		if (idx < 0 || idx >= keys.length - 1) return undefined;
		return make_sibling_ctx(this, keys[idx + 1]);
	}
	prevSibling(): WalkContext | undefined {
		const parent = this.parent as WalkContext | undefined;
		if (!parent?.keys || this.key === undefined) return undefined;
		const keys = parent.keys;
		const idx = keys.indexOf(this.key);
		if (idx <= 0) return undefined;
		return make_sibling_ctx(this, keys[idx - 1]);
	}
}

// Build a sibling context that mirrors `self` (same parent, same level) but for
// `sibKey`. Constructed against the live parent chain rather than a snapshot
// WalkState, so `level`/`parent`/`path` stay correct and `.path` never throws
// (C-4). Also far cheaper than the old per-call WalkState + slice() allocations.
function make_sibling_ctx(self: WalkContext, sibKey: PropertyKey): WalkContext {
	const w = self.w;
	const parent = self.parent as WalkContext;
	const sibNode = get_child_at(parent.node, sibKey, w.descend_map_set);
	const sib = new WalkContext(w, sibNode, sibNode);
	sib.parent = parent;
	sib.key = sibKey;
	sib.level = self.level;
	sib.isRoot = self.level === 0;
	if (typeof sibNode === 'object' && sibNode !== null) {
		set_initial_keys(sib, w, sibNode, w.iter);
	} else {
		sib.isLeaf = true;
	}
	return sib;
}

function make_walk_state(options: TraverseOptions = empty_null, immutable?: boolean): WalkState {
	return {
		alive: true,
		immutable: immutable ?? !!options.immutable,
		iter: options.includeSymbols ? own_enumerable_keys : object_keys,
		max_depth: options.maxDepth,
		path: [],
		parents: [],
		descend_map_set: !!options.descendIntoMapSet,
		// Clamp to a positive integer. NaN / fractional / <1 values silently dropped
		// or skipped nodes via the batch stride; floor and floor again to 1 (A-1).
		concurrency: clamp_concurrency(options.concurrency),
		deep: null,
		deep_hit: false,
		owner: null,
		descending: false,
	};
}

function descend_children(
	w: WalkState,
	ctx: WalkContext,
	node: any,
	walker: (node_: any) => WalkContext,
	immutable: boolean,
	mods: Modifiers | null,
	// true when `node` is the untouched copy we just made: every key is present and
	// writable, so the per-key hasOwn + gopd guards can be skipped (DEEP-2).
	fresh: boolean,
): void {
	const { path } = w;
	const pre = mods !== null ? mods.pre : undefined;
	const post = mods !== null ? mods.post : undefined;
	// Map and Set children live in their own functions: the walk recurses through
	// this one, so its frame (every local of every branch) is paid once per level
	// of depth, and a smaller frame lets a deeper walk fit on the stack.
	if (w.descend_map_set) {
		if (node instanceof Map) return descend_map_entries(w, ctx, node, walker, immutable, pre, post);
		if (node instanceof Set) return descend_set_members(w, ctx, node, walker, immutable, pre, post);
	}
	const keys = ctx.keys as PropertyKey[];
	const node_is_array = is_array(node);
	let last = keys.length - 1;
	for (let index = 0; index <= last; index++) {
		if (!w.alive && !immutable) break; // stop() — don't allocate contexts for remaining siblings (W2)
		const key = keys[index];
		const childVal = node[key];
		const len_before = node_is_array ? node.length : 0;
		path.push(key);
		if (pre !== undefined) pre(ctx, childVal, key);
		const child = walker(childVal);
		// Skip the writeback when `node[key]` already holds child.node — either the
		// value was unchanged (still the fresh copy's value) or ctx.update() already
		// wrote it into `node` during the callback (DEEP-1). `removed` covers
		// remove()/delete() so the slot isn't re-added. For a fresh copy every key is
		// present and writable, so skip the hasOwn + gopd guards (DEEP-2); fall back
		// to the full guard only when the callback replaced the node.
		if (immutable && !child.removed && node[key] !== child.node) {
			if (fresh || (has_own_property.call(node, key) && !is_non_writable(node, key))) {
				safe_set(node, key, child.node);
			}
		}
		child.isLast = index === last;
		child.isFirst = index === 0;
		if (post !== undefined) post(ctx, child);
		path.pop();
		// remove() spliced this element out of an array: the array shrank, so elements
		// shifted left — revisit the same index and shrink the bound (C-3). A delete()
		// leaves a hole (no length change), so it does not shift.
		if (node_is_array && node.length < len_before) {
			index--;
			last--;
		}
	}
}

function descend_map_entries(
	w: WalkState,
	ctx: WalkContext,
	node: Map<any, any>,
	walker: (node_: any) => WalkContext,
	immutable: boolean,
	pre: Modifiers['pre'],
	post: Modifiers['post'],
): void {
	const { path } = w;
	const entries = [...node.entries()];
	const last = entries.length - 1;
	for (let index = 0; index <= last; index++) {
		if (!w.alive && !immutable) break; // stop() — don't allocate contexts for remaining siblings (W2)
		const [key, val] = entries[index];
		path.push(key);
		if (pre !== undefined) pre(ctx, val, key);
		const child = walker(val);
		// write the value back into the cloned Map entry only if it changed (C-9, DEEP-1)
		if (immutable && child.node !== val) node.set(key, child.node);
		child.isLast = index === last;
		child.isFirst = index === 0;
		if (post !== undefined) post(ctx, child);
		path.pop();
	}
}

function descend_set_members(
	w: WalkState,
	ctx: WalkContext,
	node: Set<any>,
	walker: (node_: any) => WalkContext,
	immutable: boolean,
	pre: Modifiers['pre'],
	post: Modifiers['post'],
): void {
	const { path } = w;
	const vals = [...node];
	const last = vals.length - 1;
	for (let index = 0; index <= last; index++) {
		if (!w.alive && !immutable) break; // stop() — don't allocate contexts for remaining siblings (W2)
		path.push(index);
		if (pre !== undefined) pre(ctx, vals[index], index);
		const child = walker(vals[index]);
		// rewrite the cloned Set member if the callback replaced it (C-9)
		if (immutable && child.node !== vals[index]) {
			node.delete(vals[index]);
			node.add(child.node);
		}
		child.isLast = index === last;
		child.isFirst = index === 0;
		if (post !== undefined) post(ctx, child);
		path.pop();
	}
}

// Recompute keys/isLeaf after the cb replaced the node (the uncommon path).
function update_state(ctx: WalkContext): void {
	const node = ctx.node;
	if (typeof node === 'object' && node !== null) {
		if (!ctx.keys || ctx.node_ !== node) {
			if (ctx.w.descend_map_set && node instanceof Map) {
				ctx.keys = map_set_child_keys(node);
			} else if (ctx.w.descend_map_set && node instanceof Set) {
				ctx.keys = map_set_child_keys(node);
			} else {
				const ks = ctx.w.iter(node);
				ctx.keys = is_array(node) ? array_keys(node, ks) : ks;
			}
		}
		ctx.isLeaf = ctx.keys.length === 0;
	} else {
		ctx.isLeaf = true;
		ctx.keys = null;
	}
}

// The child keys of an object node, and whether it is a leaf.
function set_initial_keys(
	ctx: WalkContext,
	w: WalkState,
	node0: object,
	iter: (obj: object) => PropertyKey[],
): void {
	let keys: PropertyKey[];
	if (w.descend_map_set && (node0 instanceof Map || node0 instanceof Set)) {
		keys = map_set_child_keys(node0);
	} else {
		keys = iter(node0);
		if (is_array(node0)) keys = array_keys(node0, keys);
	}
	ctx.keys = keys;
	ctx.isLeaf = keys.length === 0;
}

// A node is circular when its object is already on the ancestor stack, and
// ctx.circular is the OUTERMOST such ancestor. Scanning the stack made a chain of
// depth d cost d²/2. Up to SCAN_DEPTH ancestors the scan stays (cheaper than a Map
// at the depths real data has); deeper, the walk keeps a Map of each object on the
// stack → its outermost context there (see index_ancestors). It is made by the
// first check on a stack deeper than SCAN_DEPTH and dropped when the stack is
// back to SCAN_DEPTH.
const SCAN_DEPTH = 32;

// The Map for a stack deeper than SCAN_DEPTH: every object on it, mapped to its
// outermost context (a callback that clears ctx.circular can put one object on the
// stack twice). Contexts that descend while it lives add themselves when their
// object is not in it yet, and remove themselves when they finish.
function index_ancestors(parents: WalkContext[]): Map<object, WalkContext> {
	const deep = new Map<object, WalkContext>();
	// innermost first, so an outer context overwrites an inner one for the same object
	for (let i = parents.length - 1; i >= 0; i--) {
		const n = parents[i].node_;
		if (typeof n === 'object' && n !== null) deep.set(n, parents[i]);
	}
	return deep;
}

// walk()'s walker scans up to SCAN_DEPTH ancestors inline and calls these two only
// on a deeper stack, so a shallow walk pays one depth compare for them. The Map work
// stays out of the walker on purpose: V8 inlines the walker into descend_children
// only while its bytecode stays under 460 bytes, and without that every level of
// depth takes an extra stack frame, so the deepest walk that fits gets shallower.
function circular_deep(w: WalkState, ctx: WalkContext, node_: object): void {
	const circular = (w.deep ??= index_ancestors(w.parents)).get(node_);
	if (circular !== undefined) {
		ctx.circular = circular;
		w.deep_hit = true;
	}
}
// Around the descent of a context at `depth` > SCAN_DEPTH on the stack: it enters
// the Map (when one exists; a child's check makes it otherwise, from the stack),
// leaves it after, and the context at SCAN_DEPTH + 1 drops it, as the stack goes
// back to SCAN_DEPTH. Called beside descend_children, not around it, so a deep
// walk takes no extra stack frame per level.
//
// An object can be on the stack twice only if a check found it there and the
// callback cleared ctx.circular. Until a check in the Map finds a match
// (w.deep_hit), a context's object cannot be in it yet when it enters, and is its
// own entry when it leaves, so both skip the lookup. (A pair found by the scan sits
// in the first SCAN_DEPTH levels, whose contexts never enter or leave.)
function enter_deep(w: WalkState, ctx: WalkContext): void {
	const deep = w.deep;
	if (deep === null) return;
	const n = ctx.node_;
	if (typeof n === 'object' && n !== null && (!w.deep_hit || !deep.has(n))) deep.set(n, ctx);
}
function leave_deep(w: WalkState, ctx: WalkContext, depth: number): void {
	const deep = w.deep;
	if (deep === null) return;
	if (depth === SCAN_DEPTH + 1) {
		w.deep = null;
		w.deep_hit = false;
	} else if (!w.deep_hit || deep.get(ctx.node_) === ctx) deep.delete(ctx.node_);
}

/**
 * Depth-first walk; {@link forEach} and {@link map} use this internally.
 *
 * @example
 * ```js
 * import { walk } from 'neotraverse/modern';
 * walk({ a: { b: 1 } }, (ctx) => {
 *   if (ctx.path.join('.') === 'a.b') ctx.update(2);
 * });
 * // => { a: { b: 2 } }
 * ```
 *
 * @see https://neotraverse.puruvj.dev/guide/api/walk#t-walk
 */
export function walk(
	root: any,
	cb: (ctx: TraverseContext, v: any) => void,
	options: TraverseOptions = empty_null,
) {
	const w = make_walk_state(options);
	const { immutable, max_depth, parents, iter } = w;
	const walker = (node_: any): WalkContext => {
		// the stack holds one context per level, as w.path holds one key
		assert_within_depth(parents.length, max_depth);

		const node0 = immutable ? copy(node_, options) : node_;
		const ctx = new WalkContext(w, node_, node0);

		if (!w.alive) return ctx;

		const node0_is_obj = typeof node0 === 'object' && node0 !== null;
		if (node0_is_obj) {
			set_initial_keys(ctx, w, node0, iter);
			// 32 is SCAN_DEPTH, written out: a module const costs the walker a context
			// load and a TDZ check per use, and its bytecode is at the inlining limit
			if (parents.length <= 32) {
				for (let i = 0; i < parents.length; i++) {
					if (parents[i].node_ === node_) {
						ctx.circular = parents[i];
						break;
					}
				}
			} else circular_deep(w, ctx, node_);
		} else {
			ctx.isLeaf = true;
		}

		const ret = cb(ctx, node0);
		if (ret !== undefined) ctx.update(ret);

		const mods = ctx.mods;
		if (mods !== null) run_before(mods, ctx);

		if (!ctx.keep_going) return ctx;

		const node = ctx.node;
		const fresh = node === node0; // callback didn't replace the node — copy is ours
		const descend = fresh ? node0_is_obj : typeof node === 'object' && node !== null;
		if (descend && ctx.circular === undefined) {
			const depth = parents.push(ctx);
			if (!fresh) update_state(ctx);
			if (depth > 32) enter_deep(w, ctx);
			descend_children(w, ctx, node, walker, immutable, mods, fresh);
			if (depth > 32) leave_deep(w, ctx, depth);
			parents.pop();
		}

		if (mods !== null) run_after(mods, ctx);

		return ctx;
	};
	return walker(root).node;
}

// walk()'s before/after hooks, out of the walker to keep its bytecode small (see
// circular_deep); they run only when a callback set a hook.
function run_before(mods: Modifiers, ctx: WalkContext): void {
	if (mods.before !== undefined) mods.before(ctx, ctx.node);
}
function run_after(mods: Modifiers, ctx: WalkContext): void {
	if (mods.after !== undefined) mods.after(ctx, ctx.node);
}

// walk_async()'s circular check. Each object a context is descending into → that
// context, or a list of them: with concurrency > 1 sibling branches descend at
// once, so one object can be on several branches, and a callback that clears
// ctx.circular puts one object on a branch twice. Each entry is checked against
// the node's parent chain. Used only with concurrency > 1 (see walk_async).
type ActiveAncestors = Map<object, WalkContext | WalkContext[]>;

// The outermost ancestor of a child of `up` that holds `node_`, or undefined.
function active_circular(
	active: ActiveAncestors,
	up: WalkContext | undefined,
	node_: object,
): WalkContext | undefined {
	const hit = active.get(node_);
	if (hit === undefined || up === undefined) return undefined;
	if (!is_array(hit)) return is_ancestor(hit, up) ? hit : undefined;
	let outermost: WalkContext | undefined;
	for (let i = 0; i < hit.length; i++) {
		const c = hit[i];
		if (is_ancestor(c, up) && (outermost === undefined || c.level < outermost.level)) outermost = c;
	}
	return outermost;
}

// walk_async() with concurrency 1, on a chain deeper than SCAN_DEPTH: every object
// on the parent chain from `up`, mapped to its outermost context there.
function index_chain(up: WalkContext): Map<object, WalkContext> {
	const deep = new Map<object, WalkContext>();
	// innermost first, so an outer context overwrites an inner one for the same object
	for (
		let c: WalkContext | undefined = up;
		c !== undefined;
		c = c.parent as WalkContext | undefined
	) {
		const n = c.node_;
		if (typeof n === 'object' && n !== null) deep.set(n, c);
	}
	return deep;
}

// Whether `c` is `up` or one of its ancestors.
function is_ancestor(c: WalkContext, up: WalkContext): boolean {
	let x: WalkContext | undefined = up;
	while (x !== undefined && x.level > c.level) x = x.parent as WalkContext | undefined;
	return x === c;
}

function enter_active(active: ActiveAncestors, ctx: WalkContext): void {
	const n = ctx.node_;
	if (typeof n !== 'object' || n === null) return;
	const hit = active.get(n);
	if (hit === undefined) active.set(n, ctx);
	else if (is_array(hit)) hit.push(ctx);
	else active.set(n, [hit, ctx]);
}

function leave_active(active: ActiveAncestors, ctx: WalkContext): void {
	const n = ctx.node_;
	if (typeof n !== 'object' || n === null) return;
	const hit = active.get(n);
	if (hit === ctx) {
		active.delete(n);
	} else if (hit !== undefined && is_array(hit)) {
		const i = hit.indexOf(ctx);
		if (i !== -1) hit.splice(i, 1);
		if (hit.length === 0) active.delete(n);
	}
}

// Async twin of walk(): identical shape, but awaits the callback and the
// recursive descent — so the callback may be `async`. The structural hooks
// (before/after/pre/post) still run synchronously. Reuses WalkContext/WalkState/
// copy/update_state/safe_set verbatim; only the recursion is duplicated as async.
// An optional AbortSignal cancels the walk on the next visited node
// (`throwIfAborted` rejects the returned promise).
async function walk_async(
	root: any,
	cb: (ctx: TraverseContext, v: any) => void | Promise<void>,
	options: TraverseOptions = empty_null,
): Promise<any> {
	const w = make_walk_state(options);
	const { immutable, iter } = w;
	const signal = options.signal;
	// concurrency 1 runs one branch at a time, so the ancestors are exactly the parent
	// chain: it is scanned up to SCAN_DEPTH levels and indexed deeper, as in walk().
	// With more, sibling branches overlap and the check uses `active` instead.
	const one_branch = w.concurrency === 1;
	const active: ActiveAncestors = new Map();
	let chain: Map<object, WalkContext> | null = null;
	let chain_hit = false;
	// `up` is the parent context and `key` this node's key (undefined for the root).
	const walker = async (
		node_: any,
		state: WalkState = w,
		up?: WalkContext,
		key?: PropertyKey,
	): Promise<WalkContext> => {
		signal?.throwIfAborted();
		const level = up === undefined ? 0 : up.level + 1;
		assert_within_depth(level, state.max_depth);

		const node0 = immutable ? copy(node_, options) : node_;
		const ctx = new WalkContext(state, node_, node0);
		if (up !== undefined) {
			ctx.parent = up;
			ctx.key = key;
			ctx.level = level;
			ctx.isRoot = false;
			state.owner = ctx;
		}

		if (!state.alive) return ctx;

		const node0_is_obj = typeof node0 === 'object' && node0 !== null;
		if (node0_is_obj) {
			set_initial_keys(ctx, state, node0, iter);
			if (!one_branch) {
				const circular = active_circular(active, up, node_);
				if (circular !== undefined) ctx.circular = circular;
			} else if (level <= SCAN_DEPTH) {
				// the parent chain, innermost first: the last match is the outermost
				for (let c = up; c !== undefined; c = c.parent as WalkContext | undefined) {
					if (c.node_ === node_) ctx.circular = c;
				}
			} else {
				const circular = (chain ??= index_chain(up as WalkContext)).get(node_);
				if (circular !== undefined) {
					ctx.circular = circular;
					chain_hit = true;
				}
			}
		} else {
			ctx.isLeaf = true;
		}

		const ret = await cb(ctx, node0);
		if (ret !== undefined) ctx.update(ret);

		const mods = ctx.mods;
		if (mods !== null && mods.before !== undefined) mods.before(ctx, ctx.node);

		if (!ctx.keep_going) return ctx;

		const node = ctx.node;
		const descend = node === node0 ? node0_is_obj : typeof node === 'object' && node !== null;
		if (descend && ctx.circular === undefined) {
			if (state.owner === null) state.parents.push(ctx);
			else state.descending = true;
			if (!one_branch) enter_active(active, ctx);
			else if (
				level >= SCAN_DEPTH &&
				chain !== null &&
				typeof node_ === 'object' &&
				node_ !== null
			) {
				// skip the lookup until a check found a match (see enter_deep)
				if (!chain_hit || !chain.has(node_)) chain.set(node_, ctx);
			}
			if (node !== node0) update_state(ctx);
			await descend_children_async(state, ctx, node, walker, immutable, mods);
			if (!one_branch) leave_active(active, ctx);
			else if (level >= SCAN_DEPTH && chain !== null) {
				// the context at SCAN_DEPTH drops the Map, as the chain goes back to it
				if (level === SCAN_DEPTH) {
					chain = null;
					chain_hit = false;
				} else if (!chain_hit || chain.get(node_) === ctx) chain.delete(node_);
			}
			if (state.owner === null) state.parents.pop();
			else state.descending = false;
		}

		if (mods !== null && mods.after !== undefined) mods.after(ctx, ctx.node);

		return ctx;
	};
	return (await walker(root)).node;
}

async function descend_children_async(
	w: WalkState,
	ctx: WalkContext,
	node: any,
	walker: (node_: any, state: WalkState, up: WalkContext, key: PropertyKey) => Promise<WalkContext>,
	immutable: boolean,
	mods: Modifiers | null,
): Promise<void> {
	const pre = mods !== null ? mods.pre : undefined;
	const post = mods !== null ? mods.post : undefined;
	const limit = w.concurrency;
	const visitOne = async (key: PropertyKey, childVal: any, index: number, last: number) => {
		// One state per child, so stop() stops that child's subtree only. It copies
		// no arrays: the child's path comes from its parent chain, and its `parents`
		// is built on first read (build_parents), so a child costs O(1), not O(depth).
		const childState: WalkState = {
			alive: w.alive,
			immutable: w.immutable,
			iter: w.iter,
			max_depth: w.max_depth,
			path: NO_PATH,
			parents: NO_PARENTS,
			descend_map_set: w.descend_map_set,
			concurrency: w.concurrency,
			deep: null,
			deep_hit: false,
			owner: null,
			descending: false,
		};
		if (pre !== undefined) pre(ctx, childVal, key);
		const child = await walker(childVal, childState, ctx, key);
		// Mirror the sync descend writeback (incl. Map/Set entries, C-9), but only when
		// the slot doesn't already hold child.node — unchanged leaves and values that
		// ctx.update() already wrote are skipped (DEEP-1).
		if (immutable && !child.removed) {
			if (node instanceof Map) {
				if (node.get(key) !== child.node) node.set(key, child.node);
			} else if (node instanceof Set) {
				if (childVal !== child.node) {
					node.delete(childVal);
					node.add(child.node);
				}
			} else if (
				node[key] !== child.node &&
				has_own_property.call(node, key) &&
				!is_non_writable(node, key)
			) {
				safe_set(node, key, child.node);
			}
		}
		child.isLast = index === last;
		child.isFirst = index === 0;
		if (post !== undefined) post(ctx, child);
	};
	if (w.descend_map_set && node instanceof Map) {
		const entries = [...node.entries()];
		const last = entries.length - 1;
		for (let start = 0; start <= last; start += limit) {
			if (!w.alive && !immutable) break; // stop() — don't launch further sibling batches (W2)
			const end = Math.min(last, start + limit - 1);
			const tasks: Promise<void>[] = [];
			for (let index = start; index <= end; index++) {
				const [key, val] = entries[index];
				tasks.push(visitOne(key, val, index, last));
			}
			await Promise.all(tasks);
		}
		return;
	}
	if (w.descend_map_set && node instanceof Set) {
		const vals = [...node];
		const last = vals.length - 1;
		for (let start = 0; start <= last; start += limit) {
			if (!w.alive && !immutable) break; // stop() — don't launch further sibling batches (W2)
			const end = Math.min(last, start + limit - 1);
			const tasks: Promise<void>[] = [];
			for (let index = start; index <= end; index++) {
				tasks.push(visitOne(index, vals[index], index, last));
			}
			await Promise.all(tasks);
		}
		return;
	}
	const keys = ctx.keys as PropertyKey[];
	const last = keys.length - 1;
	for (let start = 0; start <= last; start += limit) {
		const end = Math.min(last, start + limit - 1);
		const tasks: Promise<void>[] = [];
		for (let index = start; index <= end; index++) {
			const key = keys[index];
			tasks.push(visitOne(key, node[key], index, last));
		}
		await Promise.all(tasks);
	}
}

interface BfsQueueItem {
	node_: any;
	parents: WalkContext[];
	parent: WalkContext | undefined;
	key: PropertyKey | undefined;
	level: number;
}

function walk_bfs(
	root: any,
	cb: (ctx: TraverseContext, v: any) => void,
	options: TraverseOptions = empty_null,
): any {
	const w = make_walk_state(options);
	const immutable = w.immutable;
	const iter = w.iter;
	const queue: BfsQueueItem[] = [
		{ node_: root, parents: [], parent: undefined, key: undefined, level: 0 },
	];
	let head = 0;
	let rootOut = root;
	while (head < queue.length && w.alive) {
		const item = queue[head++];
		const { node_, parents, parent, key, level } = item;
		assert_within_depth(level, w.max_depth);

		// `parents` (the ancestor array) is still threaded for ctx.parents + circular
		// detection — but it's shared per-parent, not per-child. The per-node path is
		// derived lazily from the parent chain (ctx.parent/level), so callbacks that
		// never read ctx.path pay no per-node path allocation (P-5).
		w.parents = parents;

		const node0 = immutable ? copy(node_, options) : node_;
		const ctx = new WalkContext(w, node_, node0);
		ctx.parent = parent;
		ctx.key = key;
		ctx.level = level;
		ctx.isRoot = level === 0;

		const node0_is_obj = typeof node0 === 'object' && node0 !== null;
		if (node0_is_obj) {
			set_initial_keys(ctx, w, node0, iter);
			for (let i = 0; i < parents.length; i++) {
				if (parents[i].node_ === node_) {
					ctx.circular = parents[i];
					break;
				}
			}
		} else {
			ctx.isLeaf = true;
		}

		const ret = cb(ctx, node0);
		if (ret !== undefined) ctx.update(ret);
		if (level === 0) rootOut = ctx.node;

		// Write back into the parent copy only when the slot doesn't already hold the
		// value — unchanged leaves are already present from the parent's copy, and
		// ctx.update() may have written it during the callback (DEEP-1). This also
		// skips the gopd for those nodes.
		if (immutable && parent !== undefined) {
			const pk = key as PropertyKey;
			if (
				parent.node[pk] !== ctx.node &&
				has_own_property.call(parent.node, pk) &&
				!is_non_writable(parent.node, pk)
			) {
				safe_set(parent.node, pk, ctx.node);
			}
		}

		const mods = ctx.mods;
		if (mods !== null && mods.before !== undefined) mods.before(ctx, ctx.node);

		if (!ctx.keep_going) {
			if (mods !== null && mods.after !== undefined) mods.after(ctx, ctx.node);
			continue;
		}

		const node = ctx.node;
		const descend = node === node0 ? node0_is_obj : typeof node === 'object' && node !== null;
		if (!descend || ctx.circular !== undefined) {
			if (mods !== null && mods.after !== undefined) mods.after(ctx, ctx.node);
			continue;
		}

		if (node !== node0) update_state(ctx);
		const keys = ctx.keys as PropertyKey[];
		const childParents = parents.concat(ctx);
		const childLevel = level + 1;
		const last = keys.length - 1;
		const pre = mods !== null ? mods.pre : undefined;

		if (w.descend_map_set && node instanceof Map) {
			const entries = [...node.entries()];
			for (let index = 0; index <= last; index++) {
				const [k, val] = entries[index];
				if (pre !== undefined) pre(ctx, val, k);
				queue.push({ node_: val, parents: childParents, parent: ctx, key: k, level: childLevel });
			}
		} else if (w.descend_map_set && node instanceof Set) {
			const vals = [...node];
			for (let index = 0; index <= last; index++) {
				if (pre !== undefined) pre(ctx, vals[index], index);
				queue.push({
					node_: vals[index],
					parents: childParents,
					parent: ctx,
					key: index,
					level: childLevel,
				});
			}
		} else {
			for (let index = 0; index <= last; index++) {
				const k = keys[index];
				const childVal = node[k];
				if (pre !== undefined) pre(ctx, childVal, k);
				queue.push({
					node_: childVal,
					parents: childParents,
					parent: ctx,
					key: k,
					level: childLevel,
				});
			}
		}

		if (mods !== null && mods.after !== undefined) mods.after(ctx, ctx.node);
	}
	return rootOut;
}

/**
 * Breadth-first {@link forEach}; visit order is level-by-level, not depth-first.
 *
 * @example
 * ```js
 * import { breadthFirst } from 'neotraverse/modern';
 * const order = [];
 * breadthFirst({ a: 1, b: { c: 2 } }, (ctx) => order.push(ctx.path.join('.')));
 * // order => ['', 'a', 'b', 'b.c']
 * ```
 *
 * @see https://neotraverse.puruvj.dev/guide/api/walk#t-bfs
 */
export function breadthFirst(
	obj: any,
	cb: (ctx: TraverseContext, v: any) => void,
	options?: TraverseOptions,
): any {
	return walk_bfs(obj, cb, options);
}

/**
 * Breadth-first {@link map} (immutable clone with callback writeback).
 *
 * @example
 * ```js
 * import { mapBfs } from 'neotraverse/modern';
 * mapBfs({ items: [{ n: 1 }, { n: 2 }] }, (ctx, v) => {
 *   if (typeof v === 'number') ctx.update(v * 10);
 * });
 * // => { items: [{ n: 10 }, { n: 20 }] }
 * ```
 *
 * @see https://neotraverse.puruvj.dev/guide/api/walk#t-bfs
 */
export function mapBfs(
	obj: any,
	cb: (ctx: TraverseContext, v: any) => void,
	options?: TraverseOptions,
): any {
	return walk_bfs(obj, cb, { ...options, immutable: true });
}

/**
 * Callback helper: calls {@link TraverseContext.block} when `pred` is truthy.
 * Compose with other callbacks in a single {@link forEach} / {@link map} pass.
 *
 * @example
 * ```js
 * import { forEach, skipWhere } from 'neotraverse/modern';
 * forEach({ a: 1, b: 2 }, skipWhere((ctx) => ctx.key === 'a'));
 * // visits only { b: 2 }
 * ```
 *
 * @see https://neotraverse.puruvj.dev/guide/api/walk#t-skip-where
 */
export function skipWhere(
	pred: (ctx: TraverseContext, value: any) => unknown,
): (ctx: TraverseContext, value: any) => void {
	return (ctx, value) => {
		if (pred(ctx, value)) ctx.block();
	};
}

/**
 * Bucket every visited value by `keyFn(ctx, value)` in one walk.
 *
 * @example
 * ```js
 * import { groupBy } from 'neotraverse/modern';
 * groupBy({ a: 1, b: 2, c: 3 }, (_, v) => (v % 2 ? 'odd' : 'even'));
 * // Map { 'odd' => [1, 3], 'even' => [2] }
 * ```
 *
 * @see https://neotraverse.puruvj.dev/guide/api/walk#t-group-by
 */
export function groupBy(
	obj: any,
	keyFn: (ctx: TraverseContext, value: any) => PropertyKey,
	options?: TraverseOptions,
): Map<PropertyKey, any[]> {
	const buckets = new Map<PropertyKey, any[]>();
	forEach(
		obj,
		(ctx, v) => {
			const k = keyFn(ctx, v);
			let arr = buckets.get(k);
			if (!arr) {
				arr = [];
				buckets.set(k, arr);
			}
			arr.push(v);
		},
		options,
	);
	return buckets;
}

/**
 * @example
 * ```js
 * import { map } from 'neotraverse/modern';
 * map({ count: 1 }, (ctx, v) => {
 *   if (typeof v === 'number') ctx.update(v + 1);
 * });
 * // => { count: 2 }
 * ```
 *
 * @see https://neotraverse.puruvj.dev/guide/api/core#t-map
 * @heisenbench linear in obj
 */
export function map(
	obj: any,
	cb: (ctx: TraverseContext, v: any) => void,
	options?: TraverseOptions,
): any {
	return walk(obj, cb, { ...options, immutable: true });
}

/**
 * @example
 * ```js
 * import { forEach } from 'neotraverse/modern';
 * forEach([5, -3], (ctx, x) => { if (x < 0) ctx.update(x + 128); });
 * // => [5, 125]
 * ```
 *
 * @see https://neotraverse.puruvj.dev/guide/api/core#t-forEach
 */
export function forEach(
	obj: any,
	cb: (ctx: TraverseContext, v: any) => void,
	options?: TraverseOptions,
): any {
	return walk(obj, cb, options);
}

/**
 * @example
 * ```js
 * import { reduce } from 'neotraverse/modern';
 * reduce({ a: 1, b: 2 }, (acc, ctx, x) => acc + (typeof x === 'number' ? x : 0), 0);
 * // => 3
 * ```
 *
 * @see https://neotraverse.puruvj.dev/guide/api/core#t-reduce
 * @heisenbench linear in obj
 */
export function reduce(
	obj: any,
	cb: (ctx: TraverseContext, acc: any, v: any) => any,
	init?: any,
	options?: TraverseOptions,
): any {
	const skip = arguments.length === 2;
	let acc = skip ? obj : init;
	forEach(
		obj,
		(ctx, x) => {
			if (!ctx.isRoot || !skip) {
				acc = cb(ctx, acc, x);
			}
		},
		options,
	);
	return acc;
}

/**
 * @example
 * ```js
 * import { find } from 'neotraverse/modern';
 * find({ a: 1, b: 5 }, (_, v) => v > 3);
 * // => 5
 * ```
 *
 * @see https://neotraverse.puruvj.dev/guide/api/query#t-query
 */
export function find(
	obj: any,
	fn: (ctx: TraverseContext, v: any) => unknown,
	options?: TraverseOptions,
): any {
	let result: any;
	forEach(
		obj,
		(ctx, x) => {
			if (fn(ctx, x)) {
				result = x;
				ctx.stop();
			}
		},
		options,
	);
	return result;
}

/**
 * @example
 * ```js
 * import { filter } from 'neotraverse/modern';
 * filter({ a: 1, b: 2, c: 3 }, (_, v) => typeof v === 'number' && v % 2 === 0);
 * // => [2]
 * ```
 *
 * @see https://neotraverse.puruvj.dev/guide/api/query#t-query
 */
export function filter(
	obj: any,
	fn: (ctx: TraverseContext, v: any) => unknown,
	options?: TraverseOptions,
): any[] {
	const acc: any[] = [];
	forEach(
		obj,
		(ctx, x) => {
			if (fn(ctx, x)) acc.push(x);
		},
		options,
	);
	return acc;
}

/**
 * @example
 * ```js
 * import { some } from 'neotraverse/modern';
 * some({ a: 1, b: 2 }, (_, v) => v > 1);
 * // => true
 * ```
 *
 * @see https://neotraverse.puruvj.dev/guide/api/query#t-query
 */
export function some(
	obj: any,
	fn: (ctx: TraverseContext, v: any) => unknown,
	options?: TraverseOptions,
): boolean {
	let result = false;
	forEach(
		obj,
		(ctx, x) => {
			if (fn(ctx, x)) {
				result = true;
				ctx.stop();
			}
		},
		options,
	);
	return result;
}

/**
 * @example
 * ```js
 * import { every } from 'neotraverse/modern';
 * every({ a: 2, b: 4 }, (_, v) => typeof v !== 'number' || v % 2 === 0);
 * // => true
 * ```
 *
 * @see https://neotraverse.puruvj.dev/guide/api/query#t-query
 */
export function every(
	obj: any,
	fn: (ctx: TraverseContext, v: any) => unknown,
	options?: TraverseOptions,
): boolean {
	let result = true;
	forEach(
		obj,
		(ctx, x) => {
			if (!fn(ctx, x)) {
				result = false;
				ctx.stop();
			}
		},
		options,
	);
	return result;
}

/**
 * @example
 * ```js
 * import { paths } from 'neotraverse/modern';
 * paths({ a: { b: 1 } });
 * // => [[], ['a'], ['a', 'b']]
 * ```
 *
 * @see https://neotraverse.puruvj.dev/guide/api/core#t-paths-nodes
 */
export function paths(obj: any, options?: TraverseOptions): PropertyKey[][] {
	const acc: PropertyKey[][] = [];
	forEach(
		obj,
		(ctx) => {
			acc.push(ctx.path);
		},
		options,
	);
	return acc;
}

/**
 * @example
 * ```js
 * import { nodes } from 'neotraverse/modern';
 * nodes({ x: 1, y: { z: 2 } }).filter((v) => typeof v === 'number');
 * // => [1, 2]
 * ```
 *
 * @see https://neotraverse.puruvj.dev/guide/api/core#t-paths-nodes
 * @heisenbench linear in obj
 */
export function nodes(obj: any, options?: TraverseOptions): any[] {
	const acc: any[] = [];
	forEach(
		obj,
		(ctx) => {
			acc.push(ctx.node);
		},
		options,
	);
	return acc;
}

/**
 * Lazy `[path, node]` pairs in depth-first order.
 *
 * @example
 * ```js
 * import { entries } from 'neotraverse/modern';
 * [...entries({ a: 1 })];
 * // => [[[], { a: 1 }], [['a'], 1]]
 * ```
 *
 * @see https://neotraverse.puruvj.dev/guide/api/iteration#t-entries
 */
export function* entries(obj: any, options?: TraverseOptions): Generator<[PropertyKey[], any]> {
	yield* iterate(
		obj,
		[],
		options?.includeSymbols ? own_enumerable_keys : object_keys,
		new Set(),
		options?.maxDepth,
		0,
	);
}

/**
 * Lazy node values in depth-first order.
 *
 * @example
 * ```js
 * import { values } from 'neotraverse/modern';
 * [...values({ a: 1, b: 2 })];
 * // => [{ a: 1, b: 2 }, 1, 2]
 * ```
 *
 * @see https://neotraverse.puruvj.dev/guide/api/iteration#t-values
 */
export function* values(obj: any, options?: TraverseOptions): Generator<any> {
	yield* iterate_values(
		obj,
		options?.includeSymbols ? own_enumerable_keys : object_keys,
		new Set(),
		options?.maxDepth,
		0,
	);
}

// Value-only twin of iterate(): skips the per-node path.concat that entries() needs,
// so values() allocates nothing per node beyond the generator frames (P-5).
function* iterate_values(
	node: any,
	iter: (obj: object) => PropertyKey[],
	seen: Set<object>,
	max_depth: number | undefined,
	depth: number,
): Generator<any> {
	yield node;
	if (typeof node !== 'object' || node === null) return;
	if (seen.has(node)) return; // circular — visited, but don't descend
	assert_within_depth(depth, max_depth);
	seen.add(node);
	const keys = iter(node);
	for (let i = 0; i < keys.length; i++) {
		yield* iterate_values(node[keys[i]], iter, seen, max_depth, depth + 1);
	}
	seen.delete(node);
}

/**
 * @example
 * ```js
 * import { values } from 'neotraverse/modern';
 * [...values({ a: 1, b: 2 })].filter((v) => typeof v === 'number');
 * // => [1, 2]
 * ```
 *
 * @see https://neotraverse.puruvj.dev/guide/api/async#t-async
 * @heisenbench linear in obj
 */
export async function forEachAsync(
	obj: any,
	cb: (ctx: TraverseContext, v: any) => void | Promise<void>,
	options?: TraverseOptions,
): Promise<any> {
	return walk_async(obj, cb, options);
}

/**
 * @example
 * ```js
 * import { mapAsync } from 'neotraverse/modern';
 * await mapAsync({ n: 1 }, async (ctx, v) => {
 *   if (typeof v === 'number') ctx.update(v * 2);
 * });
 * // => { n: 2 }
 * ```
 *
 * @see https://neotraverse.puruvj.dev/guide/api/async#t-async
 * @heisenbench linear in obj
 */
export async function mapAsync(
	obj: any,
	cb: (ctx: TraverseContext, v: any) => void | Promise<void>,
	options?: TraverseOptions,
): Promise<any> {
	return walk_async(obj, cb, { ...options, immutable: true });
}

/**
 * @example
 * ```js
 * import { count } from 'neotraverse/modern';
 * count({ a: 1, b: 2, c: 3 }, (_, v) => typeof v === 'number' && v > 1);
 * // => 2
 * ```
 *
 * @see https://neotraverse.puruvj.dev/guide/api/paths#t-count
 */
export function count(
	obj: any,
	fn?: (ctx: TraverseContext, v: any) => unknown,
	options?: TraverseOptions,
): number {
	let n = 0;
	forEach(
		obj,
		(ctx, x) => {
			if (!fn || fn(ctx, x)) n++;
		},
		options,
	);
	return n;
}

/**
 * @example
 * ```js
 * import { size } from 'neotraverse/modern';
 * size({ a: { b: 1 }, c: 2 }); // => 4 (root + a + b + c)
 * ```
 *
 * @see https://neotraverse.puruvj.dev/guide/api/paths#t-count
 */
export function size(obj: any, options?: TraverseOptions): number {
	return count(obj, undefined, options);
}

/**
 * @example
 * ```js
 * import { deleteWhere } from 'neotraverse/modern';
 * deleteWhere({ token: 'secret', ok: true }, (_, x) => x === 'secret');
 * // => { ok: true }
 * ```
 *
 * @see https://neotraverse.puruvj.dev/guide/api/structural#t-prune
 */
export function deleteWhere(
	obj: any,
	fn: (ctx: TraverseContext, v: any) => unknown,
	options?: TraverseOptions,
): any {
	return map(
		obj,
		(ctx, x) => {
			if (fn(ctx, x)) ctx.remove();
		},
		options,
	);
}

/**
 * @example
 * ```js
 * import { prune } from 'neotraverse/modern';
 * prune({ a: 1, b: 2 }, (_, v) => typeof v !== 'number' || v < 2);
 * // => { a: 1 }
 * ```
 *
 * @see https://neotraverse.puruvj.dev/guide/api/structural#t-prune
 */
export function prune(
	obj: any,
	fn: (ctx: TraverseContext, v: any) => unknown,
	options?: TraverseOptions,
): any {
	return deleteWhere(obj, (ctx, x) => !fn(ctx, x), options);
}

/**
 * Return a deep clone of `obj` with every own `__proto__` / `constructor` / `prototype`
 * key removed at every level. Use this at a **trust boundary**: before handing untrusted
 * parsed JSON to code that is NOT prototype-pollution-hardened (a naive deep-merge, an ORM,
 * a template engine). neotraverse's own operations already neutralize these keys, so you
 * don't need `sanitize` for them.
 *
 * Scope: this removes the **key-injection** pollution vector only. It does NOT bound depth
 * or size, and it does not sanitize path-based writes (`set(obj, untrustedPath, v)` is a
 * separate vector). It is not a general "make this object safe" guarantee.
 *
 * @example
 * ```js
 * import { sanitize } from 'neotraverse/modern';
 * const safe = sanitize(JSON.parse(untrustedBody));
 * naiveDeepMerge(target, safe); // can't pollute via __proto__/constructor/prototype
 * ```
 *
 * @see https://neotraverse.puruvj.dev/guide/api/structural#t-sanitize
 */
export function sanitize(obj: any, options?: TraverseOptions): any {
	return deleteWhere(obj, (ctx) => is_unsafe_key(ctx.key as PropertyKey), options);
}

/**
 * @example
 * ```js
 * import { pruneDeep } from 'neotraverse/modern';
 * pruneDeep({ a: { b: { c: 1 } } }, 2);
 * // => { a: { b: null } }
 * ```
 *
 * @see https://neotraverse.puruvj.dev/guide/api/structural#t-prune-deep
 */
export function pruneDeep(
	obj: any,
	maxDepth: number,
	replacement: any = null,
	options?: TraverseOptions,
): any {
	return map(
		obj,
		(ctx) => {
			if (ctx.level > maxDepth) {
				ctx.update(replacement);
				ctx.block();
			}
		},
		options,
	);
}

/**
 * @example
 * ```js
 * import { freeze } from 'neotraverse/modern';
 * const o = freeze({ nested: { n: 1 } });
 * Object.isFrozen(o.nested); // => true
 * ```
 *
 * @see https://neotraverse.puruvj.dev/guide/api/structural#t-freeze
 */
export function freeze(obj: any, options?: TraverseOptions): any {
	forEach(
		obj,
		(ctx) => {
			ctx.after(() => {
				const n = ctx.node;
				if (typeof n === 'object' && n !== null) Object.freeze(n);
			});
		},
		options,
	);
	return obj;
}

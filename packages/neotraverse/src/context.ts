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
		return this.w.parents;
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
		sib.keys = initial_keys(w, sibNode, w.iter);
		sib.isLeaf = sib.keys.length === 0;
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
	if (w.descend_map_set && node instanceof Map) {
		const entries = [...node.entries()];
		const last = entries.length - 1;
		for (let index = 0; index <= last; index++) {
			if (!w.alive && !immutable) break; // stop() — don't allocate contexts for remaining siblings (W2)
			const [key, val] = entries[index];
			path.push(key);
			if (pre !== undefined) pre(ctx, val, key);
			const child = walker(val);
			// write the value back into the cloned Map entry only if it changed (C-9, DEEP-1)
			if (immutable && child.node !== val) (node as Map<any, any>).set(key, child.node);
			child.isLast = index === last;
			child.isFirst = index === 0;
			if (post !== undefined) post(ctx, child);
			path.pop();
		}
		return;
	}
	if (w.descend_map_set && node instanceof Set) {
		const vals = [...node];
		const last = vals.length - 1;
		for (let index = 0; index <= last; index++) {
			if (!w.alive && !immutable) break; // stop() — don't allocate contexts for remaining siblings (W2)
			path.push(index);
			if (pre !== undefined) pre(ctx, vals[index], index);
			const child = walker(vals[index]);
			// rewrite the cloned Set member if the callback replaced it (C-9)
			if (immutable && child.node !== vals[index]) {
				(node as Set<any>).delete(vals[index]);
				(node as Set<any>).add(child.node);
			}
			child.isLast = index === last;
			child.isFirst = index === 0;
			if (post !== undefined) post(ctx, child);
			path.pop();
		}
		return;
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

function initial_keys(
	w: WalkState,
	node0: object,
	iter: (obj: object) => PropertyKey[],
): PropertyKey[] {
	if (w.descend_map_set && node0 instanceof Map) return map_set_child_keys(node0);
	if (w.descend_map_set && node0 instanceof Set) return map_set_child_keys(node0);
	const keys = iter(node0);
	return is_array(node0) ? array_keys(node0, keys) : keys;
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
		assert_within_depth(w.path.length, max_depth);

		const node0 = immutable ? copy(node_, options) : node_;
		const ctx = new WalkContext(w, node_, node0);

		if (!w.alive) return ctx;

		const node0_is_obj = typeof node0 === 'object' && node0 !== null;
		if (node0_is_obj) {
			const keys0 = initial_keys(w, node0, iter);
			ctx.keys = keys0;
			ctx.isLeaf = keys0.length === 0;
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

		const mods = ctx.mods;
		if (mods !== null && mods.before !== undefined) mods.before(ctx, ctx.node);

		if (!ctx.keep_going) return ctx;

		const node = ctx.node;
		const fresh = node === node0; // callback didn't replace the node — copy is ours
		const descend = fresh ? node0_is_obj : typeof node === 'object' && node !== null;
		if (descend && ctx.circular === undefined) {
			parents.push(ctx);
			if (!fresh) update_state(ctx);
			descend_children(w, ctx, node, walker, immutable, mods, fresh);
			parents.pop();
		}

		if (mods !== null && mods.after !== undefined) mods.after(ctx, ctx.node);

		return ctx;
	};
	return walker(root).node;
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
	const walker = async (node_: any, state: WalkState = w): Promise<WalkContext> => {
		signal?.throwIfAborted();
		assert_within_depth(state.path.length, state.max_depth);

		const node0 = immutable ? copy(node_, options) : node_;
		const ctx = new WalkContext(state, node_, node0);

		if (!state.alive) return ctx;

		const node0_is_obj = typeof node0 === 'object' && node0 !== null;
		if (node0_is_obj) {
			const keys0 = initial_keys(state, node0, iter);
			ctx.keys = keys0;
			ctx.isLeaf = keys0.length === 0;
			for (let i = 0; i < state.parents.length; i++) {
				if (state.parents[i].node_ === node_) {
					ctx.circular = state.parents[i];
					break;
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
			state.parents.push(ctx);
			if (node !== node0) update_state(ctx);
			await descend_children_async(state, ctx, node, walker, immutable, mods);
			state.parents.pop();
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
	walker: (node_: any, state?: WalkState) => Promise<WalkContext>,
	immutable: boolean,
	mods: Modifiers | null,
): Promise<void> {
	const { path, parents } = w;
	const pre = mods !== null ? mods.pre : undefined;
	const post = mods !== null ? mods.post : undefined;
	const limit = w.concurrency;
	const visitOne = async (key: PropertyKey, childVal: any, index: number, last: number) => {
		const childState: WalkState = {
			alive: w.alive,
			immutable: w.immutable,
			iter: w.iter,
			max_depth: w.max_depth,
			path: path.slice(),
			parents: parents.slice(),
			descend_map_set: w.descend_map_set,
			concurrency: w.concurrency,
		};
		childState.path.push(key);
		if (pre !== undefined) pre(ctx, childVal, key);
		const child = await walker(childVal, childState);
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
			const keys0 = initial_keys(w, node0, iter);
			ctx.keys = keys0;
			ctx.isLeaf = keys0.length === 0;
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

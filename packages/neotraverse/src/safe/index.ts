// neotraverse/safe — the stack-safe, memory-bounded, pollution-safe traversal
// core. Twelve runtime exports. A companion to the default fast path (not a
// replacement): reach for it when you need to survive adversarially-deep or
// untrusted input without a stack overflow, stream/early-exit large trees with
// bounded memory, or rewrite trees copy-on-write. ESM-only, zero runtime deps,
// Node >= 22. A bit slower than the default on full eager scans; far safer.

// READ
export { visit, Visit, type Visits, type VisitOptions } from './visit.js';

// WRITE
export {
	transform,
	type Command,
	type Edits,
	type Rules,
	type TransformOptions,
	type Visitor,
} from './transform.js';
export {
	transformAsync,
	type AsyncRules,
	type AsyncVisitor,
	type TransformAsyncOptions,
} from './transform-async.js';

// PATH
export { get, set, has, type Get, type Path, type SetValue, type WriteOptions } from './path.js';

// STRUCTURAL
export { clone, type CloneOptions } from './clone.js';
export { equal, type EqualOptions } from './equal.js';
export {
	merge,
	type ArrayStrategy,
	type DeepPartial,
	type Merge,
	type MergeOptions,
} from './merge.js';
export { diff, patch, type DiffOptions, type PatchOp } from './diff.js';

// $REF
export { resolveRefs, type RefOptions } from './refs.js';

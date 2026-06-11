// neotraverse — the default (root) export is the tree-shakeable functional API.
//
// This barrel is functional-only by design. The deprecated `Traverse` class is NOT
// re-exported here; import it from `neotraverse/modern` if you still need it. The
// classic `traverse`-compatible build lives at `neotraverse/legacy`.
//
// `./modern.ts` re-exports everything below (via `export *`) plus `Traverse`.

export { clone } from './clone.js';
export {
	breadthFirst,
	count,
	deleteWhere,
	entries,
	every,
	filter,
	find,
	forEach,
	forEachAsync,
	freeze,
	groupBy,
	map,
	mapAsync,
	mapBfs,
	nodes,
	paths,
	prune,
	pruneDeep,
	reduce,
	sanitize,
	size,
	skipWhere,
	some,
	values,
	walk,
} from './context.js';
export type {
	DeepEqualOptions,
	DereferenceOptions,
	MergeOptions,
	PatchOp,
	ToJSONOptions,
} from './ops.js';
export { deepEqual, dereference, diff, merge, patch, toJSON } from './ops.js';
export type { PathNode } from './path.js';
export {
	filterPaths,
	findPaths,
	get,
	getPath,
	has,
	hasPath,
	parseDotPath,
	parseGlob,
	parseJsonPointer,
	parsePath,
	pointerPath,
	select,
	set,
	setPath,
} from './path.js';
export type { TraverseContext, TraverseNodeType, TraverseOptions } from './utils.js';
export { getType } from './utils.js';

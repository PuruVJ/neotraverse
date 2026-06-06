/**
 * Canonical documentation URLs for public API symbols.
 * Keep in sync with JSDoc `@see` tags in `modern.ts` and `index.ts`.
 *
 * @packageDocumentation
 */
export const DOCS_ORIGIN = 'https://neotraverse.puruvj.dev' as const;

/** Path + optional `#anchor` — inserts `.html` before the hash (matches static hosting). */
const g = (path: string) => {
	const hashIdx = path.indexOf('#');
	const pathname = hashIdx === -1 ? path : path.slice(0, hashIdx);
	const hash = hashIdx === -1 ? '' : path.slice(hashIdx);
	const htmlPath = pathname.endsWith('.html') ? pathname : `${pathname}.html`;
	return `${DOCS_ORIGIN}${htmlPath}${hash}` as const;
};

/** Top-level guide pages. */
export const DOC_PAGES = {
	context: g('/guide/context'),
	contextBlock: g('/guide/context#context-block'),
	contextCircular: g('/guide/context#context-circular'),
	contextSiblings: g('/guide/context#context-siblings'),
	options: g('/guide/options'),
	types: g('/guide/types#types-and-traversal'),
	security: g('/guide/security'),
	legacy: g('/legacy'),
	legacyMethods: g('/legacy#methods'),
} as const;

/** Guide section URLs keyed by export / symbol name. */
export const DOC = {
	// walk
	walk: g('/guide/api/walk#walk'),
	breadthFirst: g('/guide/api/walk#breadthFirst'),
	mapBfs: g('/guide/api/walk#breadthFirst'),
	skipWhere: g('/guide/api/walk#skipWhere'),
	groupBy: g('/guide/api/walk#groupBy'),
	merge: g('/guide/api/walk#merge'),
	dereference: g('/guide/api/walk#dereference'),

	// core
	get: g('/guide/api/core#get'),
	has: g('/guide/api/core#get'),
	set: g('/guide/api/core#get'),
	map: g('/guide/api/core#map'),
	forEach: g('/guide/api/core#forEach'),
	reduce: g('/guide/api/core#reduce'),
	paths: g('/guide/api/core#paths'),
	nodes: g('/guide/api/core#paths'),
	clone: g('/guide/api/core#clone'),

	// query
	find: g('/guide/api/query#find'),
	filter: g('/guide/api/query#find'),
	some: g('/guide/api/query#find'),
	every: g('/guide/api/query#find'),

	// iteration
	entries: g('/guide/api/iteration#entries'),
	values: g('/guide/api/iteration#values'),

	// async
	forEachAsync: g('/guide/api/async#forEachAsync'),
	mapAsync: g('/guide/api/async#forEachAsync'),

	// paths & metrics
	getType: g('/guide/api/paths#getType'),
	parsePath: g('/guide/api/paths#getPath'),
	parseDotPath: g('/guide/api/paths#getPath'),
	parseJsonPointer: g('/guide/api/paths#getPath'),
	pointerPath: g('/guide/api/paths#getPath'),
	getPath: g('/guide/api/paths#getPath'),
	hasPath: g('/guide/api/paths#getPath'),
	setPath: g('/guide/api/paths#getPath'),
	findPaths: g('/guide/api/paths#findPaths'),
	filterPaths: g('/guide/api/paths#findPaths'),
	count: g('/guide/api/paths#count'),
	size: g('/guide/api/paths#count'),
	parseGlob: g('/guide/api/paths#select'),
	select: g('/guide/api/paths#select'),

	// structural
	deleteWhere: g('/guide/api/structural#prune'),
	prune: g('/guide/api/structural#prune'),
	pruneDeep: g('/guide/api/structural#pruneDeep'),
	freeze: g('/guide/api/structural#freeze'),
	deepEqual: g('/guide/api/structural#deepEqual'),
	toJSON: g('/guide/api/structural#toJSON'),
	diff: g('/guide/api/structural#diff'),
	patch: g('/guide/api/structural#diff'),

	// context (TraverseContext)
	update: g('/guide/context'),
	remove: g('/guide/context'),
	delete: g('/guide/context'),
	before: g('/guide/context'),
	after: g('/guide/context'),
	pre: g('/guide/context'),
	post: g('/guide/context'),
	stop: g('/guide/context'),
	block: g('/guide/context#context-block'),
	nextSibling: g('/guide/context#context-siblings'),
	prevSibling: g('/guide/context#context-siblings'),
	circular: g('/guide/context#context-circular'),

	// legacy default export
	Traverse: g('/legacy#methods'),
	traverse: g('/legacy#quick-start'),
} as const;

// v2 kernel — the pattern language compiler. Entire grammar (normative):
//
//   pattern  :=  segment ( '.' segment )*
//   segment  :=  literal              exact key, matched via String(key)
//             |  '*'                  exactly one segment, any key
//             |  '**'                 zero or more segments (self-loop state)
//             |  '{' lit (',' lit)* '}'  one segment, any of the listed literals
//   escapes  :=  '\.' '\*' '\{' '\}' '\,' '\\'  inside literals
//
// Compiled once per string (memoized, capped Map) into an NFA whose states are
// pattern positions; live states ride each cursor frame as a bitmask integer
// (<= 31 states) with a Set<number> fallback for absurdly long patterns.
// Matching is anchored to the full path. Symbol keys match only '*'/'**'.
// The point is PRUNING: a child is descended only if some state survives.

type Seg =
	| { kind: 'lit'; key: string }
	| { kind: 'any' }
	| { kind: 'deep' }
	| { kind: 'alt'; keys: ReadonlySet<string> };

/** Opaque live-state set: bitmask int on the fast path, Set<number> beyond 30 segments. */
export type MatchStates = number | Set<number>;

export interface Matcher {
	/** Live states at the root, epsilon-closed. */
	readonly initial: MatchStates;
	/** Consume one path segment. Returns the closed next state set (0/empty = dead). */
	step(states: MatchStates, key: PropertyKey): MatchStates;
	/** True when the full pattern is matched at this node. */
	accepts(states: MatchStates): boolean;
	/** True when some descendant could still match — the descent-pruning test. */
	viable(states: MatchStates): boolean;
}

function unescape(raw: string): string {
	if (raw.indexOf('\\') === -1) return raw;
	let out = '';
	for (let i = 0; i < raw.length; i++) {
		if (raw[i] === '\\' && i + 1 < raw.length) {
			out += raw[++i];
		} else {
			out += raw[i];
		}
	}
	return out;
}

// Split on a delimiter, honoring backslash escapes. Keeps the raw (escaped)
// pieces; callers unescape after structural parsing.
function split_escaped(src: string, delim: string): string[] {
	const parts: string[] = [];
	let cur = '';
	for (let i = 0; i < src.length; i++) {
		const c = src[i];
		if (c === '\\' && i + 1 < src.length) {
			cur += c + src[++i];
			continue;
		}
		if (c === delim) {
			parts.push(cur);
			cur = '';
			continue;
		}
		cur += c;
	}
	parts.push(cur);
	return parts;
}

function parse(pattern: string): Seg[] {
	if (pattern === '') return [];
	return split_escaped(pattern, '.').map((raw): Seg => {
		if (raw === '*') return { kind: 'any' };
		if (raw === '**') return { kind: 'deep' };
		if (raw.startsWith('{') && raw.endsWith('}') && raw.length >= 2) {
			const inner = raw.slice(1, -1);
			// Drop empty alternatives so `{}`, `{,}`, `{a,}` don't spuriously match the
			// empty-string key — an empty key set matches nothing.
			const keys = new Set(
				split_escaped(inner, ',')
					.map(unescape)
					.filter((k) => k !== ''),
			);
			return { kind: 'alt', keys };
		}
		return { kind: 'lit', key: unescape(raw) };
	});
}

// --- bitmask path (n <= 30: states fit one int; bit i = position i) ---------

function close_mask(mask: number, segs: Seg[]): number {
	// epsilon: '**' matches zero segments, so a live state AT a deep segment
	// also lights the next position; cascades across consecutive '**'.
	for (let i = 0; i < segs.length; i++) {
		if (segs[i].kind === 'deep' && mask & (1 << i)) mask |= 1 << (i + 1);
	}
	return mask;
}

class MaskMatcher implements Matcher {
	readonly initial: number;
	private readonly segs: Seg[];
	private readonly n: number;
	constructor(segs: Seg[]) {
		this.segs = segs;
		this.n = segs.length;
		this.initial = close_mask(1, segs);
	}
	step(states: MatchStates, key: PropertyKey): number {
		const segs = this.segs;
		const mask = states as number;
		const is_symbol = typeof key === 'symbol';
		const s = is_symbol ? '' : String(key);
		let next = 0;
		for (let i = 0; i < this.n; i++) {
			if (!(mask & (1 << i))) continue;
			const seg = segs[i];
			switch (seg.kind) {
				case 'deep':
					next |= 1 << i; // self-loop: '**' consumes this key and stays live
					break;
				case 'any':
					next |= 1 << (i + 1);
					break;
				case 'lit':
					if (!is_symbol && seg.key === s) next |= 1 << (i + 1);
					break;
				case 'alt':
					if (!is_symbol && seg.keys.has(s)) next |= 1 << (i + 1);
					break;
			}
		}
		return close_mask(next, segs);
	}
	accepts(states: MatchStates): boolean {
		return ((states as number) & (1 << this.n)) !== 0;
	}
	viable(states: MatchStates): boolean {
		// Any live position BEFORE the accept state can still consume keys.
		// The accept state alone is a completed match with nothing below it.
		return ((states as number) & ~(1 << this.n)) !== 0;
	}
}

// --- Set fallback (patterns longer than 30 segments; pathological but legal) -

class SetMatcher implements Matcher {
	readonly initial: Set<number>;
	private readonly segs: Seg[];
	private readonly n: number;
	constructor(segs: Seg[]) {
		this.segs = segs;
		this.n = segs.length;
		this.initial = this.close(new Set([0]));
	}
	private close(states: Set<number>): Set<number> {
		for (let i = 0; i < this.n; i++) {
			if (this.segs[i].kind === 'deep' && states.has(i)) states.add(i + 1);
		}
		return states;
	}
	step(states: MatchStates, key: PropertyKey): Set<number> {
		const is_symbol = typeof key === 'symbol';
		const s = is_symbol ? '' : String(key);
		const next = new Set<number>();
		for (const i of states as Set<number>) {
			if (i >= this.n) continue;
			const seg = this.segs[i];
			if (seg.kind === 'deep') next.add(i);
			else if (seg.kind === 'any') next.add(i + 1);
			else if (seg.kind === 'lit') {
				if (!is_symbol && seg.key === s) next.add(i + 1);
			} else if (!is_symbol && seg.keys.has(s)) next.add(i + 1);
		}
		return this.close(next);
	}
	accepts(states: MatchStates): boolean {
		return (states as Set<number>).has(this.n);
	}
	viable(states: MatchStates): boolean {
		for (const i of states as Set<number>) if (i < this.n) return true;
		return false;
	}
}

// --- memoized entry point ----------------------------------------------------

const CACHE_CAP = 64;
const cache = new Map<string, Matcher>();

export function compile_pattern(pattern: string): Matcher {
	if (typeof pattern !== 'string') {
		throw new TypeError('neotraverse: pattern must be a string');
	}
	let m = cache.get(pattern);
	if (m !== undefined) return m;
	const segs = parse(pattern);
	m = segs.length <= 30 ? new MaskMatcher(segs) : new SetMatcher(segs);
	if (cache.size >= CACHE_CAP) {
		// capped: drop the oldest entry (insertion order) instead of growing forever
		cache.delete(cache.keys().next().value as string);
	}
	cache.set(pattern, m);
	return m;
}

/** Dead-state constant for "no pattern": cursor treats undefined matcher as match-all. */
export const DEAD: MatchStates = 0;

// ---------------------------------------------------------------------------
// In-source unit tests (stripped from the production build).
// ---------------------------------------------------------------------------
if (import.meta.vitest) {
	const { describe, it, expect } = import.meta.vitest;

	// Reference matcher: does the FULL key path satisfy the pattern? Used as an
	// oracle to property-check the compiled NFA.
	const naive = (pattern: string, path: PropertyKey[]): boolean => {
		const segs = parse(pattern);
		const go = (si: number, pi: number): boolean => {
			if (si === segs.length) return pi === path.length;
			const seg = segs[si];
			if (seg.kind === 'deep') {
				// zero or more segments
				if (go(si + 1, pi)) return true;
				if (pi < path.length && go(si, pi + 1)) return true;
				return false;
			}
			if (pi >= path.length) return false;
			const key = path[pi];
			const isSym = typeof key === 'symbol';
			const s = isSym ? '' : String(key);
			let ok = false;
			if (seg.kind === 'any') ok = true;
			else if (seg.kind === 'lit') ok = !isSym && seg.key === s;
			else ok = !isSym && seg.keys.has(s);
			return ok && go(si + 1, pi + 1);
		};
		return go(0, 0);
	};

	// Run a path through the compiled matcher, returning whether it accepts.
	const accepts = (pattern: string, path: PropertyKey[]): boolean => {
		const m = compile_pattern(pattern);
		let st = m.initial;
		for (const k of path) st = m.step(st, k);
		return m.accepts(st);
	};

	describe('pattern: grammar basics', () => {
		it('literal exact match', () => {
			expect(accepts('a.b', ['a', 'b'])).toBe(true);
			expect(accepts('a.b', ['a', 'c'])).toBe(false);
			expect(accepts('a.b', ['a', 'b', 'c'])).toBe(false);
		});
		it('numeric literal matches array index and string key', () => {
			expect(accepts('users.0.name', ['users', 0, 'name'])).toBe(true);
			expect(accepts('users.0.name', ['users', '0', 'name'])).toBe(true);
		});
		it('* matches exactly one segment', () => {
			expect(accepts('a.*', ['a', 'x'])).toBe(true);
			expect(accepts('a.*', ['a'])).toBe(false);
			expect(accepts('a.*', ['a', 'x', 'y'])).toBe(false);
		});
		it('** matches zero or more segments', () => {
			expect(accepts('**', [])).toBe(true);
			expect(accepts('**', ['a', 'b', 'c'])).toBe(true);
			expect(accepts('**.email', ['email'])).toBe(true);
			expect(accepts('**.email', ['a', 'b', 'email'])).toBe(true);
			expect(accepts('**.email', ['a', 'b', 'other'])).toBe(false);
		});
		it('{a,b,c} alternation', () => {
			expect(accepts('**.{password,token}', ['x', 'password'])).toBe(true);
			expect(accepts('**.{password,token}', ['x', 'token'])).toBe(true);
			expect(accepts('**.{password,token}', ['x', 'secret'])).toBe(false);
		});
		it('empty pattern matches only the root', () => {
			expect(accepts('', [])).toBe(true);
			expect(accepts('', ['a'])).toBe(false);
		});
		it('escapes a literal dot', () => {
			expect(accepts('a\\.b', ['a.b'])).toBe(true);
			expect(accepts('a\\.b', ['a', 'b'])).toBe(false);
		});
	});

	describe('pattern: viability drives pruning', () => {
		it('non-viable state stops descent', () => {
			const m = compile_pattern('a.b');
			const afterX = m.step(m.initial, 'x'); // 'x' != 'a'
			expect(m.viable(afterX)).toBe(false);
			expect(m.accepts(afterX)).toBe(false);
		});
		it('** stays viable forever', () => {
			const m = compile_pattern('**.email');
			let st = m.initial;
			for (const k of ['a', 'b', 'c', 'd']) st = m.step(st, k);
			expect(m.viable(st)).toBe(true);
		});
	});

	describe('pattern: NFA matches the naive oracle', () => {
		const patterns = ['a.b', 'a.*', '**', '**.email', 'users.*.name', '**.{x,y}', 'a.**.b'];
		const paths: PropertyKey[][] = [
			[],
			['a'],
			['a', 'b'],
			['a', 'x'],
			['users', 0, 'name'],
			['users', 1, 'email'],
			['a', 'b', 'email'],
			['x', 'y'],
			['a', 'q', 'b'],
			['a', 'b', 'c', 'd', 'email'],
		];
		it('agrees on every pattern × path combination', () => {
			for (const p of patterns) {
				for (const path of paths) {
					expect(accepts(p, path)).toBe(naive(p, path));
				}
			}
		});
	});

	describe('pattern: empty alternation never matches (regression)', () => {
		it('{} and {,}/{a,} ignore the empty-string alternative', () => {
			expect(accepts('{}', [''])).toBe(false);
			expect(accepts('{}', ['a'])).toBe(false);
			expect(accepts('{a,}', [''])).toBe(false);
			expect(accepts('{a,}', ['a'])).toBe(true);
			expect(accepts('{,b}', [''])).toBe(false);
			expect(accepts('{,b}', ['b'])).toBe(true);
		});
	});

	describe('pattern: Set fallback (>30 segments)', () => {
		it('handles long patterns identically', () => {
			const longPat = Array(35).fill('*').join('.');
			const path = Array(35).fill('k');
			expect(accepts(longPat, path)).toBe(true);
			expect(accepts(longPat, Array(34).fill('k'))).toBe(false);
		});
	});
}

// resolveRefs — replace local JSON Pointer `{ $ref: '#/...' }` objects with the
// node they point at, on a structurally shared result. Chains are followed
// iteratively (ref → ref → value) with a seen-set and path compression; nested
// refs inside a resolved target resolve too (transform descends into the
// replacement). External, unresolvable, and cyclic refs are left as-is. Built
// entirely on the public transform + get.

import { get } from './path.js';
import { transform } from './transform.js';

export interface RefOptions {
	maxDepth?: number;
}

function is_ref(node: any): node is { $ref: string } {
	return (
		node !== null &&
		typeof node === 'object' &&
		!Array.isArray(node) &&
		typeof node.$ref === 'string' &&
		Object.keys(node).length === 1 &&
		Object.getOwnPropertySymbols(node).length === 0
	);
}

const NOT_RESOLVED = Symbol('unresolved');

/**
 * Resolve local `#/json/pointer` `$ref` objects.
 *
 * @example
 * ```js
 * resolveRefs({ defs: { Pet: { type: 'object' } }, pet: { $ref: '#/defs/Pet' } });
 * // => { defs: { Pet: { type: 'object' } }, pet: { type: 'object' } }
 * ```
 */
export function resolveRefs<T>(root: T, options?: RefOptions): T;
export function resolveRefs(root: any, options?: RefOptions): any {
	const cache = new Map<string, any>();

	const resolveTarget = (ref0: string): any => {
		if (cache.has(ref0)) return cache.get(ref0);
		const seen = new Set<string>();
		const chain: string[] = [];
		let ref = ref0;
		let result: any = NOT_RESOLVED;
		for (;;) {
			if (cache.has(ref)) {
				result = cache.get(ref);
				break;
			}
			if (!ref.startsWith('#')) break; // external — leave as-is
			const pointer = ref.slice(1);
			if (pointer !== '' && !pointer.startsWith('/')) break;
			if (seen.has(pointer)) break; // cyclic $ref chain
			seen.add(pointer);
			chain.push(ref);
			const target = pointer === '' ? root : get(root, pointer);
			if (target === undefined) break; // unresolvable
			if (is_ref(target)) {
				ref = target.$ref;
				continue;
			}
			result = target;
			break;
		}
		for (let i = 0; i < chain.length; i++) cache.set(chain[i], result);
		cache.set(ref0, result);
		return result;
	};

	return transform(
		root,
		(v, edit) => {
			if (is_ref(v.value)) {
				const target = resolveTarget((v.value as { $ref: string }).$ref);
				if (target !== NOT_RESOLVED) return edit.replace(target, { descend: true });
			}
			return undefined;
		},
		{ maxDepth: options?.maxDepth },
	);
}

// ---------------------------------------------------------------------------
// In-source unit tests.
// ---------------------------------------------------------------------------
if (import.meta.vitest) {
	const { describe, it, expect } = import.meta.vitest;

	describe('resolveRefs', () => {
		it('resolves a local pointer ref', () => {
			const out = resolveRefs({ defs: { Pet: { type: 'object' } }, pet: { $ref: '#/defs/Pet' } });
			expect(out.pet).toEqual({ type: 'object' });
		});
		it('follows ref chains', () => {
			const out = resolveRefs({ a: { $ref: '#/b' }, b: { $ref: '#/c' }, c: { v: 1 } });
			expect(out.a).toEqual({ v: 1 });
		});
		it('resolves nested refs inside a target', () => {
			const out = resolveRefs({
				inner: { v: 1 },
				mid: { wrap: { $ref: '#/inner' } },
				top: { $ref: '#/mid' },
			});
			expect(out.top).toEqual({ wrap: { v: 1 } });
		});
		it('leaves external and unresolvable refs as-is', () => {
			const ext = { a: { $ref: 'https://x/y' }, b: { $ref: '#/missing' } };
			const out = resolveRefs(ext);
			expect(out.a).toEqual({ $ref: 'https://x/y' });
			expect(out.b).toEqual({ $ref: '#/missing' });
		});
		it('leaves cyclic ref chains as-is', () => {
			const out = resolveRefs({ a: { $ref: '#/b' }, b: { $ref: '#/a' } });
			expect(out.a).toEqual({ $ref: '#/b' });
		});
	});
}

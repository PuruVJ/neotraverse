// Every way the safe API walks or writes a path, against every hostile path, must leave the
// built-in prototypes exactly as they were. One matrix for the whole class, so a new write
// path that skips the guard fails here, not in the field (GHSA-cg7r-g8r9-c93w).
import { describe, expect, test } from 'vite-plus/test';
import { patch as modernPatch, set as modernSet } from '../src/index';
import { Traverse } from '../src/legacy/index';
import { patch, set, transform } from '../src/safe/index';

const PROTOTYPES = [Object.prototype, Array.prototype, Map.prototype, Function.prototype] as const;

type Snapshot = Map<object, Map<PropertyKey, PropertyDescriptor>>;

function snapshot(): Snapshot {
	const out: Snapshot = new Map();
	for (const proto of PROTOTYPES) {
		const props = new Map<PropertyKey, PropertyDescriptor>();
		for (const key of Reflect.ownKeys(proto)) {
			props.set(key, Object.getOwnPropertyDescriptor(proto, key)!);
		}
		const unscopables = (proto as any)[Symbol.unscopables];
		if (unscopables)
			props.set('@@unscopables-keys', { value: Reflect.ownKeys(unscopables).join() });
		out.set(proto, props);
	}
	return out;
}

// Restores whatever a failing run changed, so one bad write cannot break the test runner.
function restore(before: Snapshot): void {
	for (const [proto, props] of before) {
		for (const key of Reflect.ownKeys(proto)) {
			if (!props.has(key)) delete (proto as any)[key];
		}
		for (const [key, desc] of props) {
			if (typeof key === 'string' && key.startsWith('@@')) continue;
			Object.defineProperty(proto, key, desc);
		}
	}
	const unscopables = (Array.prototype as any)[Symbol.unscopables];
	const allowed = (before.get(Array.prototype)!.get('@@unscopables-keys')!.value as string).split(
		',',
	);
	for (const key of Reflect.ownKeys(unscopables)) {
		if (typeof key === 'string' && !allowed.includes(key)) delete unscopables[key];
	}
}

function changed(before: Snapshot, after: Snapshot): string[] {
	const diffs: string[] = [];
	for (const [proto, props] of before) {
		const now = after.get(proto)!;
		const name = (proto as any).constructor?.name ?? '?';
		for (const [key, desc] of props) {
			const cur = now.get(key);
			if (!cur) diffs.push(`${name}.prototype lost ${String(key)}`);
			else if (cur.value !== desc.value || cur.get !== desc.get || cur.set !== desc.set)
				diffs.push(`${name}.prototype changed ${String(key)}`);
		}
		for (const key of now.keys()) {
			if (!props.has(key)) diffs.push(`${name}.prototype gained ${String(key)}`);
		}
	}
	return diffs;
}

/** Run `fn`, tolerate a thrown refusal, and report any prototype it touched. */
function touched(fn: () => unknown): string[] {
	const before = snapshot();
	try {
		fn();
	} catch {
		// ok: a refusal is a correct outcome; only a prototype change is a failure
	}
	// Snapshot and restore first: a bad run may have deleted the very methods a diff needs.
	const after = snapshot();
	restore(before);
	return changed(before, after);
}

const HOSTILE = ['__proto__', 'constructor/prototype'];
const ROOTS = {
	array: () => [] as any,
	object: () => ({}) as any,
	'nested array': () => ({ a: [] }) as any,
	map: () => new Map() as any,
};
const TAILS = ['0', 'push', 'polluted', 'toString'];

describe('safe API: no write reaches a built-in prototype', () => {
	for (const [rootName, make] of Object.entries(ROOTS)) {
		for (const hostile of HOSTILE) {
			for (const tail of TAILS) {
				const pointer = `${rootName === 'nested array' ? '/a' : ''}/${hostile}/${tail}`;
				for (const mutate of [true, false]) {
					const label = `${pointer} on ${rootName} (mutate: ${mutate})`;

					test(`patch add ${label}`, () => {
						expect(
							touched(() => patch(make(), [{ op: 'add', path: pointer, value: 'x' }], { mutate })),
						).toEqual([]);
					});
					test(`patch replace ${label}`, () => {
						expect(
							touched(() =>
								patch(make(), [{ op: 'replace', path: pointer, value: 'x' }], { mutate }),
							),
						).toEqual([]);
					});
					test(`patch remove ${label}`, () => {
						expect(
							touched(() => patch(make(), [{ op: 'remove', path: pointer }], { mutate })),
						).toEqual([]);
					});
					test(`set ${label}`, () => {
						expect(touched(() => set(make(), pointer, 'x', { mutate }))).toEqual([]);
					});
				}
			}
		}
	}

	// The default and legacy entry points share no code with safe/, so the same class is checked there.
	for (const [rootName, make] of Object.entries(ROOTS)) {
		for (const hostile of HOSTILE) {
			for (const tail of TAILS) {
				const keys = [...hostile.split('/'), tail];
				const pointer = `/${keys.join('/')}`;
				const label = `${pointer} on ${rootName}`;
				test(`default patch add/replace/remove ${label}`, () => {
					for (const op of ['add', 'replace', 'remove'] as const) {
						expect(
							touched(() => modernPatch(make(), [{ op, path: pointer, value: 'x' } as any])),
						).toEqual([]);
					}
				});
				test(`default set ${label}`, () => {
					expect(touched(() => modernSet(make(), keys, 'x'))).toEqual([]);
				});
				test(`legacy set ${label}`, () => {
					expect(touched(() => new Traverse(make()).set(keys, 'x'))).toEqual([]);
				});
			}
		}
	}

	test('default and legacy set never write through an inherited Symbol.unscopables', () => {
		expect(touched(() => modernSet([], [Symbol.unscopables, 'polluted'], true))).toEqual([]);
		expect(touched(() => new Traverse([]).set([Symbol.unscopables, 'polluted'], true))).toEqual([]);
	});

	test('set never writes through a value the path only inherits (Symbol.unscopables)', () => {
		expect(
			touched(() => set([] as any, [Symbol.unscopables, 'polluted'], true, { mutate: true })),
		).toEqual([]);
	});
});

describe('safe API: a hostile path is refused, never half applied', () => {
	test('patch with an unsafe path throws and applies none of the ops before it', () => {
		const root: any = { a: 1, list: [] };
		expect(() =>
			patch(
				root,
				[
					{ op: 'replace', path: '/a', value: 2 },
					{ op: 'add', path: '/list/__proto__/0', value: 'x' },
				],
				{ mutate: true },
			),
		).toThrow(/unsafe path segment/);
		expect(root).toEqual({ a: 1, list: [] });
	});

	for (const op of ['add', 'replace', 'remove'] as const) {
		test(`patch ${op} through __proto__ throws a TypeError`, () => {
			expect(() =>
				patch([] as any, [{ op, path: '/__proto__/0', value: 'x' } as any], { mutate: true }),
			).toThrow(TypeError);
		});
	}
});

describe('safe API: a path names own data only', () => {
	test('set and get agree: a write does not go through an inherited object', () => {
		const shared = { x: 1 };
		const child = Object.create({ conf: shared });
		set(child, ['conf', 'x'], 2, { mutate: true });
		expect(shared.x).toBe(1);
		expect(child.conf).not.toBe(shared);
		expect(child.conf.x).toBe(2);
	});

	test('transform keeps an array own __proto__ key as data, not as the prototype', () => {
		const arr: any = [1];
		Object.defineProperty(arr, '__proto__', {
			value: { evil: true },
			enumerable: true,
			writable: true,
			configurable: true,
		});
		const out: any = transform(arr, (v, { replace }) => (v.key === 0 ? replace(2) : undefined));
		expect(Object.getPrototypeOf(out)).toBe(Array.prototype);
		expect(out.evil).toBeUndefined();
	});
});

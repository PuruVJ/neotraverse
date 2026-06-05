import { describe, expect, test } from 'vitest';
import * as t from '../src/modern';

/** Every public modern export is callable (tree-shake entry smoke test). */
describe('modern public exports', () => {
	test('core and extended API surface', () => {
		const obj = { a: 1, b: { c: 2 } };

		expect(typeof t.forEach).toBe('function');
		expect(typeof t.map).toBe('function');
		expect(typeof t.clone).toBe('function');
		expect(typeof t.getType).toBe('function');
		expect(typeof t.findPaths).toBe('function');
		expect(typeof t.getPath).toBe('function');
		expect(typeof t.diff).toBe('function');
		expect(typeof t.select).toBe('function');

		expect(t.size(obj)).toBeGreaterThan(0);
		expect(t.getPath(obj, 'a')).toBe(1);
		expect(t.getType(1)).toBe('primitive');
		expect(t.getType(() => {})).toBe('function');
	});
});

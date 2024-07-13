import { test, expect } from 'vitest';
import traverse from '../src';
import { Traverse } from '../src/modern';
import { EventEmitter } from 'node:events';

test('check instanceof on node elems', () => {
	const counts = { emitter: 0 };

	traverse([new EventEmitter(), 3, 4, { ev: new EventEmitter() }]).forEach(function (node) {
		if (node instanceof EventEmitter) {
			counts.emitter += 1;
		}
	});
	expect(counts.emitter).toBe(2);
});

test('check instanceof on node elems_modern', () => {
	const counts = { emitter: 0 };

	new Traverse([new EventEmitter(), 3, 4, { ev: new EventEmitter() }]).forEach((_, node) => {
		if (node instanceof EventEmitter) {
			counts.emitter += 1;
		}
	});
	expect(counts.emitter).toBe(2);
});

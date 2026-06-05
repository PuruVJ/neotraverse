import { expect, test } from 'vitest';
import traverse from '../src';
import { Traverse } from '../src/modern';

test('circular', () => {
	const obj = { x: 3 };
	// @ts-expect-error
	obj.y = obj;
	traverse(obj).forEach(function () {
		if (this.path.join('') === 'y') {
			// t.equal(util.inspect(this.circular.node), util.inspect(obj));
			expect(this.circular?.node).toEqual(obj);
		}
	});
});

test('circular_modern', () => {
	const obj = { x: 3 };
	// @ts-expect-error
	obj.y = obj;

	new Traverse(obj).forEach((ctx) => {
		if (ctx.path.join('') === 'y') {
			// t.equal(util.inspect(this.circular.node), util.inspect(obj));
			expect(ctx.circular?.node).toEqual(obj);
		}
	});
});

test('deepCirc', () => {
	const obj = { x: [1, 2, 3], y: [4, 5] };
	// @ts-expect-error
	obj.y[2] = obj;

	traverse(obj).forEach(function () {
		if (this.circular) {
			expect(this.circular?.path).toEqual([]);
			expect(this.path).toEqual(['y', '2']);
		}
	});
});

test('deepCirc_modern', () => {
	const obj = { x: [1, 2, 3], y: [4, 5] };
	// @ts-expect-error
	obj.y[2] = obj;

	new Traverse(obj).forEach((ctx) => {
		if (ctx.circular) {
			expect(ctx.circular?.path).toEqual([]);
			expect(ctx.path).toEqual(['y', '2']);
		}
	});
});

test('doubleCirc', () => {
	const obj = { x: [1, 2, 3], y: [4, 5] };
	// @ts-expect-error
	obj.y[2] = obj;
	// @ts-expect-error
	obj.x.push(obj.y);

	const circs: any[] = [];
	traverse(obj).forEach(function (x) {
		if (this.circular) {
			circs.push({ circ: this.circular, self: this, node: x });
		}
	});

	expect(circs[0].self.path).toEqual(['x', '3', '2']);
	expect(circs[0].circ.path).toEqual([]);

	expect(circs[1].self.path).toEqual(['y', '2']);
	expect(circs[1].circ.path).toEqual([]);

	expect(circs.length).toEqual(2);
});

test('doubleCirc_modern', () => {
	const obj = { x: [1, 2, 3], y: [4, 5] };
	// @ts-expect-error
	obj.y[2] = obj;
	// @ts-expect-error
	obj.x.push(obj.y);

	const circs: any[] = [];
	new Traverse(obj).forEach((ctx, x) => {
		if (ctx.circular) {
			circs.push({ circ: ctx.circular, self: ctx, node: x });
		}
	});

	expect(circs[0].self.path).toEqual(['x', '3', '2']);
	expect(circs[0].circ.path).toEqual([]);

	expect(circs[1].self.path).toEqual(['y', '2']);
	expect(circs[1].circ.path).toEqual([]);

	expect(circs.length).toEqual(2);
});

test('circDubForEach', () => {
	const obj = { x: [1, 2, 3], y: [4, 5] };
	// @ts-expect-error
	obj.y[2] = obj;
	// @ts-expect-error
	obj.x.push(obj.y);

	traverse(obj).forEach(function () {
		if (this.circular) {
			this.update('...');
		}
	});

	expect(obj).toEqual({ x: [1, 2, 3, [4, 5, '...']], y: [4, 5, '...'] });
});

test('circDubForEach_modern', () => {
	const obj = { x: [1, 2, 3], y: [4, 5] };
	// @ts-expect-error
	obj.y[2] = obj;
	// @ts-expect-error
	obj.x.push(obj.y);

	new Traverse(obj).forEach((ctx) => {
		if (ctx.circular) {
			ctx.update('...');
		}
	});

	expect(obj).toEqual({ x: [1, 2, 3, [4, 5, '...']], y: [4, 5, '...'] });
});

test('circDubMap', () => {
	const obj = { x: [1, 2, 3], y: [4, 5] };
	// @ts-expect-error
	obj.y[2] = obj;
	// @ts-expect-error
	obj.x.push(obj.y);

	const c = traverse(obj).map(function () {
		if (this.circular) {
			this.update('...');
		}
	});

	expect(c).toEqual({ x: [1, 2, 3, [4, 5, '...']], y: [4, 5, '...'] });
});

test('circMapScrub_modern', () => {
	const obj = { a: 1, b: 2 };
	// @ts-expect-error
	obj.c = obj;

	const scrubbed = new Traverse(obj).map((ctx) => {
		if (ctx.circular) {
			ctx.remove();
		}
	});
	expect(Object.keys(scrubbed).sort()).toEqual(['a', 'b']);
	expect(scrubbed).toEqual({ a: 1, b: 2 });

	// @ts-expect-error
	expect(obj.c).toBe(obj);
});

test('circClone', () => {
	const obj = { x: [1, 2, 3], y: [4, 5] };
	// @ts-expect-error
	obj.y[2] = obj;
	// @ts-expect-error
	obj.x.push(obj.y);

	const clone = traverse(obj).clone();
	expect(obj).not.toBe(clone);

	expect(clone.y[2]).toBe(clone);
	expect(clone.y[2]).not.toBe(obj);
	expect(clone.x[3][2]).toBe(clone);
	expect(clone.x[3][2]).not.toBe(obj);
	expect(clone.x.slice(0, 3)).toEqual([1, 2, 3]);
	expect(clone.y.slice(0, 2)).toEqual([4, 5]);
});

test('clone_modern', () => {
	const obj = { x: [1, 2, 3], y: [4, 5] };
	// @ts-expect-error
	obj.y[2] = obj;
	// @ts-expect-error
	obj.x.push(obj.y);

	const clone = new Traverse(obj).clone();
	expect(obj).not.toBe(clone);

	expect(clone.y[2]).toBe(clone);
	expect(clone.y[2]).not.toBe(obj);
	expect(clone.x[3][2]).toBe(clone);
	expect(clone.x[3][2]).not.toBe(obj);
	expect(clone.x.slice(0, 3)).toEqual([1, 2, 3]);
	expect(clone.y.slice(0, 2)).toEqual([4, 5]);
});

test('circMapScrub', () => {
	const obj = { a: 1, b: 2 };
	// @ts-expect-error
	obj.c = obj;

	const scrubbed = traverse(obj).map(function () {
		if (this.circular) {
			this.remove();
		}
	});
	expect(Object.keys(scrubbed).sort()).toEqual(['a', 'b']);
	expect(scrubbed).toEqual({ a: 1, b: 2 });

	// @ts-expect-error
	expect(obj.c).toBe(obj);
});

test('scrub_modern', () => {
	const obj = { a: 1, b: 2 };
	// @ts-expect-error
	obj.c = obj;

	const scrubbed = new Traverse(obj).map((ctx) => {
		if (ctx.circular) {
			ctx.remove();
		}
	});
	expect(Object.keys(scrubbed).sort()).toEqual(['a', 'b']);
	expect(scrubbed).toEqual({ a: 1, b: 2 });

	// @ts-expect-error
	expect(obj.c).toBe(obj);
});

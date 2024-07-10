import { expect, test } from 'vitest';
import { traverse } from '../src';

function make() {
	var a: any = { self: 'a' };
	var b: any = { self: 'b' };
	var c: any = { self: 'c' };
	var d: any = { self: 'd' };
	var e: any = { self: 'e' };

	a.a = a;
	a.b = b;
	a.c = c;

	b.a = a;
	b.b = b;
	b.c = c;

	c.a = a;
	c.b = b;
	c.c = c;
	c.d = d;

	d.a = a;
	d.b = b;
	d.c = c;
	d.d = d;
	d.e = e;

	e.a = a;
	e.b = b;
	e.c = c;
	e.d = d;
	e.e = e;

	return a;
}

test('super_deep', function (t) {
	var a0 = make();
	var a1 = make();

	expect(a0).toEqual(a1);

	a0.c.d.moo = true;
	expect(a0).not.toEqual(a1);

	a1.c.d.moo = true;
	expect(a0).toEqual(a1);

	// TODO: this one
	// a0.c.a = a1;
	// t.ok(!deepEqual(a0, a1));
});

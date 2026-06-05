'use strict';

var traverse = require('../dist/legacy/legacy.cjs');

var obj = {
	a: [1, 2, 3],
	b: 4,
	c: [5, 6],
	d: { e: [7, 8], f: 9 },
};

console.log(traverse);

var leaves = traverse(obj).reduce(function (acc, x) {
	if (this.isLeaf) {
		acc.push(x);
	}
	return acc;
}, []);

console.dir(leaves);

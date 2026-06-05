const traverse = /** @type {import('neotraverse/legacy')['default']} */ (
	require('neotraverse/legacy')
);

const obj = {
	a: 1,
	b: 2,
	c: {
		d: 3,
		e: 4,
		f: {
			g: 5,
			h: 6,
		},
	},
};

traverse(obj).forEach((node) => {});

console.log(obj);

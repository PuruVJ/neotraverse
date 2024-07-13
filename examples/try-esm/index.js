import { Traverse } from 'neotraverse/modern';

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

new Traverse(obj).forEach((ctx, node) => {
	if (node === 6) ctx.update(68);
});

console.log(obj);

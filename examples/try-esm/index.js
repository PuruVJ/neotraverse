import traverse from 'neotraverse/legacy';

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

traverse(obj).forEach(function (node) {
	if (node === 6) this.update(68);
});

console.log(obj);

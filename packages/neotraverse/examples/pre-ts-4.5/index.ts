import traverse from 'neotraverse/legacy';

const obj = { a: 1, b: 2, c: [3, 4] };

traverse(obj).forEach(function (x) {
	if (x < 0) this.update(x + 128);
});

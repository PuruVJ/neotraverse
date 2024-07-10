# neotraverse

Traverse and transform objects by visiting every node on a recursive walk. This is a fork and TypeScript rewrite of [traverse](https://github.com/ljharb/js-traverse) with 0 dependencies and major improvements:

- 🤌 1.45KB min+brotli
- 🚥 Zero dependencies
- 🎹 TypeScript. Throw away the `@types/traverse` package
- ❎ No polyfills
- 🛸 ESM-first

# Principles

Rules this package aims to follow for an indefinite period of time:

- No dependencies.
- No polyfills.
- ESM-first.
- Pushing to be modern
- Always provide a legacy mode

# examples

## transform negative numbers in-place

negative.js

```js
import { Traverse } from 'neotraverse';
const obj = [5, 6, -3, [7, 8, -2, 1], { f: 10, g: -13 }];

new Traverse(obj).forEach(function (x) {
  if (x < 0) this.update(x + 128);
});

console.dir(obj);
```

Output:

    [ 5, 6, 125, [ 7, 8, 126, 1 ], { f: 10, g: 115 } ]

## collect leaf nodes

leaves.js

```js
import { Traverse } from 'neotraverse';

const obj = {
  a: [1, 2, 3],
  b: 4,
  c: [5, 6],
  d: { e: [7, 8], f: 9 }
};

const leaves = new Traverse(obj).reduce(function (acc, x) {
  if (this.isLeaf) acc.push(x);
  return acc;
}, []);

console.dir(leaves);
```

Output:

    [ 1, 2, 3, 4, 5, 6, 7, 8, 9 ]

## scrub circular references

scrub.js:

```js
import { Traverse } from 'neotraverse';

const obj = { a: 1, b: 2, c: [3, 4] };
obj.c.push(obj);

const scrubbed = new Traverse(obj).map(function (x) {
  if (this.circular) this.remove();
});

console.dir(scrubbed);
```

output:

    { a: 1, b: 2, c: [ 3, 4 ] }

# Differences from `traverse`

- ESM-first
- ES2022, Node 18+
- Types included by default. No need to install `@types/traverse`
- Works as-is in all major browsers and Deno
- No polyfills
- `new Traverse()` class instead of regular old `traverse()`
- Legacy mode supporting ES2015 minimum

There is a legacy mode that provides the same API as `traverse`, acting as a drop-in replacement:

```js
import traverse from 'neotraverse/legacy';

const obj = { a: 1, b: 2, c: [3, 4] };

traverse(obj).forEach(function (x) {
  if (x < 0) this.update(x + 128);
});
```

> NOTE: legacy mode doesn't have methods attached to the function constructor. As in, traverse.map(obj, fn) won't work. Use `new Traverse(obj).map(fn)` or `traverse(obj).map(fn)` instead.

# Migrating from `traverse`

### Step 1: Install `neotraverse`

```sh
npm install neotraverse
npm uninstall traverse @types/traverse # Remove the old dependencies
```

### Step 2: Replace `traverse` with `neotraverse`

```diff
-import traverse from 'traverse';
+import { Traverse } from 'neotraverse';

const obj = { a: 1, b: 2, c: [3, 4] };

-traverse(obj).forEach(function (x) {
+new Traverse(obj).forEach(function (x) {
  if (x < 0) this.update(x + 128);
});
```

Optionally, there's also a legacy mode that provides the same API as `traverse`, acting as a drop-in replacement:

```js
import traverse from 'neotraverse/legacy';

const obj = { a: 1, b: 2, c: [3, 4] };

traverse(obj).forEach(function (x) {
  if (x < 0) this.update(x + 128);
});
```

> NOTE: legacy mode doesn't have methods attached to the function constructor. As in, traverse.map(obj, fn) won't work. Use `new Traverse(obj).map(fn)` or `traverse(obj).map(fn)` instead.

### Step 3(Optional): Bundle time aliasing

If you use Vite, you can aliss `traverse` to `neotravers/legacy` in your `vite.config.js`:

```js
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    alias: {
      traverse: 'neotraverse/legacy'
    }
  }
});
```

# methods

Each method that takes an `fn` uses the context documented below in the context section.

## .map(fn)

Execute `fn` for each node in the object and return a new object with the results of the walk. To update nodes in the result use `this.update(value)`.

## .forEach(fn)

Execute `fn` for each node in the object but unlike `.map()`, when `this.update()` is called it updates the object in-place.

## .reduce(fn, acc)

For each node in the object, perform a [left-fold](<http://en.wikipedia.org/wiki/Fold_(higher-order_function)>) with the return value of `fn(acc, node)`.

If `acc` isn't specified, `acc` is set to the root object for the first step and the root element is skipped.

## .paths()

Return an `Array` of every possible non-cyclic path in the object. Paths are `Array`s of string keys.

## .nodes()

Return an `Array` of every node in the object.

## .clone()

Create a deep clone of the object.

## .get(path)

Get the element at the array `path`.

## .set(path, value)

Set the element at the array `path` to `value`.

## .has(path)

Return whether the element at the array `path` exists.

# context

Each method that takes a callback has a context (its `this` object) with these attributes:

## this.node

The present node on the recursive walk

## this.path

An array of string keys from the root to the present node

## this.parent

The context of the node's parent. This is `undefined` for the root node.

## this.key

The name of the key of the present node in its parent. This is `undefined` for the root node.

## this.isRoot, this.notRoot

Whether the present node is the root node

## this.isLeaf, this.notLeaf

Whether or not the present node is a leaf node (has no children)

## this.level

Depth of the node within the traversal

## this.circular

If the node equals one of its parents, the `circular` attribute is set to the context of that parent and the traversal progresses no deeper.

## this.update(value, stopHere=false)

Set a new value for the present node.

All the elements in `value` will be recursively traversed unless `stopHere` is true.

## this.remove(stopHere=false)

Remove the current element from the output. If the node is in an Array it will be spliced off. Otherwise it will be deleted from its parent.

## this.delete(stopHere=false)

Delete the current element from its parent in the output. Calls `delete` even on Arrays.

## this.before(fn)

Call this function before any of the children are traversed.

You can assign into `this.keys` here to traverse in a custom order.

## this.after(fn)

Call this function after any of the children are traversed.

## this.pre(fn)

Call this function before each of the children are traversed.

## this.post(fn)

Call this function after each of the children are traversed.

# install

Using [npm](http://npmjs.org) do:

    $ npm install traverse

# license

MIT

```

```

```

```

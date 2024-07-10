// src/index.ts
var toS = (obj) => Object.prototype.toString.call(obj);
var isDate = (obj) => toS(obj) === "[object Date]";
var isRegExp = (obj) => toS(obj) === "[object RegExp]";
var isError = (obj) => toS(obj) === "[object Error]";
var isBoolean = (obj) => toS(obj) === "[object Boolean]";
var isNumber = (obj) => toS(obj) === "[object Number]";
var isString = (obj) => toS(obj) === "[object String]";
var isArray = Array.isArray;
var gopd = Object.getOwnPropertyDescriptor;
var propertyIsEnumerable = Object.prototype.propertyIsEnumerable;
var getOwnPropertySymbols = Object.getOwnPropertySymbols;
var hasOwnProperty = Object.prototype.hasOwnProperty;
var objectKeys = Object.keys;
function ownEnumerableKeys(obj) {
  const res = objectKeys(obj);
  const symbols = getOwnPropertySymbols(obj);
  for (let i = 0; i < symbols.length; i++) {
    if (propertyIsEnumerable.call(obj, symbols[i])) {
      res.push(symbols[i].toString());
    }
  }
  return res;
}
function isWritable(object, key) {
  if (typeof gopd !== "function") {
    return true;
  }
  return !gopd(object, key)?.writable;
}
function isTypedArray(value) {
  if (!(typeof value === "object" && value !== null && "buffer" in value && value.buffer instanceof ArrayBuffer)) {
    return false;
  }
  const typeName = Object.prototype.toString.call(value.constructor).match(/\[object (\w+)\]/)[1];
  const typedArrays = [
    "Int8Array",
    "Uint8Array",
    "Uint8ClampedArray",
    "Int16Array",
    "Uint16Array",
    "Int32Array",
    "Uint32Array",
    "Float32Array",
    "Float64Array",
    "BigInt64Array",
    "BigUint64Array"
  ];
  if (typedArrays.includes(typeName)) {
    return true;
  }
  return false;
}
function copy(src) {
  if (!(typeof src === "object" && src !== null)) return src;
  let dst;
  if (isArray(src)) {
    dst = [];
  } else if (isDate(src)) {
    dst = new Date(src.getTime ? src.getTime() : src);
  } else if (isRegExp(src)) {
    dst = new RegExp(src);
  } else if (isError(src)) {
    dst = { message: src.message };
  } else if (isBoolean(src) || isNumber(src) || isString(src)) {
    dst = Object(src);
  } else if (isTypedArray(src)) {
    return src.slice();
  }
}
var emptyNull = { __proto__: null };
function walk(root, cb, options = emptyNull) {
  const path = [];
  const parents = [];
  let alive = true;
  const iteratorFunction = options.includeSymbols ? ownEnumerableKeys : objectKeys;
  const immutable = !!options.immutable;
  return function walker(node_) {
    const node = immutable ? copy(node_) : node_;
    const modifiers = {};
    let keepGoing = true;
    const state = {
      node,
      // @ts-expect-error internal
      node_,
      path: [].concat(path),
      parent: parents[parents.length - 1],
      parents,
      key: path[path.length - 1],
      isRoot: path.length === 0,
      level: path.length,
      circular: null,
      update: function(x, stopHere) {
        if (!state.isRoot && state.parent && state.key) {
          state.parent.node[state.key] = x;
        }
        state.node = x;
        if (stopHere) {
          keepGoing = false;
        }
      },
      delete: function(stopHere) {
        delete state.parent?.node[state?.key ?? ""];
        if (stopHere) {
          keepGoing = false;
        }
      },
      remove: function(stopHere) {
        if (isArray(state.parent?.node)) {
          if (state.key) state.parent.node.splice(+state.key, 1);
        } else {
          delete state.parent?.node[state.key ?? ""];
        }
        if (stopHere) {
          keepGoing = false;
        }
      },
      keys: null,
      before: function(f) {
        modifiers.before = f;
      },
      after: function(f) {
        modifiers.after = f;
      },
      pre: function(f) {
        modifiers.pre = f;
      },
      post: function(f) {
        modifiers.post = f;
      },
      stop: function() {
        alive = false;
      },
      block: function() {
        keepGoing = false;
      }
    };
    if (!alive) {
      return state;
    }
    function updateState() {
      if (typeof state.node === "object" && state.node !== null) {
        if (!state.keys || state.node_ !== state.node) {
          state.keys = iteratorFunction(state.node);
        }
        state.isLeaf = state.keys.length === 0;
        for (let i = 0; i < parents.length; i++) {
          if (parents[i].node_ === node_) {
            state.circular = parents[i];
            break;
          }
        }
      } else {
        state.isLeaf = true;
        state.keys = null;
      }
      state.notLeaf = !state.isLeaf;
      state.notRoot = !state.isRoot;
    }
    updateState();
    const ret = cb.call(state, state.node);
    if (ret !== void 0 && state.update) {
      state.update(ret);
    }
    if (modifiers.before) {
      modifiers.before.call(state, state.node);
    }
    if (!keepGoing) {
      return state;
    }
    if (typeof state.node === "object" && state.node !== null && !state.circular) {
      parents.push(state);
      updateState();
      for (const [stringIndex, key] of Object.entries(state.keys ?? [])) {
        const index = Number(stringIndex);
        path.push(key);
        if (modifiers.pre) {
          modifiers.pre.call(state, state.node[key], key);
        }
        const child = walker(state.node[key]);
        if (immutable && hasOwnProperty.call(state.node, key) && !isWritable(state.node, key)) {
          state.node[key] = child.node;
        }
        if (modifiers.post) {
          modifiers.post.call(state, child);
        }
        path.pop();
      }
      parents.pop();
    }
    if (modifiers.after) {
      modifiers.after.call(state, state.node);
    }
    return state;
  }(root).node;
}
var Traverse = class {
  #options;
  #value;
  constructor(obj, options) {
    this.#options = options ?? emptyNull;
    this.#value = obj;
  }
  /**
   * Get the element at the array `path`.
   */
  get(paths) {
    let node = this.#value;
    for (let i = 0; node && i < paths.length; i++) {
      const key = paths[i];
      if (!hasOwnProperty.call(node, key) || !this.#options.includeSymbols && typeof key === "symbol") {
        return void 0;
      }
      node = node[key];
    }
    return node;
  }
  has(paths) {
    var node = this.#value;
    for (var i = 0; node && i < paths.length; i++) {
      var key = paths[i];
      if (!hasOwnProperty.call(node, key) || !this.#options.includeSymbols && typeof key === "symbol") {
        return false;
      }
      node = node[key];
    }
    return true;
  }
  set(paths, value) {
    var node = this.#value;
    for (var i = 0; i < paths.length - 1; i++) {
      var key = paths[i];
      if (!hasOwnProperty.call(node, key)) {
        node[key] = {};
      }
      node = node[key];
    }
    node[paths[i]] = value;
    return value;
  }
  map(cb) {
    return walk(this.#value, cb, {
      // @ts-expect-error internal
      __proto__: null,
      immutable: true,
      includeSymbols: !!this.#options.includeSymbols
    });
  }
  forEach(cb) {
    this.#value = walk(this.#value, cb, this.#options);
    return this.#value;
  }
  reduce(cb, init) {
    var skip = arguments.length === 1;
    var acc = skip ? this.#value : init;
    this.forEach(function(x) {
      if (!this.isRoot || !skip) {
        acc = cb.call(this, acc, x);
      }
    });
    return acc;
  }
  paths() {
    var acc = [];
    this.forEach(function() {
      acc.push(this.path);
    });
    return acc;
  }
  /**
   * Return an `Array` of every node in the object.
   */
  nodes() {
    var acc = [];
    this.forEach(function() {
      acc.push(this.node);
    });
    return acc;
  }
  clone() {
    var parents = [];
    var nodes = [];
    var options = this.#options;
    if (isTypedArray(this.#value)) {
      return this.#value.slice();
    }
    return function clone(src) {
      for (var i = 0; i < parents.length; i++) {
        if (parents[i] === src) {
          return nodes[i];
        }
      }
      if (typeof src === "object" && src !== null) {
        var dst = copy(src);
        parents.push(src);
        nodes.push(dst);
        var iteratorFunction = options.includeSymbols ? ownEnumerableKeys : objectKeys;
        for (const key of iteratorFunction(src)) {
          dst[key] = this.clone(src[key]);
        }
        parents.pop();
        nodes.pop();
        return dst;
      }
      return src;
    }(this.#value);
  }
};
export {
  Traverse
};

var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __typeError = (msg) => {
  throw TypeError(msg);
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
var __privateAdd = (obj, member, value) => member.has(obj) ? __typeError("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
var __privateSet = (obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), setter ? setter.call(obj, value) : member.set(obj, value), value);

// src/index.ts
var src_exports = {};
__export(src_exports, {
  Traverse: () => Traverse
});
module.exports = __toCommonJS(src_exports);
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
  var _a;
  if (typeof gopd !== "function") {
    return true;
  }
  return !((_a = gopd(object, key)) == null ? void 0 : _a.writable);
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
    var _a;
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
        var _a2, _b;
        (_b = state.parent) == null ? true : delete _b.node[(_a2 = state == null ? void 0 : state.key) != null ? _a2 : ""];
        if (stopHere) {
          keepGoing = false;
        }
      },
      remove: function(stopHere) {
        var _a2, _b, _c;
        if (isArray((_a2 = state.parent) == null ? void 0 : _a2.node)) {
          if (state.key) state.parent.node.splice(+state.key, 1);
        } else {
          (_c = state.parent) == null ? true : delete _c.node[(_b = state.key) != null ? _b : ""];
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
      for (const [stringIndex, key] of Object.entries((_a = state.keys) != null ? _a : [])) {
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
var _options, _value;
var Traverse = class {
  constructor(obj, options) {
    __privateAdd(this, _options);
    __privateAdd(this, _value);
    __privateSet(this, _options, options != null ? options : emptyNull);
    __privateSet(this, _value, obj);
  }
  /**
   * Get the element at the array `path`.
   */
  get(paths) {
    let node = __privateGet(this, _value);
    for (let i = 0; node && i < paths.length; i++) {
      const key = paths[i];
      if (!hasOwnProperty.call(node, key) || !__privateGet(this, _options).includeSymbols && typeof key === "symbol") {
        return void 0;
      }
      node = node[key];
    }
    return node;
  }
  has(paths) {
    var node = __privateGet(this, _value);
    for (var i = 0; node && i < paths.length; i++) {
      var key = paths[i];
      if (!hasOwnProperty.call(node, key) || !__privateGet(this, _options).includeSymbols && typeof key === "symbol") {
        return false;
      }
      node = node[key];
    }
    return true;
  }
  set(paths, value) {
    var node = __privateGet(this, _value);
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
    return walk(__privateGet(this, _value), cb, {
      // @ts-expect-error internal
      __proto__: null,
      immutable: true,
      includeSymbols: !!__privateGet(this, _options).includeSymbols
    });
  }
  forEach(cb) {
    __privateSet(this, _value, walk(__privateGet(this, _value), cb, __privateGet(this, _options)));
    return __privateGet(this, _value);
  }
  reduce(cb, init) {
    var skip = arguments.length === 1;
    var acc = skip ? __privateGet(this, _value) : init;
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
    var options = __privateGet(this, _options);
    if (isTypedArray(__privateGet(this, _value))) {
      return __privateGet(this, _value).slice();
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
    }(__privateGet(this, _value));
  }
};
_options = new WeakMap();
_value = new WeakMap();

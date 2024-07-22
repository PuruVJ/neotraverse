# Changelog

## 0.6.15

PINNED: traverse@0.6.9

### Patch Changes

Pin `engines` field to `>= 10`

## 0.6.14

PINNED: traverse@0.6.9

### Patch Changes

Fix regression in legacy.mjs introduced in 0.6.13.

## 0.6.13

PINNED: traverse@0.6.9

### Patch Changes

Fix types for neotraverse/legacy for pre-TypeScript 4.5(when export maps were not supported).

## 0.6.12

PINNED: traverse@0.6.9

### Patch Changes

Earlier, neotraverse/legacy did not work with WebPack 4, as it does not support export maps. Now this package provides direct fallback for CJS.

## 0.6.11

PINNED: traverse@0.6.9

### Patch Changes

Fix types for neotraverse/legacy. I am sacrificing types for CJS in favor of ESM.

Use the following to get type-safety

```ts
const traverse = require('neotraverse/legacy');
//    ^ It isn't typed

const neoTraverse = traverse as traverse['default'];
//    ^ It is typed
```

## 0.6.10

PINNED: traverse@0.6.9

### Patch Changes

Fix types for neotraverse/legacy. Now both CJS and ESM are properly typed. CAVEAT: ESM import in typescript doesn't provide `TraverseContext` and `TraverseOptions` types. Import that from `neotraverse` instead.

Fresh start. Check out the [CHANGELOG](https://github.com/ljharb/js-traverse/blob/main/CHANGELOG.md#v069---2024-04-08) 0.6.9 for a list of changes prior to this release.

# Changelog

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

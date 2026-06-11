---
title: Security
outline: [2, 3]
---

# Security

`neotraverse` is designed to be safe to run on **untrusted data**.

- **No prototype pollution.** `set(path, value)` refuses to navigate or write through `__proto__`, `constructor`, or `prototype`, so an attacker-controlled path can't reach `Object.prototype`.
- **No prototype injection.** `clone()`, `map()`, and `forEach()` assign keys without ever triggering the `__proto__` setter. An object parsed from hostile JSON such as `{"__proto__":{"isAdmin":true}}` is cloned with its real prototype intact, `result.isAdmin` is `undefined`, and the injected value is preserved as an inert own data property.
- **Prototype preservation still works.** Legitimate class instances keep their prototype (`instanceof` is unaffected) after `clone()`/`map()`.
- **No prototype-chain disclosure.** `get()` and `has()` only ever follow **own** properties.

### Example

```ts
import * as t from 'neotraverse';

const evil = JSON.parse('{"user":"bob","__proto__":{"isAdmin":true}}');
const safe = t.clone(evil);

safe.isAdmin; // undefined, not polluted
Object.getPrototypeOf(safe); // Object.prototype
({}).isAdmin; // undefined, global prototype untouched
```

Read the story of the audit that produced these guarantees in the [**1.0 release post**](https://puruvj.dev/blog/neotraverse-1-0).

## DoS guard: `maxDepth`

Traversal is recursive, so a deeply-nested hostile object can overflow the stack. Pass `maxDepth` to bound it; a catchable `RangeError` is thrown before the native overflow. Unlimited when omitted (default behaviour is unchanged). See [Options](/guide/options).

### Example

```ts
import * as t from 'neotraverse';

try {
  t.clone(untrusted, { maxDepth: 1000 });
} catch (e) {
  // RangeError: neotraverse: maximum traversal depth (1000) exceeded
}
```

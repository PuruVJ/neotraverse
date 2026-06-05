---
layout: home

hero:
  name: neotraverse
  text: Traverse & transform objects
  tagline: Zero-dependency, TypeScript-first, prototype-pollution-safe, and ~3× faster — a drop-in replacement for traverse.
  actions:
    - theme: brand
      text: Get started
      link: /guide
    - theme: alt
      text: Benchmarks
      link: /benchmarks
    - theme: alt
      text: Security audit ↗
      link: /blog/the-vulnerability-run

features:
  - icon: 🤌
    title: Tiny
    details: ~1.5–1.6 KB min+brotli. Zero dependencies, no polyfills.
  - icon: 🛡️
    title: Hardened
    details: Prototype-pollution & injection safe on untrusted input, with an opt-in maxDepth DoS guard.
  - icon: ⚡
    title: Fast
    details: ~2.9× faster than the original traverse (modern build, geometric mean).
  - icon: 🎹
    title: TypeScript
    details: Types included by default. Throw away the @types/traverse package.
  - icon: 🛸
    title: ESM-first
    details: Modern ESM + a legacy ES2015 CJS/ESM drop-in. Works in browsers, Node and Deno.
  - icon: 🔁
    title: Drop-in
    details: Same API as traverse. Change the import and you're done.
---

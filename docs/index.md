---
layout: home

hero:
  name: neotraverse
  text: Traverse & transform objects
  tagline: Zero-dependency, TypeScript-first, prototype-pollution-safe, ~5× faster and ~6× leaner with the functional API (up to ~10× / ~11× peaks). Still a drop-in for traverse.
  actions:
    - theme: brand
      text: Get started
      link: /guide
    - theme: alt
      text: Benchmarks
      link: /benchmarks
    - theme: alt
      text: Blog
      link: https://puruvj.dev/blog/neotraverse-1-0

features:
  - icon: 🤌
    title: Tree-shakeable
    details: Utility-first named imports, ~2 KB brotli for one walk (`forEach`), up to ~6 KB for the full functional API (no deprecated class). Zero dependencies.
  - icon: 🛡️
    title: Hardened
    details: Prototype-pollution & injection safe on untrusted input, with an opt-in maxDepth DoS guard.
  - icon: ⚡
    title: Fast
    details: The functional API (the default `neotraverse` export) averages ~5× throughput and ~6× less heap per walk vs traverse, peaks around ~10× speed and ~11× memory on core shapes. Import only what you need.
  - icon: 🎹
    title: TypeScript
    details: Types included by default. Throw away the @types/traverse package.
  - icon: 🛸
    title: ESM-first
    details: Modern ESM + a legacy ES2015 CJS/ESM drop-in. Works in browsers, Node and Deno.
  - icon: 🔁
    title: Drop-in
    details: Same API as traverse via `neotraverse/legacy`, or adopt the default `neotraverse` export for named, tree-shakeable functions. See differences from traverse.
    link: /guide/vs-traverse
---

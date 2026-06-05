---
layout: home

hero:
  name: neotraverse
  text: Traverse & transform objects
  tagline: Zero-dependency, TypeScript-first, prototype-pollution-safe, and up to ~7× faster — a drop-in replacement for traverse.
  actions:
    - theme: brand
      text: Get started
      link: /guide
    - theme: alt
      text: Benchmarks
      link: /benchmarks
    - theme: alt
      text: Blog ↗
      link: https://puruvj.dev/blog/neotraverse-0-7

features:
  - icon: 🤌
    title: Tiny
    details: ~2.2 KB min+brotli (modern build). Zero dependencies, no polyfills.
  - icon: 🛡️
    title: Hardened
    details: Prototype-pollution & injection safe on untrusted input, with an opt-in maxDepth DoS guard.
  - icon: ⚡
    title: Fast
    details: ~4.5× faster than traverse on average — up to ~7× — with 3–5× less allocation (modern build).
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

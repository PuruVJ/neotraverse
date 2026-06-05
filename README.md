# neotraverse — monorepo

Traverse and transform objects by visiting every node on a recursive walk. A
zero-dependency, TypeScript-first, drop-in replacement for [`traverse`](https://github.com/ljharb/js-traverse).

> 📖 **Docs & benchmarks:** [neotraverse.puruvj.dev](https://neotraverse.puruvj.dev)

## Packages

| Package                                          | Description                          |
| ------------------------------------------------ | ------------------------------------ |
| [`packages/neotraverse`](./packages/neotraverse) | The published `neotraverse` library. |
| [`docs`](./docs)                                 | The documentation site (VitePress).  |

## Develop

```sh
pnpm install        # install the whole workspace

pnpm test           # run the library test suite
pnpm test:cov       # …with coverage
pnpm build          # build the library (tsdown)
pnpm bench          # benchmark vs the original `traverse`

pnpm docs:dev       # run the docs site locally
pnpm docs:build     # build the docs site
```

## License

[MIT](./packages/neotraverse/LICENSE)

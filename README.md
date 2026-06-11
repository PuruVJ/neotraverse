# neotraverse: monorepo

Traverse and transform objects by visiting every node on a recursive walk. A zero-dependency, TypeScript-first, drop-in replacement for [`traverse`](https://github.com/ljharb/js-traverse).

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

## Release

Versioning and npm publish are handled by Changesets on `main` via [`.github/workflows/release.yml`](./.github/workflows/release.yml), using [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) (OIDC). One-time registry setup: [`.github/PUBLISHING.md`](./.github/PUBLISHING.md).

## License

[MIT](./packages/neotraverse/LICENSE)

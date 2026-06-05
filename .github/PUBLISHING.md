# Publishing `neotraverse` to npm

Releases run from [`.github/workflows/release.yml`](./workflows/release.yml) on pushes to `main`, using [Changesets](https://github.com/changesets/changesets) and **npm trusted publishing** (OIDC). No `NPM_TOKEN` secret is required for publish.

## One-time setup on npmjs.com

1. Open [neotraverse package settings](https://www.npmjs.com/package/neotraverse/settings) → **Trusted publishing**.
2. Add a **GitHub Actions** trusted publisher:
   - **Repository:** `PuruVJ/neotraverse`
   - **Workflow filename:** `release.yml` (exact name, including `.yml`)
   - **Environment:** leave empty unless you add a GitHub Environment later
3. After a successful OIDC publish, consider **Publishing access** → *Require two-factor authentication and disallow tokens* so only trusted publishing (and manual 2FA publishes) can release.

`packages/neotraverse/package.json` already sets `"publishConfig": { "provenance": true }`. Provenance attestations are generated automatically when publishing via trusted publishing from this public repo.

## Local / manual publishes

Trusted publishing only applies inside the configured GitHub Actions workflow. To publish from a machine, use `npm login` with 2FA as usual.

## Optional: read-only token for private deps

This workspace has no private npm dependencies. If you add any, use a read-only `NPM_READ_TOKEN` only on the install step; keep `NPM_TOKEN` unset for the Changesets publish step so OIDC is used.

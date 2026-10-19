# Hosting on Cloudflare

The site is static: `npm run build` writes `dist/`, and Cloudflare [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/) serves it at the domain in [`web/site.ts`](../web/site.ts). A small Worker, [`worker/index.js`](../worker/index.js), runs first on `/` and the English pages with a Markdown twin (`run_worker_first` in [`wrangler.jsonc`](../wrangler.jsonc)): it serves the twin to agents that ask for `text/markdown`, redirects first-time visitors to their browser's language, and can tag the English page with a language suggestion. The Markdown twins and negotiation are built in the repo instead of using Cloudflare's zone-level Markdown for Agents conversion, so they're reviewable, tested, and don't depend on the zone's plan. The setup matches [word2md.com](https://github.com/benbalter/word-to-markdown-js).

## What lives where

| Setting                                       | Where                                                                                                                                                                                                  |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Domain                                        | `SITE_HOST` in [`web/site.ts`](../web/site.ts), and `routes` in [`wrangler.jsonc`](../wrangler.jsonc). [`test/site-urls.test.ts`](../test/site-urls.test.ts) checks that the files in `public/` agree. |
| Assets, 404 handling, preview URLs            | [`wrangler.jsonc`](../wrangler.jsonc)                                                                                                                                                                  |
| Response headers (`frame-ancestors`, caching) | [`public/_headers`](../public/_headers)                                                                                                                                                                |
| Content-Security-Policy                       | `security.csp` in [`astro.config.mjs`](../astro.config.mjs), emitted as a `<meta>` tag                                                                                                                 |
| Build and deploy (Workers Builds)             | [`scripts/cloudflare-builds.mjs`](../scripts/cloudflare-builds.mjs), applied through the API                                                                                                           |
| HSTS                                          | The Cloudflare zone's SSL/TLS settings                                                                                                                                                                 |
| Analytics                                     | Cloudflare Web Analytics on the zone, injected at the edge (allowed by the CSP, disclosed on [/privacy/](../web/content/legal/privacy.md))                                                             |

## Deploys

[Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/) watches the GitHub repo:

- **Push to `main`:** runs `npm run build && npm test`, then `npx wrangler deploy`. That's a production deploy, and failing tests stop it.
- **Push to any other branch:** the same build, then `npx wrangler preview`, which publishes a [Worker Preview](https://developers.cloudflare.com/workers/previews/) URL without touching production. It needs the empty `previews` block in `wrangler.jsonc`.
- Pushes that only touch `.github/`, `docs/`, the e2e specs, or the top-level docs don't start a build.

GitHub Actions ([`ci.yml`](../.github/workflows/ci.yml)) runs lint, typecheck, the build, unit and e2e tests, and `wrangler deploy --dry-run`, but never deploys.

## First-time setup

1. Buy the domain through Cloudflare Registrar, so its zone lands in the account.
2. Create the Worker and attach the domain with a first deploy: `npm ci && npm run build && npm test && npx wrangler deploy`. Workers Builds can only attach to a Worker that exists, and a new Worker's first upload [has to be `wrangler deploy`](https://developers.cloudflare.com/workers/versions-and-deployments/deployment-management/#first-upload) (`versions upload` fails), so this is a production deploy. For the initial launch it ran from the branch that added this site, before the domain had any traffic.
3. Connect Workers Builds:

   ```sh
   op run --env-file=.env -- npm run cf:builds -- --tokens   # pick a build token
   op run --env-file=.env -- npm run cf:builds               # with BUILD_TOKEN_UUID set
   ```

   `.env` holds `op://` references for `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and `BUILD_TOKEN_UUID`, never the values. If the API rejects the repository, install the Cloudflare Workers and Pages GitHub app on the repo (a one-time authorization in GitHub, the only step without an API), then rerun.

4. Turn on Cloudflare Web Analytics for the zone.

## Local checks

```sh
npm run build
npx wrangler dev          # serve dist/ the way Cloudflare will, with _headers and 404 handling
npx wrangler deploy --dry-run
```

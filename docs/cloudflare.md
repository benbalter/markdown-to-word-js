# Hosting on Cloudflare

The site is static: `npm run build` writes `dist/`, and Cloudflare [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/) serves it at the domain in [`web/site.ts`](../web/site.ts). A small Worker, [`worker/index.js`](../worker/index.js), runs first on `/`, the English pages with a Markdown twin, and `/api/event` (`run_worker_first` in [`wrangler.jsonc`](../wrangler.jsonc)): it serves the twin to agents that ask for `text/markdown`, redirects first-time visitors to their browser's language, can tag the English page with a language suggestion, and counts anonymous conversions (see [Conversion counter](#conversion-counter)). The Markdown twins and negotiation are built in the repo instead of using Cloudflare's zone-level Markdown for Agents conversion, so they're reviewable, tested, and don't depend on the zone's plan. The setup matches [word2md.com](https://github.com/benbalter/word-to-markdown-js).

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
| Conversion counter                            | `analytics_engine_datasets` in [`wrangler.jsonc`](../wrangler.jsonc) (see [below](#conversion-counter))                                                                                                |

## Deploys

[Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/) watches the GitHub repo:

- **Push to `main`:** runs `npm run build && npm test`, then `npx wrangler deploy`. That's a production deploy, and failing tests stop it.
- **Push to any other branch:** the same build, then `npx wrangler preview`, which publishes a [Worker Preview](https://developers.cloudflare.com/workers/previews/) URL without touching production. It needs the `previews` block in `wrangler.jsonc`, which points the counter at a separate preview dataset.
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

## Conversion counter

md2word.app counts conversions the way word2md.com does, so the owner can see whether the tool is used and how often AI agents convert through its WebMCP tool compared with people. After each conversion, the page ([`web/scripts/analytics.ts`](../web/scripts/analytics.ts), called from [`src/index.ts`](../src/index.ts)) sends a content-free beacon, `POST /api/event?o=<success|error>&l=<locale>&s=<source>[&e=<kind>]`, only when it's served from md2word.app, so local and self-hosted copies send nothing. The Worker accepts it only from the site's own pages (same `Origin`, `Sec-Fetch-Site: same-origin`), bounds each value to a fixed list (anything else becomes `other`), and writes one [Workers Analytics Engine](https://developers.cloudflare.com/analytics/analytics-engine/) data point to `md2word_events` (previews write to `md2word_events_preview`). It never records the Markdown, a filename, a size, an IP address, or an identifier, and the [privacy policy](../web/content/legal/privacy.md) says so.

| Field     | Value                                                                                                                                                      |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `blob1`   | `convert`                                                                                                                                                  |
| `blob2`   | `success` or `error`                                                                                                                                       |
| `blob3`   | the page's locale key from [`locales.ts`](../web/i18n/locales.ts), or `other`                                                                              |
| `blob4`   | how it started: `drop`, `paste`, `webmcp` ([`conversion-sources.ts`](../web/scripts/conversion-sources.ts)), or `other`                                    |
| `blob5`   | for an error, its kind: `load`, `too-complex`, `conversion` ([`conversion-errors.ts`](../web/scripts/conversion-errors.ts)), or `other`; `none` on success |
| `double1` | `1`                                                                                                                                                        |

`drop` is a `.md` file dropped or chosen; `paste` is Markdown pasted or typed into the box and converted with the button or Ctrl/⌘+Enter; `webmcp` is an agent's `convert_markdown_to_docx` call. A failure's kind is the one `classifyConversionError` in `src/index.ts` picks for the message the visitor sees: `load` (the converter's code didn't download), `too-complex` (out of stack or memory), or `conversion` (anything else). A conversion counts once, when its `.docx` is made or fails. Only attempted conversions count: downloads and **Copy formatted text** reuse that result, so they aren't counted, and neither is input refused before converting (a Word file, too large, binary, an empty box) or a conversion superseded by a newer one. The blob order matches word2md.com's, so the same queries work on both; add new dimensions at the end so saved queries keep working.

Query it with the [SQL API](https://developers.cloudflare.com/analytics/analytics-engine/sql-api/) (the dataset appears on the first write). Analytics Engine may sample, so weight by `_sample_interval` for correct totals:

```sql
SELECT SUM(_sample_interval * double1) FROM md2word_events WHERE blob1 = 'convert'
SELECT blob2, SUM(_sample_interval * double1) FROM md2word_events WHERE blob1 = 'convert' GROUP BY blob2  -- by outcome
SELECT blob3, SUM(_sample_interval * double1) FROM md2word_events WHERE blob1 = 'convert' GROUP BY blob3  -- by locale
SELECT blob4, SUM(_sample_interval * double1) FROM md2word_events WHERE blob1 = 'convert' GROUP BY blob4  -- by source
SELECT blob5, SUM(_sample_interval * double1) FROM md2word_events WHERE blob1 = 'convert' AND blob2 = 'error' GROUP BY blob5  -- by error kind
```

## Bot and crawler settings

These live in the Cloudflare zone, not the repo, and were last set through the API on 2026-10-19:

- AI-bot blocking, content-bot blocking and the crawler link maze are all off, so crawlers and AI agents can read the site.
- Managed robots.txt (`is_robots_txt_managed`) and Bot Preference Sync (`bot_preference_sync_enabled`) are off, so the committed [`public/robots.txt`](../public/robots.txt) is the only robots.txt. Otherwise Cloudflare would prepend its own rules, which could contradict the file's `Content-Signal`. Check with `GET /zones/{zone_id}/bot_management`.
- Crawler Hints (IndexNow) is a dashboard-only toggle under Caching → Configuration, with no public API as of 2026-10. It keys off cache misses, which Workers Static Assets mostly bypass, so expect little from it. It's on for word2md.com.

## Local checks

```sh
npm run build
npx wrangler dev          # serve dist/ the way Cloudflare will, with _headers and 404 handling
npx wrangler deploy --dry-run
```

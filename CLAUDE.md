# CLAUDE.md

Browser app that converts Markdown to Word documents, live at [md2word.app](https://md2word.app). An [Astro](https://astro.build) static site on Cloudflare Workers Static Assets, built as the mirror image of [word2md.com](https://github.com/benbalter/word-to-markdown-js): same design, layout, and conventions. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup.

## Commands

Run these before pushing. They match [ci.yml](.github/workflows/ci.yml):

```sh
npm run lint        # eslint, check only (lint:fix rewrites files)
npm run typecheck   # tsc over web/, src/, test/, scripts/, and configs
npm test            # vitest unit tests
npm run build       # astro check + astro build into dist/, plus SEO/a11y checks
npm run test:e2e    # Playwright against dist/; build first
```

## Layout

- [`web/`](web) is Astro's `srcDir`: pages, layouts, components, styles, and the i18n dictionaries. [`web/site.ts`](web/site.ts) is the single source of truth for the domain.
- [`src/`](src) is the converter (Markdown → HTML → .docx) plus [`src/index.ts`](src/index.ts), the browser entry that wires up [`Converter.astro`](web/components/home/Converter.astro). Element ids and `data-*` attributes are the contract between those two files.
- `src/` minus `index.ts` is also the [`markdown-to-word`](https://www.npmjs.com/package/markdown-to-word) npm package: [`src/main.ts`](src/main.ts) is its public API, and [`src/node.ts`](src/node.ts) its Node entry, which fills in `DOMParser`/`XMLSerializer` from jsdom. [`tsconfig.build.json`](tsconfig.build.json) builds it into `build/`. Anything exported from `main.ts` is public API, so changing it needs a semver bump.
- Conversion runs entirely in the browser. Keep it that way, and keep the converter `import()`ed lazily: html-to-docx is the page's biggest chunk.

## Rules the build enforces

- **CSP:** a strict Content-Security-Policy ships as a `<meta>` tag ([`astro.config.mjs`](astro.config.mjs)). Never use `style="…"` attributes (use classes, or `element.style` from JS) or `<script is:inline>` (Astro only hashes scripts it bundles). Pass server values to scripts through `data-*` attributes.
- **No HTML comments in `.astro` files:** Astro ships `<!-- -->` verbatim. Use `{/* */}`.
- **i18n:** every string lives in [`web/i18n/en.json`](web/i18n/en.json), typed by [`types.ts`](web/i18n/types.ts). English is the only locale today; [`web/i18n/README.md`](web/i18n/README.md) covers adding one.
- **Design:** follow word2md's [DESIGN.md](https://github.com/benbalter/word-to-markdown-js/blob/main/DESIGN.md) (tokens in [`web/styles/global.css`](web/styles/global.css)): one filled accent button per screen, chartreuse only on the output or the next action.

## Deploying

- Pushing to `main` is a production deploy: Workers Builds runs `npm run build && npm test`, then `wrangler deploy`. Branches get preview URLs. See [docs/cloudflare.md](docs/cloudflare.md).
- Push or merge to `main` only when the owner says to, and never run `wrangler deploy` yourself.
- Publishing a GitHub Release publishes to npm ([release.yml](.github/workflows/release.yml); steps in [CONTRIBUTING.md](CONTRIBUTING.md#releasing-to-npm)). Never create a release, a `v*` tag, or run `npm publish` without the owner's OK.

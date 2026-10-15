# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

One file or one test: `npx vitest run test/docx-structure.test.ts`, `npx vitest run -t "<test name>"`, `npx playwright test test/e2e/csp.spec.ts`. The e2e tests drive installed Google Chrome (`channel: 'chrome'` in [playwright.config.ts](playwright.config.ts)), not Playwright's bundled Chromium.

## Layout

- [`web/`](web) is Astro's `srcDir`: pages, layouts, components, styles, and the i18n dictionaries. [`web/site.ts`](web/site.ts) is the single source of truth for the domain.
- [`src/`](src) is the converter (Markdown → HTML → .docx) plus [`src/index.ts`](src/index.ts), the browser entry that wires up [`Converter.astro`](web/components/home/Converter.astro). Element ids and `data-*` attributes are the contract between those two files.
- Conversion runs entirely in the browser. Keep it that way, and keep the converter `import()`ed lazily: html-to-docx is the page's biggest chunk.

## Conversion pipeline

[`convertMarkdownToWord`](src/converter.ts) runs four stages, and the converter tests check the result by reading the .docx back into HTML with [mammoth](https://github.com/mwilliamson/mammoth.js):

1. [`parseMarkdownToHtml`](src/markdown-parser.ts): marked, GFM. The page preview uses `renderPreviewHtml`, the same HTML passed through DOMPurify. The .docx path skips DOMPurify because html-to-docx never runs the HTML.
2. [`prepareHtmlForDocx`](src/docx-html.ts) rewrites what [html-to-docx](https://github.com/turbodocx/html-to-docx) would drop: rules become `RULE_TEXT` paragraphs, task-list checkboxes become glyphs, and styles ride in `data-docx-style` because the CSP blocks `style` attributes even inside `DOMParser` documents.
3. html-to-docx generates the .docx. [`buffer-global.ts`](src/buffer-global.ts) must be imported before it, or images break.
4. Three post-generation patches rewrite the .docx XML with JSZip: [code blocks](src/docx-code-blocks.ts), [structure](src/docx-structure.ts) (rules, table header rows), and the optional [font preset](src/docx-font-preset.ts). Each one runs only when the HTML needs it, is `import()`ed lazily, and goes through `patchOrKeep`, so a failed patch returns the unpatched document instead of failing the conversion.

The patches find their paragraphs by matching, in order, against counts and texts taken from the source HTML. So when you change what stage 1 or 2 emits, update the patch that matches it.

## Rules the build enforces

- **CSP:** a strict Content-Security-Policy ships as a `<meta>` tag ([`astro.config.mjs`](astro.config.mjs)). Never use `style="…"` attributes (use classes, or `element.style` from JS) or `<script is:inline>` (Astro only hashes scripts it bundles). Pass server values to scripts through `data-*` attributes.
- **No HTML comments in `.astro` files:** Astro ships `<!-- -->` verbatim. Use `{/* */}`.
- **i18n:** every string lives in [`web/i18n/en.json`](web/i18n/en.json), typed by [`types.ts`](web/i18n/types.ts). English is the only locale today; [`web/i18n/README.md`](web/i18n/README.md) covers adding one.
- **Design:** follow word2md's [DESIGN.md](https://github.com/benbalter/word-to-markdown-js/blob/main/DESIGN.md) (tokens in [`web/styles/global.css`](web/styles/global.css)): one filled accent button per screen, chartreuse only on the output or the next action.

## Deploying

- Pushing to `main` is a production deploy: Workers Builds runs `npm run build && npm test`, then `wrangler deploy`. Branches get preview URLs. See [docs/cloudflare.md](docs/cloudflare.md).
- Push or merge to `main` only when the owner says to, and never run `wrangler deploy` yourself.

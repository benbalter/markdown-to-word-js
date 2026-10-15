# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Primary:** someone who has an AI chat reply (ChatGPT, Claude, and others answer in Markdown) and needs to hand it on as a real Word document, to people who live in Word: colleagues, clients, reviewers, offices. They paste, convert, and download or copy, usually in under a minute, and they shouldn't have to know what Markdown is.
- **Secondary:** people who write in `.md` (developers, writers, docs folks) and have to deliver a `.docx`. They drop or choose a file, and expect GitHub Flavored Markdown to come through the way GitHub renders it.
- **Also served:** writers of Chinese official documents (公文), through the optional Style preset.

## Product Purpose

md2word.app turns Markdown into a formatted Word (`.docx`) document, entirely in the browser. Headings, lists, tables, task lists, code, links and images become real Word formatting instead of stray asterisks and pound signs.

Success is a useful free tool that people convert with and come back to. The Open & Async book pitch and the word2md.com cross-link are secondary, and must never get in the way of a conversion.

## Positioning

- **Nothing is uploaded.** Conversion runs on the visitor's device, so the tool works for sensitive documents, and the promise is checkable (open source, strict CSP).
- **Free and open source,** with no sign-up and no limits.
- **Lineage:** the successor to the `markdown_to_word` Ruby gem and web demo, first published in May 2015 (the basis for "Trusted since 2015").
- **One maker, both directions:** it's the mirror image of word2md.com (Word → Markdown), with the same promise.

## Operating Context

- Inputs: paste into the Markdown box, drop a file anywhere on the page, or choose one (`.md`, `.markdown`, `.txt` and similar, up to 5 MB). A dropped or chosen file converts right away; pasted text converts with **Convert to Word** or Ctrl/⌘+Enter.
- Outputs: **Download .docx** (named after the first heading), or **Copy formatted text**, which pastes into Word or Google Docs with its formatting.
- After a result appears, the page is just the output. The how-it-works, promo, table and FAQ sections hide until **Convert another**.
- A Word file dropped here gets pointed at word2md.com instead.

## Capabilities and Constraints

- **Markdown:** GitHub Flavored Markdown, rendered the way GitHub renders `.md` files (a single newline inside a paragraph joins the line). The README's "What converts" table is the source of truth for coverage.
- **Style presets:** Default (Word's standard styling) and Chinese official document (公文). The last choice is remembered.
- **Client-side only.** Keep the converter `import()`ed lazily, since html-to-docx is the page's largest chunk. A strict Content-Security-Policy ships on every page.
- **Same code, two products:** `src/` (minus the UI entry) is also the `markdown-to-word` npm package. Anything exported from `src/main.ts` is public API.
- **i18n-ready:** English is the only locale today, and every string lives in `web/i18n/en.json`.
- **Stack:** Astro static site on Cloudflare Workers Static Assets at md2word.app.

## Brand Commitments

- **The word2md.com mirror is binding.** md2word.app keeps word2md's design, layout and conventions, and [word2md's DESIGN.md](https://github.com/benbalter/word-to-markdown-js/blob/main/DESIGN.md) is the single source of truth for the visual system. Design changes land in word2md first, or in both sites together.
- **Name:** "Markdown to Word" (short form "md2word"), by Ben Balter.
- **Voice:** plain and direct. The privacy promise ("never uploaded") is repeated where people hand over a file.
- **Promo:** the Open & Async book stays a quiet, secondary ask.

## Evidence on Hand

- The 2015 Ruby gem lineage: [benbalter/markdown_to_word](https://github.com/benbalter/markdown_to_word).
- The open-source repository and its tests, which back the "nothing is uploaded" claim.
- The Open & Async book cover and copy (`web/components/home/Promo.astro`).
- None of the following exist, and none should be invented: testimonials, usage counts, customer logos, ratings or press.

## Product Principles

1. **The conversion comes first.** Every screen is judged by how fast someone gets from Markdown to a usable Word document. Promotion and cross-links stay out of its way.
2. **Never leave the device.** No feature may send content to a server. Say so at the moment people hand over a file.
3. **Word-native output.** The result should look like it was written in Word: real styles, lists, tables and headings, not pasted-in HTML.
4. **One family with word2md.** Keep the two sites recognizably one product, mirrored in direction, and change them together.
5. **Free, with no catches.** No sign-up, no limits, no dark patterns.

## Accessibility & Inclusion

- Target WCAG 2.2 AA in both light and dark themes (dark mode follows the OS setting). Respect `prefers-reduced-motion` with real alternatives, not just switching motion off.
- Everything is keyboard-operable with a visible focus indicator. Conversions are announced to screen readers.
- Touch targets are at least 44px, and copy adapts to touch screens ("Choose" instead of "Drop").
- Layouts support right-to-left languages, and the Chinese 公文 preset is a first-class feature.

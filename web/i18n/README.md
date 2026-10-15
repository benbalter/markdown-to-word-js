# Translations

UI strings live in one JSON file per locale. Today that's only `en.json`, the source of truth; the site is ready for more but launches in English.

JSON is used because it's the standard interchange format for translation management tools (Crowdin, Weblate, Tolgee, etc.), so crowdsourced translation can be wired up without restructuring. The setup mirrors [word2md.com](https://github.com/benbalter/word-to-markdown-js/tree/main/web/i18n), which ships 21 locales this way.

## How it fits together

- `types.ts` — the `UIStrings` interface every locale must satisfy.
- `*.json` — the strings.
- `locales.ts` — the single source of truth for locale codes and metadata (endonyms, `html lang`, `og:locale`, sitemap tags). The Astro config and the tests derive their lists from it.
- `index.ts` — imports the JSON files into a `Record<Locale, UIStrings>` (so a locale without a dictionary is a type error), re-exports `locales.ts`, and exports `useTranslations(locale)` and `asLocale()`.
- `test/i18n-completeness.test.ts` — fails `npm test` if any locale is missing or has extra keys, has mismatched array lengths, or contains blank strings. (`astro check` only validates `.astro` files, so this test is the real guard.)

## Adding a locale

1. Add an entry to `locales.ts`.
2. Generate the dictionary: `npm run gen:i18n -- <locale>` machine-translates `en.json` through Azure OpenAI (set `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, and `AZURE_OPENAI_DEPLOYMENT`, e.g. with `op run --env-file=.env`). Or write `<locale>.json` by hand.
3. Import the JSON into `dictionaries` in `index.ts`.
4. Generate its social card: `npm run build && npm run gen:og`.
5. Run `npm test` and `npm run build`.

Routing (`/<locale>/`), the sitemap's hreflang alternates, the head's hreflang cluster, and the footer language switcher (hidden while there's one locale) pick it up from there. With a second locale, consider porting word2md's [`worker/index.js`](https://github.com/benbalter/word-to-markdown-js/blob/main/worker/index.js) for the Accept-Language redirect and the "also available in" banner.

## Right-to-left locales

- Set `dir: 'rtl'` on the entry in `locales.ts`; the layout renders it on `<html>`.
- In the JSON, wrap left-to-right tokens (`.md`, `Word (.docx)`) in the isolate characters `⁦…⁩`, or the browser draws `.docx` as `docx.`.
- In markup, use logical utilities (`text-start`, `me-*`) and `rtl:` variants. Code stays `dir="ltr"`. Monospace labels with translated text also need `rtl:font-sans rtl:tracking-normal`.

## Review status

Machine-translated locales are a first pass and need native review. Legal pages (Terms/Privacy) are intentionally English-only.

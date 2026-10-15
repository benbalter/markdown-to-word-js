// Single source of truth for the site's locales. astro.config.mjs (routing +
// sitemap), web/i18n/index.ts (UI), and the tests all derive their lists from
// here, so adding a language means adding one entry below plus its
// web/i18n/<locale>.json dictionary.
//
// Keep this module pure data: it is imported by the Astro config and Vitest,
// which don't share Astro's runtime.

export interface LocaleMeta {
  /** <html lang> and hreflang value. */
  htmlLang: string;
  /** og:locale value. */
  ogLocale: string;
  /** Language tag for the sitemap's hreflang alternates. */
  sitemapLocale: string;
  /** Endonym (the language's own name) for the switcher — never a flag. */
  name: string;
  /** Writing direction, when right-to-left. Omitted means LTR. */
  dir?: 'rtl';
}

// The key is the URL segment (e.g. `pt` → /pt/, `zh-hant` → /zh-hant/). Insertion order is the
// switcher order. English is the default and lives at the root.
// To add a language, add its entry here (see web/i18n/README.md), e.g.
//   de: { htmlLang: 'de', ogLocale: 'de_DE', sitemapLocale: 'de-DE', name: 'Deutsch' },
// prettier-ignore
export const localeMeta = {
  en: { htmlLang: 'en', ogLocale: 'en_US', sitemapLocale: 'en-US', name: 'English' },
} as const satisfies Record<string, LocaleMeta>;

export type Locale = keyof typeof localeMeta;

export const locales = Object.keys(localeMeta) as Locale[];

export const defaultLocale: Locale = 'en';

/** Locales served under a URL prefix (everything but the root default). */
export const prefixedLocales = locales.filter((l) => l !== defaultLocale);

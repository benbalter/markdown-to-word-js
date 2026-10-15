// Single source of truth for the site's locales. astro.config.mjs (routing +
// sitemap), web/i18n/index.ts (UI), worker/index.js (edge redirect), and the
// tests all derive their lists from here, so adding a language means adding
// one entry below plus its web/i18n/<locale>.json dictionary.
//
// Keep this module pure data: it is imported by the Astro config, the
// Cloudflare Worker bundle, and Vitest, none of which share Astro's runtime.

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
  /**
   * ISO 3166-1 country codes (Cloudflare's `request.cf.country`) whose
   * English-browsing visitors are shown a dismissible "also available in …"
   * suggestion on the English root. Never a redirect: location only ever
   * suggests (see pickSuggestion in worker/index.js).
   */
  countries?: readonly string[];
}

// The key is the URL segment (e.g. `pt` → /pt/, `zh-hant` → /zh-hant/). Insertion order is the
// switcher order, matching word2md.com. English is the default and lives at
// the root. To add a language, add its entry here (see web/i18n/README.md).
// prettier-ignore
export const localeMeta = {
  en: { htmlLang: 'en', ogLocale: 'en_US', sitemapLocale: 'en-US', name: 'English' },
  id: { htmlLang: 'id', ogLocale: 'id_ID', sitemapLocale: 'id-ID', name: 'Bahasa Indonesia', countries: ['ID'] },
  vi: { htmlLang: 'vi', ogLocale: 'vi_VN', sitemapLocale: 'vi-VN', name: 'Tiếng Việt', countries: ['VN'] },
  pt: { htmlLang: 'pt-BR', ogLocale: 'pt_BR', sitemapLocale: 'pt-BR', name: 'Português' },
  es: { htmlLang: 'es', ogLocale: 'es_ES', sitemapLocale: 'es', name: 'Español' },
  zh: { htmlLang: 'zh-Hans', ogLocale: 'zh_CN', sitemapLocale: 'zh-CN', name: '简体中文' },
} as const satisfies Record<string, LocaleMeta>;

export type Locale = keyof typeof localeMeta;

export const locales = Object.keys(localeMeta) as Locale[];

export const defaultLocale: Locale = 'en';

/** Locales served under a URL prefix (everything but the root default). */
export const prefixedLocales = locales.filter((l) => l !== defaultLocale);

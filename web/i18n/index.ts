import type { UIStrings } from './types';
// Translation content lives in per-locale JSON dictionaries (the standard format
// for translation-management tools like Crowdin/Weblate). The `Record` typing
// below documents the expected shape; completeness across locales is enforced at
// test time by test/i18n-completeness.test.ts (astro check only reports
// diagnostics for .astro files, so it can't catch a missing JSON key). See
// web/i18n/README.md.
import en from './en.json';
import es from './es.json';
import id from './id.json';
import pt from './pt.json';
import vi from './vi.json';
import zh from './zh.json';

import { defaultLocale, locales, type Locale } from './locales';

export type { UIStrings } from './types';

export { localeMeta, locales, defaultLocale, prefixedLocales } from './locales';
export type { Locale, LocaleMeta } from './locales';

// Record<Locale, …> makes a locale without a dictionary a type error, so a new
// entry in ./locales.ts can't ship half-wired.
const dictionaries: Record<Locale, UIStrings> = {
  en,
  id,
  vi,
  pt,
  es,
  zh,
};

/** Narrow an arbitrary string (e.g. Astro.currentLocale) to a known Locale. */
export function asLocale(value: string | undefined): Locale {
  return (locales as readonly string[]).includes(value ?? '')
    ? (value as Locale)
    : defaultLocale;
}

/** Return the string set for a locale, falling back to English. */
export function useTranslations(locale: string | undefined): UIStrings {
  return dictionaries[asLocale(locale)];
}

// Localized URL generation is handled by the `astro:i18n` helpers
// (getRelativeLocaleUrl / getAbsoluteLocaleUrl) directly in the .astro layout,
// so it always respects `base`, `trailingSlash`, and the routing config rather
// than re-deriving paths here. The hreflang *cluster* is built in Layout.astro:
// it MUST stay self-referential (every localized page lists all locales plus
// x-default), so only flag a page as localized if it exists in every locale.

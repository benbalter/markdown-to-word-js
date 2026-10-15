// Cloudflare Worker entry for the site (Workers Static Assets model), ported
// from word2md.com's worker/index.js minus its conversion counter.
//
// The static Astro output in ./dist is served via the ASSETS binding. This
// Worker runs first only on "/" (see `run_worker_first` in wrangler.jsonc): on
// a first visit with no language cookie it sends the visitor to the best
// Accept-Language match among the non-default locales (otherwise it falls
// through to the static English root). Every other path (localized pages,
// assets, legal pages) is served directly from assets and never reaches here.
//
// SEO: the redirect is a 302 (temporary), every locale is independently
// crawlable and listed in the sitemap with self-referential hreflang, and the
// decision is based solely on Accept-Language (no user-agent cloaking). A
// `lang` cookie — set on localized pages by a small script (see Layout.astro)
// — disables the auto-redirect after the first visit so the language switcher
// stays in control and there is never a redirect loop.
//
// Visitors who stay on the English root may instead get a *suggestion*: the
// Worker tags <html data-suggest-locale> when they list a supported language
// after English, or browse from a country mapped in locales.ts (`countries`),
// and the page shows a dismissible "also available in …" banner. Location
// only ever suggests; it never redirects.

import { localeMeta, prefixedLocales } from '../web/i18n/locales.ts';

// Non-default locales we can redirect to. English is the default and lives at
// the root, so it is intentionally absent (a match for English means "stay").
export const SUPPORTED_LOCALES = prefixedLocales;

// Parse an Accept-Language header into lowercased tags, highest q first.
function rankTags(acceptLanguage) {
  if (!acceptLanguage) return [];
  return (
    acceptLanguage
      .split(',')
      .map((part) => {
        const [tag, ...params] = part.trim().split(';');
        const qParam = params.find((p) => p.trim().startsWith('q='));
        const q = qParam ? parseFloat(qParam.split('=')[1]) : 1;
        return { tag: tag.trim().toLowerCase(), q: Number.isNaN(q) ? 0 : q };
      })
      // q=0 means "not acceptable" (RFC 9110), not "least preferred"
      .filter((entry) => entry.tag && entry.tag !== '*' && entry.q > 0)
      .sort((a, b) => b.q - a.q)
      .map((entry) => entry.tag)
  );
}

// Pick the highest-priority supported locale from an Accept-Language header.
// Returns a locale string, or null to stay on the English default (either
// because English ranks highest or nothing matched).
export function pickLocale(acceptLanguage) {
  for (const tag of rankTags(acceptLanguage)) {
    const locale = localeForTag(tag);
    if (locale === 'en') return null; // English preferred → stay on the root.
    if (SUPPORTED_LOCALES.includes(locale)) return locale;
  }
  return null;
}

// For a visitor who stays on the English root, pick a locale to *suggest*
// (a dismissible banner, never a redirect): a supported language they list
// after English, else the site language for their country. Returns null when
// there's nothing to suggest, including when their browser *prefers* a
// supported language: they'd have been redirected, so being on the English
// root means they chose it.
export function pickSuggestion(acceptLanguage, country) {
  if (pickLocale(acceptLanguage)) return null;
  for (const tag of rankTags(acceptLanguage)) {
    const locale = localeForTag(tag);
    if (SUPPORTED_LOCALES.includes(locale)) return locale;
  }
  if (!country) return null;
  return (
    SUPPORTED_LOCALES.find((l) => localeMeta[l].countries?.includes(country)) ??
    null
  );
}

// Traditional Chinese is the one locale a base-language match can't find:
// zh-TW, zh-HK, zh-MO and any zh-Hant tag map to zh-hant; every other zh tag
// (zh, zh-CN, zh-SG, zh-Hans) maps to Simplified. There's no zh-hant
// dictionary yet, so those readers aren't sent to Simplified: the tag goes
// unmatched and the next language they list decides.
const TRADITIONAL_CHINESE = /^zh-(?:hant|tw|hk|mo)(?:-|$)/;

// Map a lowercased language tag to a site locale key (which may be
// unsupported; callers check).
function localeForTag(tag) {
  if (TRADITIONAL_CHINESE.test(tag)) return 'zh-hant';
  return tag.split('-')[0];
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cookie = request.headers.get('Cookie') || '';

    // Only the root is a candidate for the locale redirect. run_worker_first
    // limits the Worker to "/", but check anyway so a config change can't
    // redirect asset requests.
    if (url.pathname === '/' && !/(?:^|;\s*)lang=/.test(cookie)) {
      const locale = pickLocale(request.headers.get('Accept-Language'));
      if (locale) {
        return new Response(null, {
          status: 302,
          headers: {
            // Preserve any query string (e.g. ?utm_source=…) on the redirect.
            Location: `${url.origin}/${locale}/${url.search}`,
            // Set the cookie now so the redirect happens at most once.
            'Set-Cookie': `lang=${locale}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`,
            'Cache-Control': 'no-store',
            Vary: 'Accept-Language, Cookie',
          },
        });
      }
    }

    // On the English root, pick a language to suggest. The static page renders
    // the banner hidden and its script reveals it when <html> carries
    // data-suggest-locale. A `hint=off` cookie (set on dismiss or click-through)
    // turns it off for good.
    const suggestion =
      url.pathname === '/' && !/(?:^|;\s*)hint=off(?:;|$)/.test(cookie)
        ? pickSuggestion(
            request.headers.get('Accept-Language'),
            request.cf?.country
          )
        : null;
    if (!suggestion) {
      // Serve the matching static asset (index.html for "/", etc.).
      const response = await env.ASSETS.fetch(request);
      if (url.pathname !== '/') return response;
      // The same "/" URL can instead be a redirect or a tagged page depending
      // on these headers, so a shared cache must key on them too.
      const varied = new Response(response.body, response);
      varied.headers.append('Vary', 'Accept-Language, Cookie');
      return varied;
    }

    // Fetch unconditionally: a 304 would let the browser reuse an untagged copy
    // cached before the suggestion applied.
    const headers = new Headers(request.headers);
    headers.delete('If-None-Match');
    headers.delete('If-Modified-Since');
    const response = await env.ASSETS.fetch(new Request(request, { headers }));
    return response.ok ? withSuggestion(response, suggestion) : response;
  },
};

// Stream the asset through HTMLRewriter to tag <html> with the suggestion. The
// response now varies per visitor, so it must not be cached as the shared
// asset (drop the asset's validators too, or a 304 would resurrect a stale
// copy).
function withSuggestion(response, locale) {
  const tagged = new HTMLRewriter()
    .on('html', {
      element(el) {
        el.setAttribute('data-suggest-locale', locale);
      },
    })
    .transform(response);
  const headers = new Headers(tagged.headers);
  headers.set('Cache-Control', 'private, no-store');
  headers.delete('ETag');
  headers.delete('Last-Modified');
  headers.append('Vary', 'Accept-Language, Cookie');
  return new Response(tagged.body, { status: tagged.status, headers });
}

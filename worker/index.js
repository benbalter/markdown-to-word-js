// Cloudflare Worker entry for the site (Workers Static Assets model), ported
// from word2md.com's worker/index.js minus its conversion counter.
//
// The static Astro output in ./dist is served via the ASSETS binding. This
// Worker runs first only on "/" and the English pages with a Markdown twin
// (see `run_worker_first` in wrangler.jsonc): on a first visit to "/" with no
// language cookie it sends the visitor to the best Accept-Language match
// among the non-default locales (otherwise it falls through to the static
// English root). Every other path (localized pages, assets) is served
// directly from assets and never reaches here.
//
// SEO: the redirect is a 302 (temporary), every locale is independently
// crawlable and listed in the sitemap with self-referential hreflang, and the
// decision is based solely on Accept-Language (no user-agent cloaking). A
// `lang` cookie — set on localized pages by a small script (see Layout.astro)
// — disables the auto-redirect after the first visit so the language switcher
// stays in control and there is never a redirect loop.
//
// Agents get Markdown: a request on a page URL whose Accept header prefers
// text/markdown over text/html is answered with the page's Markdown twin
// (/index.md for "/", /privacy.md for "/privacy/", built by
// web/pages/[page].md.ts), the same content the HTML says. Browsers never
// list text/markdown, so they always get HTML; both responses carry
// `Vary: Accept`.
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
// (zh, zh-CN, zh-SG, zh-Hans) maps to Simplified, so Traditional readers are
// never sent to Simplified.
const TRADITIONAL_CHINESE = /^zh-(?:hant|tw|hk|mo)(?:-|$)/;

// Map a lowercased language tag to a site locale key (which may be
// unsupported; callers check).
function localeForTag(tag) {
  if (TRADITIONAL_CHINESE.test(tag)) return 'zh-hant';
  return tag.split('-')[0];
}

// The Markdown twin's path for a page path, or null for anything that isn't
// an English page URL. Localized pages ("/de/") have no twin. A page that
// should have one but doesn't 404s, and the caller falls back to HTML.
export function markdownTwin(pathname) {
  if (pathname === '/') return '/index.md';
  const match = /^\/([a-z0-9-]+)\/$/.exec(pathname);
  if (!match || SUPPORTED_LOCALES.includes(match[1])) return null;
  return `/${match[1]}.md`;
}

// Does this Accept header prefer Markdown? True when text/markdown is listed
// with q > 0 and at least the q of text/html (absent counts as 0). Wildcards
// don't count: "*/*" alone means "anything", and HTML is what we serve then.
export function prefersMarkdown(accept) {
  if (!accept) return false;
  let markdown = 0;
  let html = 0;
  for (const part of accept.split(',')) {
    const [type, ...params] = part.trim().toLowerCase().split(';');
    const qParam = params.find((p) => p.trim().startsWith('q='));
    const q = qParam ? parseFloat(qParam.split('=')[1]) : 1;
    if (Number.isNaN(q)) continue;
    if (type.trim() === 'text/markdown') markdown = Math.max(markdown, q);
    if (type.trim() === 'text/html') html = Math.max(html, q);
  }
  return markdown > 0 && markdown >= html;
}

// Copy a response with `value` appended to its Vary header.
function withVary(response, value) {
  const varied = new Response(response.body, response);
  varied.headers.append('Vary', value);
  return varied;
}

export default {
  async fetch(request, env) {
    const response = await handle(request, env);
    // A page URL with a Markdown twin answers differently by Accept, so a
    // cache must key on it, whichever variant this is.
    const url = new URL(request.url);
    return markdownTwin(url.pathname) ? withVary(response, 'Accept') : response;
  },
};

async function handle(request, env) {
  const url = new URL(request.url);
  const cookie = request.headers.get('Cookie') || '';

  // Agents asking for Markdown get the page's twin, ahead of the locale
  // redirect: the twin is English, and an agent's Accept-Language says
  // little about what it wants to read.
  const twin = markdownTwin(url.pathname);
  if (
    twin &&
    (request.method === 'GET' || request.method === 'HEAD') &&
    prefersMarkdown(request.headers.get('Accept'))
  ) {
    const markdown = await env.ASSETS.fetch(
      new Request(new URL(twin, url), { method: request.method })
    );
    if (markdown.ok) return markdown;
  }

  // Only the root is a candidate for the locale redirect. run_worker_first
  // also lists the legal pages (for the Markdown twins above), so check the
  // path, and a config change can't redirect asset requests either.
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
    return withVary(response, 'Accept-Language, Cookie');
  }

  // Fetch unconditionally: a 304 would let the browser reuse an untagged copy
  // cached before the suggestion applied.
  const headers = new Headers(request.headers);
  headers.delete('If-None-Match');
  headers.delete('If-Modified-Since');
  const response = await env.ASSETS.fetch(new Request(request, { headers }));
  return response.ok ? withSuggestion(response, suggestion) : response;
}

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

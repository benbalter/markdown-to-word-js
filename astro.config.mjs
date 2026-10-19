import {
  defineConfig,
  fontProviders,
  passthroughImageService,
} from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import checks from '@nuasite/checks';
import { defaultLocale, localeMeta, locales } from './web/i18n/locales.ts';
import { SITE_URL } from './web/site.ts';
import serviceWorker from './web/pwa/service-worker.ts';

// Static site served by Cloudflare Workers Static Assets (wrangler.jsonc) at
// the custom domain in web/site.ts. Output stays `static`: there is no Worker
// script, only assets. The layout mirrors word2md.com
// (benbalter/word-to-markdown-js): Astro owns `web/`, the converter lives in
// `src/`.
export default defineConfig({
  site: SITE_URL,
  base: '/',
  srcDir: './web',
  outDir: './dist',
  publicDir: './public',
  output: 'static',
  // English stays at the root; other locales would live under a prefix (/de/).
  // The locale list comes from web/i18n/locales.ts.
  i18n: {
    defaultLocale,
    locales,
    routing: { prefixDefaultLocale: false },
  },
  // Every route is a directory index (/privacy/), so pin trailing slashes to
  // keep canonical and sitemap URLs in one consistent form.
  trailingSlash: 'always',
  // Inline stylesheets to remove the render-blocking CSS request.
  build: { inlineStylesheets: 'always' },
  // Content-Security-Policy, emitted per page as a <meta http-equiv> tag with
  // hashes for Astro's inline scripts and styles. "Nothing is uploaded" is a
  // promise: nothing the page sends carries the document. connect-src allows
  // https: because html-to-docx fetches the remote images a document links to
  // in order to embed them (the preview loads the same URLs through img-src),
  // plus Cloudflare Web Analytics, which the privacy policy discloses and which
  // Cloudflare injects at the edge, so it never appears in dist/. script-src
  // stays 'self', so injected code can't run to use that. worker-src 'self'
  // admits the offline service worker (/sw.js). Style *attributes* are blocked
  // once hashes are present, so markup must not use style="…".
  // frame-ancestors can't be set from a <meta> tag; it's in public/_headers.
  // Shiki highlights with inline style attributes, which the CSP blocks.
  markdown: { syntaxHighlight: false },
  security: {
    csp: {
      directives: [
        "default-src 'self'",
        "img-src 'self' data: blob: https:",
        "font-src 'self'",
        "connect-src 'self' https:",
        "worker-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ],
      scriptDirective: {
        resources: ["'self'", 'https://static.cloudflareinsights.com'],
      },
      styleDirective: { resources: ["'self'"] },
    },
  },
  integrations: [
    // Writes dist/sw.js for offline use after a first visit, and is where the
    // kill switch lands (web/pwa/config.ts).
    serviceWorker(),
    // The `i18n` block makes the sitemap emit hreflang alternates once there
    // is more than one locale. Astro's top-level i18n config doesn't reach it.
    sitemap({
      i18n: {
        defaultLocale,
        locales: Object.fromEntries(
          locales.map((l) => [l, localeMeta[l].htmlLang])
        ),
      },
    }),
    // Build-time SEO / accessibility / performance / GEO validation. Errors
    // fail the build; warnings are advisory.
    checks({
      mode: 'essential',
      seo: true,
      performance: true,
      accessibility: true,
      geo: true,
      failOnError: true,
      failOnWarning: false,
    }),
  ],
  // astro:assets is only used for the Fonts API, so skip the sharp service.
  image: { service: passthroughImageService() },
  // Self-hosted brand fonts (same as word2md.com), served from our own origin.
  fonts: [
    {
      provider: fontProviders.fontsource(),
      name: 'Fraunces',
      cssVariable: '--font-fraunces',
      weights: [400, 500, 600],
      styles: ['normal', 'italic'],
      subsets: ['latin', 'latin-ext', 'vietnamese'],
      fallbacks: ['Georgia', 'serif'],
      display: 'swap',
    },
    {
      provider: fontProviders.fontsource(),
      name: 'Hanken Grotesk',
      cssVariable: '--font-hanken',
      weights: [400, 500, 600, 700],
      styles: ['normal'],
      subsets: ['latin', 'latin-ext', 'vietnamese'],
      fallbacks: ['system-ui', 'sans-serif'],
      display: 'swap',
    },
    {
      provider: fontProviders.fontsource(),
      name: 'JetBrains Mono',
      cssVariable: '--font-jetbrains',
      weights: [400, 500, 700],
      styles: ['normal'],
      subsets: ['latin', 'latin-ext', 'vietnamese'],
      fallbacks: ['ui-monospace', 'monospace'],
      display: 'swap',
    },
  ],
  vite: {
    plugins: [tailwindcss()],
    // html-to-docx's browser build reads the Node `global`.
    define: { global: 'globalThis' },
    // html-to-docx is one large chunk (~1.7 MB minified). It's import()ed on
    // demand by src/index.ts, never on first paint, so the size is expected.
    build: { chunkSizeWarningLimit: 2000 },
    optimizeDeps: {
      // Point Vite's dependency scanner at the converter entry so it doesn't
      // try to parse the .astro pages as JS.
      entries: ['src/index.ts'],
    },
  },
});

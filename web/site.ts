// Single source of truth for the site's domain and repository. astro.config.mjs
// reads SITE_URL; the static files in public/ that can't import it are checked
// against it by test/site-urls.test.ts.
//
// Keep this module pure data: the Astro config, Vitest and Playwright import it.

export const SITE_HOST = 'md2word.app';
export const SITE_URL = `https://${SITE_HOST}`;
export const REPO_URL = 'https://github.com/benbalter/markdown-to-word-js';
/** The sibling converter that goes the other way. */
export const WORD_TO_MARKDOWN_URL = 'https://word2md.com';
/** utm_source for outbound promo links. */
export const UTM_SOURCE = 'md2word';

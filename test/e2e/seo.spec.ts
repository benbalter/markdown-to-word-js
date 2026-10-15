import { test, expect } from '@playwright/test';
import { SITE_URL } from '../../web/site.ts';

// The head tags search engines and link previews read. Build-time checks
// (@nuasite/checks) cover lengths and presence; these pin the values.

test.describe('SEO', () => {
  test('home page has a self-canonical URL, social tags, and an OG image', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Markdown to Word/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      `${SITE_URL}/`
    );
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      'content',
      `${SITE_URL}/og/en.png`
    );
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
      'content',
      'summary_large_image'
    );
    const og = await page.request.get('/og/en.png');
    expect(og.status()).toBe(200);
  });

  test('the sitemap and the head agree on every hreflang', async ({ page }) => {
    // Conflicting hreflang signals make search engines ignore both.
    await page.goto('/');
    const head = await page
      .locator('link[rel="alternate"][hreflang]')
      .evaluateAll((links) =>
        links
          .map((l) => `${l.getAttribute('hreflang')} ${l.getAttribute('href')}`)
          .filter((pair) => !pair.startsWith('x-default'))
          .sort()
      );
    const xml = await (await page.request.get('/sitemap-0.xml')).text();
    const home = xml.match(
      new RegExp(`<url><loc>${SITE_URL}/</loc>(.*?)</url>`)
    )?.[1];
    const sitemap = [
      ...(home ?? '').matchAll(/hreflang="([^"]+)" href="([^"]+)"/g),
    ]
      .map(([, lang, href]) => `${lang} ${href}`)
      .sort();
    expect(head.length).toBeGreaterThan(1);
    expect(sitemap).toEqual(head);
  });

  test('structured data describes the app and mirrors the visible FAQ', async ({
    page,
  }) => {
    await page.goto('/');
    const json = await page
      .locator('script[type="application/ld+json"]')
      .textContent();
    const graph = (JSON.parse(json ?? '{}') as { '@graph': unknown[] })[
      '@graph'
    ] as Array<Record<string, unknown>>;

    const app = graph.find((node) => node['@type'] === 'WebApplication');
    expect(app?.url).toBe(`${SITE_URL}/`);
    expect(app?.isAccessibleForFree).toBe(true);

    const faq = graph.find((node) => node['@type'] === 'FAQPage');
    const questions = (faq?.mainEntity as Array<{ name: string }>).map(
      (q) => q.name
    );
    const visible = await page.locator('details summary').allTextContents();
    expect(questions).toEqual(visible.map((q) => q.trim()));
  });

  test('robots.txt, the sitemap, and llms.txt are served', async ({
    request,
  }) => {
    expect((await request.get('/robots.txt')).status()).toBe(200);
    const sitemap = await request.get('/sitemap-index.xml');
    expect(sitemap.status()).toBe(200);
    expect((await request.get('/llms.txt')).status()).toBe(200);
  });
});

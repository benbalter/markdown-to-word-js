import { readFileSync } from 'fs';
import { test, expect } from '@playwright/test';
import { SITE_URL, WORD_TO_MARKDOWN_URL } from '../../web/site.ts';

// What crawlers and AI agents read: robots.txt, llms.txt / llms-full.txt,
// each page's Markdown twin, and the JSON-LD. The generated files come from
// web/agent/markdown.ts; the Worker's Accept negotiation is unit-tested in
// worker.test.ts, since the preview server doesn't run the Worker.

const en = JSON.parse(
  readFileSync(new URL('../../web/i18n/en.json', import.meta.url), 'utf8')
) as { faqs: { q: string }[]; steps: { t: string }[] };

// Escape every regex metacharacter (and backslash), not just dots, so the
// pattern stays correct whatever SITE_URL holds.
const escaped = SITE_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test.describe('Agent-readable surfaces', () => {
  test('robots.txt welcomes crawlers and states content signals', async ({
    request,
  }) => {
    const body = await (await request.get('/robots.txt')).text();
    expect(body).toContain('Allow: /');
    expect(body).toMatch(
      /^Content-Signal: search=yes, ai-input=yes, ai-train=yes$/m
    );
    expect(body).toContain(`Sitemap: ${SITE_URL}/sitemap-index.xml`);
  });

  test('llms.txt links a Markdown twin for every page, and each one exists', async ({
    request,
  }) => {
    const llms = await (await request.get('/llms.txt')).text();
    expect(llms).toMatch(/^# Markdown to Word$/m);
    expect(llms).toContain('npm install markdown-to-word');
    expect(llms).toContain(`${WORD_TO_MARKDOWN_URL}/`);

    const twins = [
      ...llms.matchAll(new RegExp(`\\(${escaped}(/[^)]+\\.md)\\)`, 'g')),
    ].map((m) => m[1]);
    expect(twins).toEqual(['/index.md', '/privacy.md', '/terms.md']);
    for (const path of twins) {
      const res = await request.get(path);
      expect(res.status(), path).toBe(200);
      expect(res.headers()['content-type'], path).toContain('text/markdown');
      expect(await res.text(), path).toMatch(/^# /);
    }
  });

  test('the home twin carries the page copy, steps, and every FAQ', async ({
    request,
  }) => {
    const md = await (await request.get('/index.md')).text();
    for (const step of en.steps) expect(md).toContain(`**${step.t}:**`);
    for (const faq of en.faqs) expect(md).toContain(`### ${faq.q}`);
    // Literal Markdown in table cells survives as code, backticks included.
    expect(md).toContain('| ```` `code` · ``` ```` |');
    expect(md).toContain('| `\\| a \\| b \\|` |');
  });

  test('llms-full.txt includes every page', async ({ request }) => {
    const full = await (await request.get('/llms-full.txt')).text();
    expect(full).toContain('# Markdown to Word');
    expect(full).toContain('# Your privacy');
    expect(full).toContain('# Terms of Use');
  });

  test('English pages advertise their twin; localized ones do not', async ({
    page,
  }) => {
    const alt = page.locator('link[rel="alternate"][type="text/markdown"]');
    await page.goto('/');
    await expect(alt).toHaveAttribute('href', '/index.md');
    await page.goto('/terms/');
    await expect(alt).toHaveAttribute('href', '/terms.md');
    await page.goto('/de/');
    await expect(alt).toHaveCount(0);
  });

  test('JSON-LD describes the app, the package, the steps, and the FAQ', async ({
    page,
  }) => {
    await page.goto('/');
    const json = await page
      .locator('script[type="application/ld+json"]')
      .textContent();
    const graph = JSON.parse(json ?? '{}')['@graph'] as Record<
      string,
      unknown
    >[];
    expect(graph.map((n) => n['@type'])).toEqual([
      'WebApplication',
      'WebSite',
      'SoftwareSourceCode',
      'HowTo',
      'FAQPage',
    ]);
    const howTo = graph.find((n) => n['@type'] === 'HowTo');
    expect((howTo?.step as unknown[]).length).toBe(en.steps.length);
  });
});

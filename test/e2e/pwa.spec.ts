import { test, expect, type Page } from '@playwright/test';
import { readdirSync } from 'fs';
import { readFile } from 'fs/promises';
import JSZip from 'jszip';
import path from 'path';
import { fileURLToPath } from 'url';

// The rest of the suite blocks service workers (playwright.config.ts) so they
// can't bypass page.route() mocks; this spec is the one that exercises it.
test.use({ serviceWorkers: 'allow' });

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Every chunk the build emitted, which the worker must precache: the patches
// fall back to an unpatched document instead of failing when they can't load,
// so a missing one would only show in the .docx.
const CHUNKS = readdirSync(path.join(root, 'dist/_astro'))
  .filter((name) => name.endsWith('.js'))
  .map((name) => `/_astro/${name}`);

// csp.spec.ts can't see the service worker's registration, since the config
// blocks it there, so this spec checks for violations too.
function trackViolations(page: Page): string[] {
  const violations: string[] = [];
  page.on('console', (msg) => {
    if (/Content Security Policy/i.test(msg.text())) {
      violations.push(msg.text());
    }
  });
  return violations;
}

async function cachedUrls(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const urls: string[] = [];
    for (const key of await caches.keys()) {
      const cache = await caches.open(key);
      for (const request of await cache.keys()) {
        urls.push(new URL(request.url).pathname);
      }
    }
    return urls;
  });
}

test.describe('Installable, offline-capable site', () => {
  test('links a web app manifest', async ({ page, request }) => {
    await page.goto('/');
    const href = await page
      .locator('link[rel="manifest"]')
      .getAttribute('href');
    expect(href).toBe('/manifest.webmanifest');
    const manifest = await (await request.get(href!)).json();
    expect(manifest).toMatchObject({
      name: 'Markdown to Word',
      short_name: 'md2word',
      start_url: '/',
    });
    for (const icon of manifest.icons) {
      expect((await request.get(icon.src)).ok()).toBe(true);
    }
  });

  test('converts, copies, and downloads offline after a first visit', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const violations = trackViolations(page);
    await page.goto('/');
    // `ready` resolves once the worker is active, i.e. after install finished
    // precaching the converter and caching this page.
    const scope = await page.evaluate(
      async () => (await navigator.serviceWorker.ready).scope
    );
    expect(new URL(scope).pathname).toBe('/');
    expect(CHUNKS.length).toBeGreaterThan(0);
    expect(await cachedUrls(page)).toEqual(expect.arrayContaining(CHUNKS));

    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('#markdown-input')).toBeVisible();
    expect(
      await page.evaluate(() => navigator.serviceWorker.controller !== null)
    ).toBe(true);
    // Really offline: a file the worker passes through can't load.
    expect(
      await page.evaluate(() =>
        fetch('/robots.txt').then(
          () => 'loaded',
          () => 'failed'
        )
      )
    ).toBe('failed');

    // A remote image can't be fetched offline, so it becomes its alt text;
    // the table and code block need the structure and code-block patches.
    await page
      .locator('#markdown-input')
      .fill(
        '# Offline\n\n![A chart](https://images.example/chart.png)\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n```js\nconst x = 1;\nconst y = 2;\n```\n'
      );
    await page.locator('#convert-button').click();
    await expect(page.locator('#results')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#error-alert')).toHaveCount(0);

    await page.locator('#copy-button').click();
    await expect(page.locator('#copy-label')).toHaveText('Copied!');
    const html = await page.evaluate(async () => {
      const [item] = await navigator.clipboard.read();
      return (await item.getType('text/html')).text();
    });
    expect(html).toContain('Offline');

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#download-button').click(),
    ]);
    expect(download.suggestedFilename()).toBe('offline.docx');
    const zip = await JSZip.loadAsync(await readFile((await download.path())!));
    const xml = await zip.file('word/document.xml')!.async('string');
    expect(xml).toContain('A chart');
    // Patched, not the unpatched fallback: a header row, and the code block's
    // newline as a line break.
    expect(xml).toContain('<w:tblHeader/>');
    expect(xml).toContain('<w:br/>');

    expect(violations).toEqual([]);
  });
});

import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { SITE_HOST } from '../../web/site.ts';

// The anonymous conversion counter's beacon (web/scripts/analytics.ts),
// ported from word2md.com's e2e/conversion-beacon.spec.ts. It only fires on
// md2word.app, so these tests serve this build at https://md2word.app through
// page.route() and stub navigator.sendBeacon to record what would be sent.
// Nothing reaches the real site: the routes answer every request, and the
// host resolver rule sends anything that slips past them to a closed local
// port instead.

const fixtures = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../fixtures'
);

const PROD = `https://${SITE_HOST}`;

test.use({
  launchOptions: { args: [`--host-resolver-rules=MAP ${SITE_HOST} 127.0.0.1`] },
});

// Serve the local build as md2word.app, record beacons, and stub WebMCP so
// the agent tool can be called. `failConverter` makes the converter chunk
// fail to load, for the error outcome.
async function openAsProduction(
  page: Page,
  baseURL: string,
  { failConverter = false } = {}
): Promise<void> {
  await page.context().route(`${PROD}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/event') {
      await route.fulfill({ status: 204 });
      return;
    }
    if (failConverter && /^\/_astro\/converter\./.test(url.pathname)) {
      await route.abort();
      return;
    }
    const response = await route.fetch({
      url: `${baseURL}${url.pathname}${url.search}`,
    });
    await route.fulfill({ response });
  });
  await page.addInitScript(() => {
    const sent: string[] = [];
    (window as unknown as { __beacons: string[] }).__beacons = sent;
    navigator.sendBeacon = (url: string | URL): boolean => {
      sent.push(String(url));
      return true;
    };
    const tools: Record<string, { execute: (i: unknown) => unknown }> = {};
    Object.defineProperty(document, 'modelContext', {
      value: {
        registerTool: (tool: { name: string; execute: () => unknown }) => {
          tools[tool.name] = tool;
        },
      },
    });
    (window as unknown as { __tools: typeof tools }).__tools = tools;
  });
  await page.goto(`${PROD}/`);
}

// The beacons sent so far, as parsed query parameters.
async function beacons(page: Page): Promise<Record<string, string>[]> {
  const urls = await page.evaluate(
    () => (window as unknown as { __beacons: string[] }).__beacons
  );
  return urls.map((url) => {
    const parsed = new URL(url, PROD);
    expect(parsed.pathname).toBe('/api/event');
    return Object.fromEntries(parsed.searchParams);
  });
}

test.describe('conversion beacon', () => {
  // A prefetch can still be proxying a chunk when a test ends; drop it
  // instead of failing on the closed context.
  test.afterEach(async ({ page }) => {
    await page.context().unrouteAll({ behavior: 'ignoreErrors' });
  });

  test('a chosen file sends s=drop, and nothing else', async ({
    page,
    baseURL,
  }) => {
    await openAsProduction(page, baseURL!);
    await page.locator('#file').setInputFiles(path.join(fixtures, 'mixed.md'));
    await expect(page.locator('#results')).toBeVisible({ timeout: 15000 });
    await expect.poll(() => beacons(page)).toHaveLength(1);
    // Exactly these keys: no content, filename, size, or identifier.
    expect(await beacons(page)).toEqual([{ o: 'success', l: 'en', s: 'drop' }]);
  });

  test('a dropped file sends s=drop', async ({ page, baseURL }) => {
    await openAsProduction(page, baseURL!);
    await page.evaluate(() => {
      const data = new DataTransfer();
      data.items.add(new File(['# Dropped\n'], 'dropped.md'));
      document.body.dispatchEvent(
        new DragEvent('drop', {
          bubbles: true,
          cancelable: true,
          dataTransfer: data,
        })
      );
    });
    await expect(page.locator('#results')).toBeVisible({ timeout: 15000 });
    await expect
      .poll(() => beacons(page))
      .toEqual([{ o: 'success', l: 'en', s: 'drop' }]);
  });

  test('pasted Markdown sends s=paste from the button and the shortcut, once each', async ({
    page,
    baseURL,
  }) => {
    await openAsProduction(page, baseURL!);
    await page.locator('#markdown-input').fill('# Pasted\n\nHello');
    await page.locator('#convert-button').click();
    await expect(page.locator('#results')).toBeVisible({ timeout: 15000 });
    // Using the result isn't another conversion.
    await Promise.all([
      page.waitForEvent('download'),
      page.locator('#download-button').click(),
    ]);
    await page.locator('#copy-button').click();

    await page.locator('#convert-another').click();
    await page.locator('#markdown-input').fill('# Typed');
    await page.locator('#markdown-input').press('ControlOrMeta+Enter');
    await expect(page.locator('#results')).toBeVisible({ timeout: 15000 });
    await expect
      .poll(() => beacons(page))
      .toEqual([
        { o: 'success', l: 'en', s: 'paste' },
        { o: 'success', l: 'en', s: 'paste' },
      ]);
  });

  test('a WebMCP conversion sends s=webmcp', async ({ page, baseURL }) => {
    await openAsProduction(page, baseURL!);
    const result = await page.evaluate(
      () =>
        (
          window as unknown as {
            __tools: Record<string, { execute: (i: unknown) => unknown }>;
          }
        ).__tools.convert_markdown_to_docx.execute({
          markdown: '# From an agent',
        }) as Promise<{ isError?: boolean }>
    );
    expect(result.isError).toBeFalsy();
    await expect
      .poll(() => beacons(page))
      .toEqual([{ o: 'success', l: 'en', s: 'webmcp' }]);
  });

  test('a failed conversion sends o=error with its source', async ({
    page,
    baseURL,
  }) => {
    await openAsProduction(page, baseURL!, { failConverter: true });
    await page.locator('#markdown-input').fill('# Doomed');
    await page.locator('#convert-button').click();
    await expect(page.locator('#error-alert')).toBeVisible({ timeout: 15000 });
    await expect
      .poll(() => beacons(page))
      .toEqual([{ o: 'error', l: 'en', s: 'paste' }]);
  });

  test('a rejected file sends nothing', async ({ page, baseURL }) => {
    await openAsProduction(page, baseURL!);
    await page.locator('#file').setInputFiles({
      name: 'report.docx',
      mimeType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: Buffer.from('PK'),
    });
    await expect(page.locator('#error-alert')).toBeVisible();
    expect(await beacons(page)).toEqual([]);
  });

  test('sends the localized page’s locale key', async ({ page, baseURL }) => {
    await openAsProduction(page, baseURL!);
    await page.goto(`${PROD}/zh-hant/`);
    await page.locator('#markdown-input').fill('# 你好');
    await page.locator('#convert-button').click();
    await expect(page.locator('#results')).toBeVisible({ timeout: 15000 });
    await expect
      .poll(() => beacons(page))
      .toEqual([{ o: 'success', l: 'zh-hant', s: 'paste' }]);
  });

  test(`sends nothing off ${SITE_HOST}`, async ({ page }) => {
    await page.addInitScript(() => {
      const sent: string[] = [];
      (window as unknown as { __beacons: string[] }).__beacons = sent;
      navigator.sendBeacon = (url: string | URL): boolean => {
        sent.push(String(url));
        return true;
      };
    });
    const posts: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/event')) posts.push(request.url());
    });
    await page.goto('/');
    await page.locator('#markdown-input').fill('# Local');
    await page.locator('#convert-button').click();
    await expect(page.locator('#results')).toBeVisible({ timeout: 15000 });
    expect(await beacons(page)).toEqual([]);
    expect(posts).toEqual([]);
  });
});

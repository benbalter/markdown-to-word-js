import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'fs/promises';
import JSZip from 'jszip';
import path from 'path';
import { fileURLToPath } from 'url';

// The site ships a strict Content-Security-Policy (astro.config.mjs). These
// specs fail on any violation, including during a real conversion: the
// html-to-docx bundle must keep working without 'unsafe-eval'.

async function trackViolations(page: Page): Promise<string[]> {
  const violations: string[] = [];
  await page.exposeFunction('__reportCspViolation', (v: string) => {
    violations.push(v);
  });
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      (
        window as unknown as { __reportCspViolation: (v: string) => void }
      ).__reportCspViolation(
        `${e.effectiveDirective} blocked ${e.blockedURI || '(inline)'} at ${e.sourceFile}:${e.lineNumber}`
      );
    });
  });
  page.on('console', (msg) => {
    if (/Content Security Policy/i.test(msg.text())) {
      violations.push(msg.text());
    }
  });
  return violations;
}

// A real (if tiny) photo.
const PHOTO = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures/photo.png'
);

test.describe('Content-Security-Policy', () => {
  test('a remote image converts without CSP violations', async ({ page }) => {
    const violations = await trackViolations(page);
    await page.route('https://images.example/**', (route) =>
      route.fulfill({
        path: PHOTO,
        contentType: 'image/png',
        headers: { 'access-control-allow-origin': '*' },
      })
    );
    await page.goto('/');
    await page
      .locator('#markdown-input')
      .fill('# Pic\n\n![photo](https://images.example/photo.png)');
    await page.locator('#convert-button').click();
    await expect(page.locator('#results')).toBeVisible({ timeout: 15000 });
    expect(violations).toEqual([]);

    // The image is embedded in the .docx, not just shown in the preview.
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#download-button').click(),
    ]);
    const zip = await JSZip.loadAsync(await readFile((await download.path())!));
    expect(
      Object.keys(zip.files).some((f) => f.startsWith('word/media/'))
    ).toBe(true);
  });

  test('quotes, footnotes and a broken image convert without CSP violations', async ({
    page,
  }) => {
    const violations = await trackViolations(page);
    await page.route('https://images.example/**', (route) =>
      route.fulfill({ status: 404, body: 'Not found' })
    );
    await page.goto('/');
    await page
      .locator('#markdown-input')
      .fill(
        '> p1\n>\n> p2\n\nPress <kbd>Ctrl</kbd>[^1].\n\n[^1]: The note.\n\n![A chart](https://images.example/chart.png)\n'
      );
    await page.locator('#convert-button').click();
    await expect(page.locator('#results')).toBeVisible({ timeout: 15000 });
    expect(violations).toEqual([]);

    // The footnote links stay in the page instead of opening a new tab.
    const reference = page.locator('#rendered a[href="#footnote-1"]');
    await expect(reference).not.toHaveAttribute('target', /.*/);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#download-button').click(),
    ]);
    const zip = await JSZip.loadAsync(await readFile((await download.path())!));
    const xml = await zip.file('word/document.xml')!.async('string');
    for (const text of ['>p1<', '>p2<', '>Ctrl<', '>The note.<', '>A chart<']) {
      expect(xml).toContain(text);
    }
    expect(xml).not.toContain('[^1]');
  });

  test('pages ship a CSP that never allows eval or plugins', async ({
    page,
  }) => {
    await page.goto('/');
    const csp = await page
      .locator('meta[http-equiv="content-security-policy"]')
      .getAttribute('content');
    // https: so html-to-docx can fetch the images a document links to.
    expect(csp).toContain("connect-src 'self' https:;");
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toContain('unsafe-eval');
  });

  for (const url of ['/', '/zh/', '/privacy/', '/terms/']) {
    test(`${url} loads without CSP violations`, async ({ page }) => {
      const violations = await trackViolations(page);
      await page.goto(url);
      await page.waitForLoadState('networkidle');
      expect(violations).toEqual([]);
    });
  }

  test('a full conversion (preview, copy, download) has no violations', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const violations = await trackViolations(page);

    await page.goto('/');
    await page
      .locator('#markdown-input')
      .fill(
        '# Report\n\n**Bold**, *italic*, `code`.\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n```js\nconst x = 1;\n```\n'
      );
    await page.locator('#convert-button').click();
    await expect(page.locator('#results')).toBeVisible({ timeout: 15000 });

    await page.locator('#copy-button').click();
    await expect(page.locator('#copy-label')).toHaveText('Copied!');

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#download-button').click(),
    ]);
    expect(download.suggestedFilename()).toBe('report.docx');

    expect(violations).toEqual([]);
  });
});

import { test, expect, type Page } from '@playwright/test';

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

test.describe('Content-Security-Policy', () => {
  test('pages ship a CSP that connects only to the same origin', async ({
    page,
  }) => {
    await page.goto('/');
    const csp = await page
      .locator('meta[http-equiv="content-security-policy"]')
      .getAttribute('content');
    expect(csp).toContain("connect-src 'self' https://cloudflareinsights.com;");
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toContain('unsafe-eval');
  });

  for (const url of ['/', '/privacy/', '/terms/']) {
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

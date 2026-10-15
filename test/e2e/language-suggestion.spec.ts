import { test, expect, type Page } from '@playwright/test';

// The "also available in …" banner on the English root, and the `lang` cookie
// that stops the edge redirect from overriding a visitor's choice. In
// production the Cloudflare Worker (worker/index.js) tags <html
// data-suggest-locale>; the static test server has no Worker, so these tests
// add the attribute the same way by rewriting the root HTML in flight.

const BANNER = 'aside[aria-labelledby="lang-suggest-link"]';

async function serveRootWithSuggestion(
  page: Page,
  locale: string
): Promise<void> {
  await page.route(
    (url) => url.pathname === '/',
    async (route) => {
      const response = await route.fetch();
      const html = (await response.text()).replace(
        '<html ',
        `<html data-suggest-locale="${locale}" `
      );
      await route.fulfill({ response, body: html });
    }
  );
}

test.describe('Language suggestion banner', () => {
  test('shows nothing when the Worker suggests nothing', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator(BANNER)).toHaveCount(0);
  });

  test('suggests the flagged locale in its own language', async ({ page }) => {
    const violations: string[] = [];
    page.on('console', (msg) => {
      if (/Content Security Policy/i.test(msg.text()))
        violations.push(msg.text());
    });
    await serveRootWithSuggestion(page, 'id');
    await page.goto('/');

    const banner = page.locator(BANNER);
    await expect(banner).toBeVisible();
    await expect(banner).toHaveAttribute('lang', 'id');
    const link = banner.getByRole('link', {
      name: 'Juga tersedia dalam Bahasa Indonesia',
    });
    await expect(link).toHaveAttribute('href', '/id/');
    await expect(link).toHaveAttribute('hreflang', 'id');
    // The dismiss control is labelled in the suggested language too.
    await expect(banner.getByRole('button', { name: 'Tutup' })).toBeVisible();
    expect(violations).toEqual([]);
  });

  test('dismissing it keeps it off', async ({ page, context }) => {
    await serveRootWithSuggestion(page, 'vi');
    await page.goto('/');

    const banner = page.locator(BANNER);
    await banner.getByRole('button').click();
    await expect(banner).toHaveCount(0);
    expect(
      (await context.cookies()).find((c) => c.name === 'hint')?.value
    ).toBe('off');

    // Even if a cached page still carries the attribute, the cookie wins.
    await page.reload();
    await expect(banner).toHaveCount(0);
  });

  test('following it turns it off and lands on the locale', async ({
    page,
    context,
  }) => {
    await serveRootWithSuggestion(page, 'id');
    await page.goto('/');
    await page.locator(BANNER).getByRole('link').click();

    await expect(page).toHaveURL(/\/id\/$/);
    expect(
      (await context.cookies()).find((c) => c.name === 'hint')?.value
    ).toBe('off');
  });
});

test.describe('Language cookie', () => {
  test('a localized page records the language', async ({ page, context }) => {
    await page.goto('/zh/');
    await expect
      .poll(
        async () =>
          (await context.cookies()).find((c) => c.name === 'lang')?.value
      )
      .toBe('zh');
  });

  test('an English-only page does not pin the visitor to English', async ({
    page,
    context,
  }) => {
    await page.goto('/privacy/');
    await page.waitForLoadState('load');
    expect((await context.cookies()).find((c) => c.name === 'lang')).toBe(
      undefined
    );
  });
});

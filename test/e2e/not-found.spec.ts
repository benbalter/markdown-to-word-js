import { test, expect } from '@playwright/test';

// Unknown paths get the branded 404 (web/pages/404.astro), served by
// `not_found_handling: "404-page"` in wrangler.jsonc and by `astro preview`.

test.describe('404 page', () => {
  test('unknown paths return the branded not-found page', async ({ page }) => {
    const response = await page.goto('/definitely-not-a-page/');
    expect(response?.status()).toBe(404);

    await expect(page.locator('h1')).toHaveText('Page not found');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex'
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
    await expect(
      page.getByRole('link', { name: 'Convert Markdown to Word' })
    ).toHaveAttribute('href', '/');
  });
});

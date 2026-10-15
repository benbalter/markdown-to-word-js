import { test, expect } from '@playwright/test';

// The Open & Async promo has two placements, by funnel stage: the sponsor card
// before a conversion (utm_campaign=card), and a quiet pitch in the results
// pane after one (utm_campaign=results). They never show together.

test.describe('Open & Async promo funnel', () => {
  test('shows the sponsor card before conversion, tagged utm_campaign=card', async ({
    page,
  }) => {
    await page.goto('/');

    const card = page.locator('#promo-card');
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute(
      'href',
      /open-and-async\.com\/\?utm_source=md2word&.*utm_campaign=card/
    );
    await expect(page.locator('#results')).toBeHidden();
  });

  test('hides the card and reveals the results CTA after a conversion', async ({
    page,
  }) => {
    await page.goto('/');
    await page.locator('#markdown-input').fill('# Hello\n\nWorld');
    await page.locator('#convert-button').click();

    await expect(page.locator('#results')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#promo-card')).toBeHidden();

    const cta = page.locator('#results a[href*="utm_campaign=results"]');
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute(
      'href',
      /open-and-async\.com\/\?utm_source=md2word&.*utm_campaign=results/
    );
  });
});

import { test, expect } from '@playwright/test';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import mammoth from 'mammoth';
import { defaultLocale, locales } from '../../web/i18n/locales.ts';

// The converter in a real browser: inputs (file, drop, paste), the result
// actions, and the .docx itself, read back with mammoth.

const fixtures = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../fixtures'
);

test.describe('converter', () => {
  test('converts a chosen .md file and downloads a real Word document', async ({
    page,
  }) => {
    await page.goto('/');
    await page.locator('#file').setInputFiles(path.join(fixtures, 'mixed.md'));

    await expect(page.locator('#results')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#input')).toBeHidden();
    await expect(page.locator('#pre-result')).toBeHidden();
    await expect(page.locator('#download-button')).toBeFocused();
    await expect(page.locator('#rendered h1')).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#download-button').click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.docx$/);
    await expect(page.locator('#download-label')).toHaveText('Downloaded');

    const buffer = await readFile((await download.path())!);
    const { value: html } = await mammoth.convertToHtml({ buffer });
    const source = await readFile(path.join(fixtures, 'mixed.md'), 'utf8');
    const heading = source.match(/^# (.+)$/m)![1];
    expect(html).toContain(`<h1>${heading}</h1>`);
  });

  test('converts pasted Markdown, named after its first heading', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('#convert-button')).toBeDisabled();
    await page.locator('#markdown-input').fill('# Quarterly Plan\n\n- one');
    await page.locator('#markdown-input').press('ControlOrMeta+Enter');

    await expect(page.locator('#filename')).toHaveText('quarterly-plan.docx', {
      timeout: 15000,
    });
  });

  test('copies formatted text that pastes as rich text', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/');
    await page.locator('#markdown-input').fill('**Bold** move');
    await page.locator('#convert-button').click();
    await page.locator('#copy-button').click();
    await expect(page.locator('#copy-label')).toHaveText('Copied!');

    const html = await page.evaluate(async () => {
      const [item] = await navigator.clipboard.read();
      return (await item.getType('text/html')).text();
    });
    expect(html).toContain('<strong>Bold</strong>');
  });

  test('raw HTML in the Markdown never runs script in the preview', async ({
    page,
  }) => {
    await page.goto('/');
    await page
      .locator('#markdown-input')
      .fill('# Hi\n\n<img src="x" onerror="window.__xss = true">');
    await page.locator('#convert-button').click();
    await expect(page.locator('#results')).toBeVisible({ timeout: 15000 });

    await expect(page.locator('#rendered img')).not.toHaveAttribute(
      'onerror',
      /.*/
    );
    expect(
      await page.evaluate(() => 'xss' in window || '__xss' in window)
    ).toBe(false);
  });

  test('a dropped Word file is pointed at word2md.com', async ({ page }) => {
    await page.goto('/');
    await page.locator('#file').setInputFiles({
      name: 'report.docx',
      mimeType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: Buffer.from('PK'),
    });
    await expect(page.locator('#error-alert')).toContainText('word2md.com');
    await page.locator('#error-alert button').click();
    await expect(page.locator('#error-alert')).toHaveCount(0);
  });

  test('"Convert another" returns to an empty input', async ({ page }) => {
    await page.goto('/');
    await page.locator('#markdown-input').fill('# Done');
    await page.locator('#convert-button').click();
    await expect(page.locator('#results')).toBeVisible({ timeout: 15000 });

    await page.locator('#convert-another').click();
    await expect(page.locator('#input')).toBeVisible();
    await expect(page.locator('#pre-result')).toBeVisible();
    await expect(page.locator('#markdown-input')).toHaveValue('');
    await expect(page.locator('#markdown-input')).toBeFocused();
  });

  test('the style menu suggests 公文 fonts for Chinese text and remembers a choice', async ({
    page,
  }) => {
    await page.goto('/');
    // Outside /zh/ the menu waits until the text is Chinese.
    await expect(page.locator('#font-preset')).toBeHidden();
    await page
      .locator('#markdown-input')
      .fill('# 关于开展年度工作检查的通知\n\n各单位：现将有关事项通知如下。');
    await expect(page.locator('#font-preset')).toBeVisible();
    await expect(page.locator('#font-preset-hint')).toBeVisible();

    await page.locator('#font-preset').selectOption('chinese-official');
    await expect(page.locator('#font-preset-hint')).toBeHidden();

    await page.reload();
    await expect(page.locator('#font-preset')).toHaveValue('chinese-official');
    // A remembered preset keeps the menu in view on the next visit.
    await expect(page.locator('#font-preset')).toBeVisible();
  });

  test('the Chinese page always shows the style menu', async ({ page }) => {
    await page.goto('/zh/');
    await expect(page.locator('#font-preset')).toBeVisible();
  });

  // Every locale, before and after a conversion: translated labels run longer
  // than English, and the result pane's buttons only appear after one.
  for (const locale of locales) {
    const home = locale === defaultLocale ? '/' : `/${locale}/`;
    test(`${home} fits a phone screen without horizontal scrolling`, async ({
      page,
    }) => {
      const overflows = (): Promise<boolean> =>
        page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth
        );
      await page.setViewportSize({ width: 375, height: 800 });
      await page.goto(home);
      expect(await overflows()).toBe(false);

      await page.locator('#markdown-input').fill('# Plan\n\n- one');
      await page.locator('#markdown-input').press('ControlOrMeta+Enter');
      await expect(page.locator('#filename')).toHaveText('plan.docx', {
        timeout: 15000,
      });
      expect(await overflows()).toBe(false);
    });
  }
});

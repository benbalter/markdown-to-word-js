import { test, expect, type Page } from '@playwright/test';

// WebMCP tool (web/scripts/webmcp.ts). No shipping browser exposes
// document.modelContext to Playwright yet, so a stub records registrations
// and the test calls the tool's execute() as an agent's browser would.

interface ToolResult {
  content: { type: string; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

async function stubModelContext(page: Page): Promise<void> {
  await page.addInitScript(() => {
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
}

function callTool(page: Page, input: object): Promise<ToolResult> {
  return page.evaluate(
    (i) =>
      (
        window as unknown as {
          __tools: Record<string, { execute: (i: unknown) => unknown }>;
        }
      ).__tools.convert_markdown_to_docx.execute(i) as Promise<ToolResult>,
    input
  );
}

test.describe('WebMCP tool', () => {
  test.beforeEach(async ({ page }) => {
    await stubModelContext(page);
    await page.goto('/');
  });

  test('registers the converter tool', async ({ page }) => {
    const names = await page.evaluate(() =>
      Object.keys((window as unknown as { __tools: object }).__tools)
    );
    expect(names).toEqual(['convert_markdown_to_docx']);
  });

  test('converts Markdown for an agent and shows it on the page', async ({
    page,
  }) => {
    const result = await callTool(page, {
      markdown: '# Quarterly report\n\n| A | B |\n| - | - |\n| 1 | 2 |\n',
      font_preset: 'chinese-official',
    });
    expect(result.isError).toBeFalsy();
    const { filename, bytes, docx_base64 } = result.structuredContent as {
      filename: string;
      bytes: number;
      docx_base64: string;
    };
    expect(filename).toBe('quarterly-report.docx');
    const docx = Buffer.from(docx_base64, 'base64');
    expect(docx.byteLength).toBe(bytes);
    // A .docx is a zip: it starts with "PK".
    expect(docx.subarray(0, 2).toString()).toBe('PK');

    await expect(page.locator('#filename')).toHaveText(filename);
    await expect(page.locator('#rendered table')).toBeVisible();
    await expect(page.locator('#font-preset')).toHaveValue('chinese-official');
  });

  test('names the file as asked', async ({ page }) => {
    const result = await callTool(page, {
      markdown: 'No heading here.',
      filename: 'notes',
    });
    expect(result.structuredContent?.filename).toBe('notes.docx');
    await expect(page.locator('#filename')).toHaveText('notes.docx');
  });

  test('reports bad input as a tool error', async ({ page }) => {
    expect((await callTool(page, { markdown: '' })).isError).toBe(true);
    const unknown = await callTool(page, {
      markdown: '# A',
      font_preset: 'fancy',
    });
    expect(unknown.isError).toBe(true);
    expect(unknown.content[0].text).toContain('chinese-official');
  });
});

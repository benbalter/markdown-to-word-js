// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import mammoth from 'mammoth';

// The npm package's Node entry, in plain Node with no DOM, as a Node consumer
// gets it. The other tests run in jsdom, so they'd pass without the shim.
describe('Node entry', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts without a DOM, so the shim is what supplies one', () => {
    expect(globalThis.DOMParser).toBeUndefined();
    expect(globalThis.XMLSerializer).toBeUndefined();
  });

  it('converts Markdown, applying every .docx patch', async () => {
    // A patch that fails is skipped with a warning, not an error.
    const warn = vi.spyOn(console, 'warn');
    const { convertMarkdownToWord, FONT_PRESETS } =
      await import('../src/node.js');

    const blob = await convertMarkdownToWord(
      '# Title\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n---\n\n```\ncode\n```\n',
      { fontPreset: FONT_PRESETS['chinese-official'] }
    );

    expect(warn).not.toHaveBeenCalled();
    const { value } = await mammoth.convertToHtml({
      buffer: Buffer.from(await blob.arrayBuffer()),
    });
    expect(value).toContain('<h1>Title</h1>');
    expect(value).toContain('<table>');
    expect(value).toContain('code');
  });
});

import { describe, it, expect, vi, afterEach } from 'vitest';
import mammoth from 'mammoth';

vi.mock('../src/docx-code-blocks.js', () => ({
  formatCodeBlocks: vi
    .fn()
    .mockRejectedValue(new Error('code block patch failed')),
}));
vi.mock('../src/docx-font-preset.js', () => ({
  applyFontPreset: vi
    .fn()
    .mockRejectedValue(new Error('font preset patch failed')),
}));

import { convertMarkdownToWord } from '../src/converter';
import { CHINESE_OFFICIAL_DOC_FONTS } from '../src/font-presets';

describe('when a post-generation patch fails', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps the unpatched document instead of failing the conversion', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const blob = await convertMarkdownToWord('# Title\n\n```\ncode\n```\n', {
      fontPreset: CHINESE_OFFICIAL_DOC_FONTS,
    });
    const { value: html } = await mammoth.convertToHtml({
      buffer: Buffer.from(await blob.arrayBuffer()),
    });

    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('code');
    expect(warn).toHaveBeenCalledTimes(2);
  });
});

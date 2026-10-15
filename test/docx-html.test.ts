import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import mammoth from 'mammoth';
import { convertMarkdownToWord } from '../src/converter';
import { CODE_FONT, RULE_TEXT, prepareHtmlForDocx } from '../src/docx-html';
import { parseMarkdownToHtml } from '../src/markdown-parser';

function prepare(markdown: string): string {
  return prepareHtmlForDocx(parseMarkdownToHtml(markdown));
}

async function documentXml(markdown: string): Promise<string> {
  const blob = await convertMarkdownToWord(markdown);
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  return zip.file('word/document.xml')!.async('string');
}

describe('prepareHtmlForDocx', () => {
  describe('task lists', () => {
    it('replaces each checkbox with a character Word can show', () => {
      const html = prepare('- [x] done\n- [ ] todo\n');
      expect(html).not.toContain('<input');
      expect(html).toContain('<li>☒ done</li>');
      expect(html).toContain('<li>☐ todo</li>');
    });

    it('handles loose task lists, where each item is wrapped in a paragraph', () => {
      const html = prepare('- [x] done\n\n- [ ] todo\n');
      expect(html).not.toContain('<input');
      expect(html).toMatch(/<p>☒ done<\/p>/);
      expect(html).toMatch(/<p>☐ todo<\/p>/);
    });
  });

  describe('inline code', () => {
    it('names the code font, unquoted so the generator reads it whole', () => {
      expect(prepare('Run `npm test` now.\n')).toContain(
        `<code><span style="font-family: ${CODE_FONT}">npm test</span></code>`
      );
    });

    it('leaves code blocks alone', () => {
      expect(prepare('```\nblock\n```\n')).toBe(parseMarkdownToHtml('```\nblock\n```\n'));
    });
  });

  describe('style placeholder', () => {
    it('renames the CSP-safe placeholder to style in tags only, never in text', () => {
      const html = prepare('`x` and the words data-docx-style= stay put\n');
      expect(html).not.toContain('<span data-docx-style=');
      expect(html).toContain('<span style="font-family: Courier New">');
      expect(html).toContain('the words data-docx-style= stay put');
    });
  });

  describe('horizontal rules', () => {
    it('stands in a centered section break that reads fine if the rule patch fails', () => {
      expect(prepare('a\n\n---\n\nb\n')).toContain(
        `<p style="text-align: center">${RULE_TEXT}</p>`
      );
    });
  });

  describe('tables', () => {
    const table = '| Name | Age |\n| :-- | --: |\n| Alice | 30 |\n';

    it('bolds header cells', () => {
      expect(prepare(table)).toMatch(/<th[^>]*><strong>Name<\/strong><\/th>/);
    });

    it('turns GFM column alignment into a style the generator honors', () => {
      const html = prepare(table);
      expect(html).not.toContain('align=');
      expect(html).toContain('<td style="text-align: right;">30</td>');
      expect(html).toContain('<td style="text-align: left;">Alice</td>');
    });

    it('leaves an empty header cell empty', () => {
      expect(prepare('|   | b |\n| - | - |\n| 1 | 2 |\n')).toContain('<th></th>');
    });
  });
});

describe('in the generated .docx', () => {
  it('keeps done and pending tasks apart', async () => {
    const blob = await convertMarkdownToWord('- [x] done\n- [ ] todo\n');
    const { value } = await mammoth.extractRawText({
      buffer: Buffer.from(await blob.arrayBuffer()),
    });
    expect(value).toContain('☒ done');
    expect(value).toContain('☐ todo');
  });

  it('draws table borders and bolds and aligns cells', async () => {
    const xml = await documentXml('| Name | Age |\n| :-- | --: |\n| Alice | 30 |\n');
    expect(xml).toMatch(/<w:tblBorders>[\s\S]*w:val="single"/);
    expect(xml).toMatch(/<w:b\/>[\s\S]*?<w:t[^>]*>Name</);
    expect(xml).toMatch(/<w:jc w:val="right"\/>[\s\S]*?<w:t[^>]*>30</);
  });

  it('sets inline code in the code font', async () => {
    const xml = await documentXml('Run `npm test` now.\n');
    expect(xml).toMatch(
      new RegExp(`<w:rFonts w:ascii="${CODE_FONT}" w:hAnsi="${CODE_FONT}"/>\\s*</w:rPr>\\s*<w:t[^>]*>npm test<`)
    );
  });
});

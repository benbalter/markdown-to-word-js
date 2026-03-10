import { describe, it, expect } from 'vitest';
import { convertMarkdownToWord } from './converter.js';

describe('convertMarkdownToWord', () => {
  describe('basic conversion', () => {
    it('returns a Blob', async () => {
      const result = await convertMarkdownToWord('# Hello');
      expect(result).toBeInstanceOf(Blob);
    });

    it('returns a non-empty Blob', async () => {
      const result = await convertMarkdownToWord('# Hello');
      expect(result.size).toBeGreaterThan(0);
    });

    it('produces a valid docx content type', async () => {
      const result = await convertMarkdownToWord('# Hello World');
      // DOCX files are ZIP archives; check the Blob is valid
      const arrayBuffer = await result.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      // ZIP files start with PK (0x50, 0x4B)
      expect(bytes[0]).toBe(0x50);
      expect(bytes[1]).toBe(0x4b);
    });
  });

  describe('markdown content conversion', () => {
    it('converts plain text', async () => {
      const result = await convertMarkdownToWord('Hello world');
      expect(result.size).toBeGreaterThan(0);
    });

    it('converts headings', async () => {
      const result = await convertMarkdownToWord('# Heading 1\n## Heading 2');
      expect(result.size).toBeGreaterThan(0);
    });

    it('converts bold and italic text', async () => {
      const result = await convertMarkdownToWord(
        '**bold** and *italic* text'
      );
      expect(result.size).toBeGreaterThan(0);
    });

    it('converts lists', async () => {
      const result = await convertMarkdownToWord(
        '- Item 1\n- Item 2\n- Item 3'
      );
      expect(result.size).toBeGreaterThan(0);
    });

    it('converts ordered lists', async () => {
      const result = await convertMarkdownToWord(
        '1. First\n2. Second\n3. Third'
      );
      expect(result.size).toBeGreaterThan(0);
    });

    it('converts code blocks', async () => {
      const result = await convertMarkdownToWord(
        '```javascript\nconsole.log("hi");\n```'
      );
      expect(result.size).toBeGreaterThan(0);
    });

    it('converts tables', async () => {
      const md =
        '| Header 1 | Header 2 |\n|----------|----------|\n| Cell 1 | Cell 2 |';
      const result = await convertMarkdownToWord(md);
      expect(result.size).toBeGreaterThan(0);
    });

    it('converts blockquotes', async () => {
      const result = await convertMarkdownToWord('> This is a quote');
      expect(result.size).toBeGreaterThan(0);
    });

    it('converts links', async () => {
      const result = await convertMarkdownToWord(
        '[Link](https://example.com)'
      );
      expect(result.size).toBeGreaterThan(0);
    });

    it('converts horizontal rules', async () => {
      const result = await convertMarkdownToWord('---');
      expect(result.size).toBeGreaterThan(0);
    });

    it('converts complex markdown documents', async () => {
      const md = [
        '# Title',
        '',
        'A paragraph with **bold** and *italic* text.',
        '',
        '## Section',
        '',
        '- Item 1',
        '- Item 2',
        '',
        '> A quote',
        '',
        '```js',
        'const x = 1;',
        '```',
        '',
        '| A | B |',
        '|---|---|',
        '| 1 | 2 |',
      ].join('\n');

      const result = await convertMarkdownToWord(md);
      expect(result.size).toBeGreaterThan(0);
    });
  });

  describe('options', () => {
    it('accepts empty options', async () => {
      const result = await convertMarkdownToWord('# Hello', {});
      expect(result).toBeInstanceOf(Blob);
    });

    it('accepts filename option', async () => {
      const result = await convertMarkdownToWord('# Hello', {
        filename: 'test.docx',
      });
      expect(result).toBeInstanceOf(Blob);
    });

    it('accepts page margins option', async () => {
      const result = await convertMarkdownToWord('# Hello', {
        pageMargins: { top: 1, right: 1, bottom: 1, left: 1 },
      });
      expect(result).toBeInstanceOf(Blob);
    });

    it('accepts custom page margins', async () => {
      const result = await convertMarkdownToWord('# Hello', {
        pageMargins: { top: 0.5, right: 0.75, bottom: 0.5, left: 0.75 },
      });
      expect(result).toBeInstanceOf(Blob);
      expect(result.size).toBeGreaterThan(0);
    });
  });

  describe('error handling', () => {
    it('handles empty markdown string', async () => {
      const result = await convertMarkdownToWord('');
      expect(result).toBeInstanceOf(Blob);
    });
  });
});

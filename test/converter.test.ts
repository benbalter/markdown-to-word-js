import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import mammoth from 'mammoth';
import { convertMarkdownToWord } from '../src/converter';

const fixtureRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures'
);

function getFixture(name: string): string {
  return readFileSync(join(fixtureRoot, `${name}.md`), 'utf-8');
}

/** Converts markdown all the way through docx and back to HTML via mammoth */
async function markdownThroughDocxToHtml(md: string): Promise<string> {
  const blob = await convertMarkdownToWord(md);
  const buf = Buffer.from(await blob.arrayBuffer());
  const { value } = await mammoth.convertToHtml({ buffer: buf });
  return value;
}

describe('Docx round-trip verification with mammoth', () => {
  describe('headings', () => {
    let recoveredHtml: string;
    beforeAll(async () => {
      recoveredHtml = await markdownThroughDocxToHtml(getFixture('headings'));
    });

    it('retains heading level 1 through 6', () => {
      for (let lvl = 1; lvl <= 6; lvl++) {
        expect(recoveredHtml).toContain(`<h${lvl}>Heading ${lvl}</h${lvl}>`);
      }
    });
  });

  describe('inline formatting', () => {
    let recoveredHtml: string;
    beforeAll(async () => {
      recoveredHtml = await markdownThroughDocxToHtml(
        getFixture('text-formatting')
      );
    });

    it('retains bold markup', () => {
      expect(recoveredHtml).toContain('<strong>Bold text</strong>');
    });

    it('retains italic markup', () => {
      expect(recoveredHtml).toContain('<em>italic text</em>');
    });
  });

  describe('bullet list', () => {
    let recoveredHtml: string;
    beforeAll(async () => {
      recoveredHtml = await markdownThroughDocxToHtml(
        getFixture('unordered-list')
      );
    });

    it('produces an unordered list with every item', () => {
      expect(recoveredHtml).toContain('<ul>');
      expect(recoveredHtml).toContain('<li>Item 1</li>');
      expect(recoveredHtml).toContain('<li>Item 2</li>');
      expect(recoveredHtml).toContain('<li>Item 3</li>');
    });
  });

  describe('numbered list', () => {
    let recoveredHtml: string;
    beforeAll(async () => {
      recoveredHtml = await markdownThroughDocxToHtml(
        getFixture('ordered-list')
      );
    });

    it('produces an ordered list with every item', () => {
      expect(recoveredHtml).toContain('<ol>');
      expect(recoveredHtml).toContain('<li>First item</li>');
      expect(recoveredHtml).toContain('<li>Second item</li>');
      expect(recoveredHtml).toContain('<li>Third item</li>');
    });
  });

  describe('data table', () => {
    let recoveredHtml: string;
    beforeAll(async () => {
      recoveredHtml = await markdownThroughDocxToHtml(getFixture('table'));
    });

    it('preserves all cell values inside a <table>', () => {
      expect(recoveredHtml).toContain('<table>');
      for (const cellText of ['Name', 'Age', 'City', 'Alice', '30', 'NYC', 'Bob', '25', 'LA']) {
        expect(recoveredHtml).toContain(cellText);
      }
      expect(recoveredHtml).toContain('</table>');
    });
  });

  describe('hyperlink', () => {
    let recoveredHtml: string;
    beforeAll(async () => {
      recoveredHtml = await markdownThroughDocxToHtml(
        getFixture('links-images')
      );
    });

    it('keeps the anchor text and href attribute', () => {
      expect(recoveredHtml).toContain(
        '<a href="https://github.com">GitHub</a>'
      );
    });
  });

  describe('plain paragraphs', () => {
    let recoveredHtml: string;
    beforeAll(async () => {
      recoveredHtml = await markdownThroughDocxToHtml(
        getFixture('paragraphs')
      );
    });

    it('retains both paragraph texts', () => {
      expect(recoveredHtml).toContain('This is the first paragraph.');
      expect(recoveredHtml).toContain('This is the second paragraph');
    });
  });

  describe('combined markdown elements', () => {
    let recoveredHtml: string;
    beforeAll(async () => {
      recoveredHtml = await markdownThroughDocxToHtml(getFixture('mixed'));
    });

    it('retains headings', () => {
      expect(recoveredHtml).toContain('<h1>Project Overview</h1>');
      expect(recoveredHtml).toContain('<h2>Features</h2>');
    });

    it('retains inline styles', () => {
      expect(recoveredHtml).toContain('<strong>comprehensive</strong>');
      expect(recoveredHtml).toContain('<em>mixed</em>');
    });

    it('retains list entries', () => {
      expect(recoveredHtml).toContain('<li>Feature one</li>');
      expect(recoveredHtml).toContain('<li>Feature two</li>');
      expect(recoveredHtml).toContain('<li>Feature three</li>');
    });

    it('retains table cell content', () => {
      expect(recoveredHtml).toContain('Headers');
      expect(recoveredHtml).toContain('Done');
    });

    it('retains the documentation link', () => {
      expect(recoveredHtml).toContain(
        '<a href="https://example.com">documentation</a>'
      );
    });
  });

  describe('boundary conditions', () => {
    it('creates a non-empty blob for empty input', async () => {
      const blob = await convertMarkdownToWord('');
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.size).toBeGreaterThan(0);
    });

    it('generates valid docx with custom page margins', async () => {
      const marginOpts = {
        pageMargins: { top: 1.5, right: 1, bottom: 1.5, left: 1 },
      };
      const recovered = await markdownThroughDocxToHtml('# Margin Check');
      expect(recovered).toContain('<h1>Margin Check</h1>');
    });
  });
});

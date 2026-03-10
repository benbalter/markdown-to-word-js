import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseMarkdownToHtml,
  parseMarkdownToTokens,
  extractTextFromTokens,
} from '../src/markdown-parser';

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures'
);

/** Read a markdown fixture by base name (without .md extension) */
function readFixture(fixtureName: string): string {
  const fixturePath = join(fixturesDir, `${fixtureName}.md`);
  return readFileSync(fixturePath, 'utf-8');
}

/*
 * =====================================================
 * Fixture-based tests for parseMarkdownToHtml
 * =====================================================
 */
describe('Fixture tests: parseMarkdownToHtml', () => {
  describe('headings fixture', () => {
    const fixtureContent = readFixture('headings');

    it('produces h1 through h6 tags', () => {
      const result = parseMarkdownToHtml(fixtureContent);
      for (let level = 1; level <= 6; level++) {
        const tag = `<h${level}>Heading ${level}</h${level}>`;
        expect(result).toContain(tag);
      }
    });
  });

  describe('text-formatting fixture', () => {
    let result: string;

    beforeAll(() => {
      result = parseMarkdownToHtml(readFixture('text-formatting'));
    });

    it('wraps bold text in <strong>', () => {
      expect(result).toContain('<strong>Bold text</strong>');
    });

    it('wraps italic text in <em>', () => {
      expect(result).toContain('<em>italic text</em>');
    });

    it('wraps strikethrough text in <del>', () => {
      expect(result).toContain('<del>strikethrough text</del>');
    });

    it('renders inline code with <code> tag', () => {
      expect(result).toContain('<code>inline code</code>');
    });

    it('supports nested bold and italic', () => {
      expect(result).toMatch(/<strong>Bold and <em>nested italic<\/em> text\.<\/strong>/);
    });
  });

  describe('unordered-list fixture', () => {
    it('renders an unordered list with three items', () => {
      const result = parseMarkdownToHtml(readFixture('unordered-list'));
      expect(result).toMatch(/<ul[\s>]/);
      expect(result).toContain('Item 1');
      expect(result).toContain('Item 2');
      expect(result).toContain('Item 3');
      expect(result).toContain('</ul>');
    });
  });

  describe('ordered-list fixture', () => {
    it('renders an ordered list with three items', () => {
      const result = parseMarkdownToHtml(readFixture('ordered-list'));
      expect(result).toMatch(/<ol[\s>]/);
      expect(result).toContain('First item');
      expect(result).toContain('Second item');
      expect(result).toContain('Third item');
      expect(result).toContain('</ol>');
    });
  });

  describe('nested-list fixture', () => {
    it('renders a nested list structure', () => {
      const result = parseMarkdownToHtml(readFixture('nested-list'));
      expect(result).toMatch(/<ul[\s>]/);
      expect(result).toContain('Item 1');
      expect(result).toContain('Item 2');
    });
  });

  describe('task-list fixture', () => {
    it('renders task list items with checkboxes', () => {
      const result = parseMarkdownToHtml(readFixture('task-list'));
      expect(result).toContain('<input');
      expect(result).toContain('type="checkbox"');
      expect(result).toContain('disabled');
    });

    it('marks completed tasks as checked', () => {
      const result = parseMarkdownToHtml(readFixture('task-list'));
      expect(result).toContain('checked');
      expect(result).toContain('Completed task');
    });

    it('renders unchecked items without the checked attribute', () => {
      const result = parseMarkdownToHtml(readFixture('task-list'));
      expect(result).toContain('Pending task');
      // The unchecked checkbox should have disabled but not checked
      expect(result).toMatch(/<input disabled="" type="checkbox">\s*Pending task/);
    });
  });

  describe('code-block fixture', () => {
    it('renders a fenced code block with the correct language class', () => {
      const result = parseMarkdownToHtml(readFixture('code-block'));
      expect(result).toContain('<pre><code class="language-javascript">');
      expect(result).toContain('function hello()');
      expect(result).toContain('</code></pre>');
    });
  });

  describe('blockquote fixture', () => {
    it('wraps content in a blockquote element', () => {
      const result = parseMarkdownToHtml(readFixture('blockquote'));
      expect(result).toMatch(/<blockquote[\s>]/);
      expect(result).toContain('This is a blockquote.');
      expect(result).toContain('</blockquote>');
    });
  });

  describe('table fixture', () => {
    it('produces table headers', () => {
      const result = parseMarkdownToHtml(readFixture('table'));
      expect(result).toMatch(/<table[\s>]/);
      expect(result).toMatch(/<thead[\s>]/);
      expect(result).toContain('<th>Name</th>');
      expect(result).toContain('<th>Age</th>');
      expect(result).toContain('<th>City</th>');
    });

    it('produces table body rows', () => {
      const result = parseMarkdownToHtml(readFixture('table'));
      expect(result).toMatch(/<tbody[\s>]/);
      expect(result).toContain('<td>Alice</td>');
      expect(result).toContain('<td>30</td>');
      expect(result).toContain('<td>NYC</td>');
      expect(result).toContain('<td>Bob</td>');
      expect(result).toContain('</table>');
    });
  });

  describe('links-images fixture', () => {
    it('renders anchor tags with href', () => {
      const result = parseMarkdownToHtml(readFixture('links-images'));
      expect(result).toMatch(/<a href="https:\/\/github\.com"[^>]*>GitHub<\/a>/);
    });

    it('renders image tags with src and alt', () => {
      const result = parseMarkdownToHtml(readFixture('links-images'));
      expect(result).toContain('<img');
      expect(result).toContain('src="https://example.com/image.png"');
      expect(result).toContain('alt="Alt text"');
    });
  });

  describe('horizontal-rule fixture', () => {
    it('produces an <hr> element', () => {
      const result = parseMarkdownToHtml(readFixture('horizontal-rule'));
      expect(result).toMatch(/<hr/);
    });
  });

  describe('paragraphs fixture', () => {
    it('wraps text in <p> tags', () => {
      const result = parseMarkdownToHtml(readFixture('paragraphs'));
      expect(result).toContain('<p>This is the first paragraph.</p>');
    });

    it('inserts line breaks where appropriate', () => {
      const result = parseMarkdownToHtml(readFixture('paragraphs'));
      expect(result).toMatch(/<br/);
    });
  });

  describe('empty fixture', () => {
    it('returns an empty string for empty input', () => {
      const result = parseMarkdownToHtml(readFixture('empty'));
      expect(result).toBe('');
    });
  });

  describe('mixed fixture (comprehensive)', () => {
    let result: string;

    beforeAll(() => {
      result = parseMarkdownToHtml(readFixture('mixed'));
    });

    it('renders all major element types together', () => {
      // Headings
      expect(result).toContain('<h1>Project Overview</h1>');
      expect(result).toContain('<h2>Features</h2>');
      // Inline formatting
      expect(result).toContain('<strong>comprehensive</strong>');
      expect(result).toContain('<em>mixed</em>');
      // List
      expect(result).toMatch(/<ul[\s>]/);
      expect(result).toContain('Feature one');
      // Table
      expect(result).toMatch(/<table[\s>]/);
      // Blockquote
      expect(result).toMatch(/<blockquote[\s>]/);
      // Code with language
      expect(result).toContain('class="language-python"');
      // Link
      expect(result).toMatch(/<a href="https:\/\/example\.com"[^>]*>documentation<\/a>/);
      // Horizontal rule
      expect(result).toMatch(/<hr/);
    });
  });
});

/*
 * =====================================================
 * Fixture-based tests for parseMarkdownToTokens
 * =====================================================
 */
describe('Fixture tests: parseMarkdownToTokens', () => {
  it('identifies six heading tokens from the headings fixture', () => {
    const tokens = parseMarkdownToTokens(readFixture('headings'));
    const headingCount = tokens.filter((t) => t.type === 'heading').length;
    expect(headingCount).toBe(6);
  });

  it('identifies one list token from the unordered-list fixture', () => {
    const tokens = parseMarkdownToTokens(readFixture('unordered-list'));
    const listCount = tokens.filter((t) => t.type === 'list').length;
    expect(listCount).toBe(1);
  });

  it('identifies a table token from the table fixture', () => {
    const tokens = parseMarkdownToTokens(readFixture('table'));
    const tableCount = tokens.filter((t) => t.type === 'table').length;
    expect(tableCount).toBe(1);
  });

  it('identifies a blockquote token from the blockquote fixture', () => {
    const tokens = parseMarkdownToTokens(readFixture('blockquote'));
    const bqCount = tokens.filter((t) => t.type === 'blockquote').length;
    expect(bqCount).toBe(1);
  });

  it('identifies a code token from the code-block fixture', () => {
    const tokens = parseMarkdownToTokens(readFixture('code-block'));
    const codeCount = tokens.filter((t) => t.type === 'code').length;
    expect(codeCount).toBe(1);
  });

  it('identifies an hr token from the horizontal-rule fixture', () => {
    const tokens = parseMarkdownToTokens(readFixture('horizontal-rule'));
    const hrCount = tokens.filter((t) => t.type === 'hr').length;
    expect(hrCount).toBe(1);
  });

  it('returns an empty token array for the empty fixture', () => {
    const tokens = parseMarkdownToTokens(readFixture('empty'));
    expect(tokens).toHaveLength(0);
  });
});

/*
 * =====================================================
 * Fixture-based tests for extractTextFromTokens
 * =====================================================
 */
describe('Fixture tests: extractTextFromTokens', () => {
  it('extracts heading text from the headings fixture', () => {
    const tokens = parseMarkdownToTokens(readFixture('headings'));
    const text = extractTextFromTokens(tokens);
    expect(text).toContain('Heading 1');
    expect(text).toContain('Heading 6');
  });

  it('extracts bullet-prefixed items from the unordered-list fixture', () => {
    const tokens = parseMarkdownToTokens(readFixture('unordered-list'));
    const text = extractTextFromTokens(tokens);
    expect(text).toContain('• Item 1');
    expect(text).toContain('• Item 2');
    expect(text).toContain('• Item 3');
  });

  it('extracts blockquote text with > prefix', () => {
    const tokens = parseMarkdownToTokens(readFixture('blockquote'));
    const text = extractTextFromTokens(tokens);
    expect(text).toContain('>');
    expect(text).toContain('blockquote');
  });

  it('extracts code content from the code-block fixture', () => {
    const tokens = parseMarkdownToTokens(readFixture('code-block'));
    const text = extractTextFromTokens(tokens);
    expect(text).toContain('function hello()');
  });

  it('includes --- for horizontal rules', () => {
    const tokens = parseMarkdownToTokens(readFixture('horizontal-rule'));
    const text = extractTextFromTokens(tokens);
    expect(text).toContain('---');
  });

  it('returns an empty string for the empty fixture', () => {
    const tokens = parseMarkdownToTokens(readFixture('empty'));
    const text = extractTextFromTokens(tokens);
    expect(text).toBe('');
  });

  it('extracts paragraph text', () => {
    const tokens = parseMarkdownToTokens(readFixture('paragraphs'));
    const text = extractTextFromTokens(tokens);
    expect(text).toContain('This is the first paragraph.');
  });
});

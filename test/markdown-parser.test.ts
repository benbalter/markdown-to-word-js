import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseMarkdownToHtml,
  extractTitle,
  slugify,
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
 * extractTitle
 * =====================================================
 */
describe('extractTitle', () => {
  it('returns the text of the first H1 heading', () => {
    expect(extractTitle('# My Title\n\nSome content')).toBe('My Title');
  });

  it('returns the first H1 when multiple H1s exist', () => {
    expect(extractTitle('# First\n\n# Second')).toBe('First');
  });

  it('returns null when no H1 heading exists', () => {
    expect(extractTitle('## Only H2\n\nNo H1 here')).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(extractTitle('')).toBeNull();
  });

  it('ignores H2 through H6 headings', () => {
    const md = '## H2\n### H3\n#### H4\n##### H5\n###### H6';
    expect(extractTitle(md)).toBeNull();
  });

  it('extracts title from the mixed fixture', () => {
    const md = readFixture('mixed');
    expect(extractTitle(md)).toBe('Project Overview');
  });

  it('extracts title with inline formatting', () => {
    expect(extractTitle('# Hello **World**')).toBe('Hello **World**');
  });
});

/*
 * =====================================================
 * slugify
 * =====================================================
 */
describe('slugify', () => {
  it('converts a simple title to a slug', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('removes special characters', () => {
    expect(slugify('Hello, World!')).toBe('hello-world');
  });

  it('collapses multiple spaces into a single hyphen', () => {
    expect(slugify('Hello   World')).toBe('hello-world');
  });

  it('trims leading and trailing hyphens', () => {
    expect(slugify('  Hello World  ')).toBe('hello-world');
  });

  it('handles already slugified text', () => {
    expect(slugify('hello-world')).toBe('hello-world');
  });

  it('returns empty string for empty input', () => {
    expect(slugify('')).toBe('');
  });

  it('handles title with numbers', () => {
    expect(slugify('Chapter 1: Introduction')).toBe('chapter-1-introduction');
  });

  it('converts underscores to hyphens', () => {
    expect(slugify('hello_world_test')).toBe('hello-world-test');
  });

  it('handles complex titles', () => {
    expect(slugify('My Project — A Great (Example)!')).toBe(
      'my-project-a-great-example'
    );
  });
});


import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseMarkdownToHtml,
  extractTitle,
  slugify,
  renderPreviewHtml,
} from '../src/markdown-parser';

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

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
      expect(result).toMatch(
        /<strong>Bold and <em>nested italic<\/em> text\.<\/strong>/
      );
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
      expect(result).toMatch(
        /<input disabled="" type="checkbox">\s*Pending task/
      );
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
      expect(result).toMatch(
        /<a href="https:\/\/github\.com"[^>]*>GitHub<\/a>/
      );
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

    it('joins a single newline into the paragraph, as GitHub renders .md files', () => {
      const result = parseMarkdownToHtml(readFixture('paragraphs'));
      expect(result).not.toMatch(/<br/);
      expect(result).toContain(
        'second paragraph with a\nline break inside it.</p>'
      );
    });

    it('still breaks the line after two trailing spaces', () => {
      expect(parseMarkdownToHtml('line one  \nline two')).toContain(
        'line one<br>line two'
      );
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
      expect(result).toMatch(
        /<a href="https:\/\/example\.com"[^>]*>documentation<\/a>/
      );
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

  it('drops inline formatting, since the title is plain document metadata', () => {
    expect(extractTitle('# Hello **World**')).toBe('Hello World');
    expect(extractTitle('# Use `npm` and [the docs](https://x.test)')).toBe(
      'Use npm and the docs'
    );
  });

  it('keeps characters that look like HTML as text', () => {
    expect(extractTitle('# Q&A: `a < b`')).toBe('Q&A: a < b');
  });

  it('leaves footnote references out of the title', () => {
    expect(extractTitle('# Report[^1]\n\n[^1]: Draft.\n')).toBe('Report');
    expect(extractTitle('# Report[^undefined]\n')).toBe('Report');
  });
});

describe('footnotes', () => {
  const markdown = 'Note[^a] and[^b].\n\n[^a]: First.\n[^b]: Second.\n';

  it('numbers references and lists the notes after a rule', () => {
    const html = parseMarkdownToHtml(markdown);
    expect(html).toMatch(
      /Note<sup><a id="footnote-ref-a" href="#footnote-a"[^>]*>1<\/a><\/sup>/
    );
    expect(html).toMatch(/and<sup><a [^>]*>2<\/a><\/sup>/);
    expect(html).toMatch(
      /<hr[^>]*>\s*<section class="footnotes" data-footnotes>/
    );
    expect(html).toMatch(/<li id="footnote-a">\s*<p>First\./);
    expect(html).not.toContain('[^');
  });

  it('numbers each document from 1, even after extractTitle', () => {
    // extractTitle lexes without rendering, which would leave the footnote
    // extension's counter and state from the last document behind.
    extractTitle(markdown);
    extractTitle(markdown);
    const html = parseMarkdownToHtml('x[^n]\n\n[^n]: y\n');
    expect(html).toMatch(/x<sup><a [^>]*>1<\/a><\/sup>/);
  });

  it('keeps the ids and in-page links through the preview sanitizer', () => {
    const html = renderPreviewHtml(markdown);
    expect(html).toContain('id="footnote-ref-a"');
    expect(html).toContain('href="#footnote-a"');
    expect(html).toContain('id="footnote-a"');
    expect(html).toContain('href="#footnote-ref-a"');
    expect(html).toContain('data-footnote-backref');
  });
});

/*
 * =====================================================
 * renderPreviewHtml
 * =====================================================
 */
describe('renderPreviewHtml', () => {
  it('strips event handlers from raw HTML in the markdown', () => {
    const result = renderPreviewHtml('<img src="x" onerror="alert(1)">');
    expect(result).toContain('<img src="x">');
    expect(result).not.toContain('onerror');
  });

  it('strips script tags', () => {
    const result = renderPreviewHtml('Hi\n\n<script>alert(1)</script>');
    expect(result).toContain('Hi');
    expect(result).not.toContain('<script');
  });

  it('strips javascript: links', () => {
    expect(renderPreviewHtml('[x](javascript:alert(1))')).not.toContain(
      'javascript:'
    );
  });

  it('keeps task list checkboxes, tables and code blocks', () => {
    const result = renderPreviewHtml(
      [
        '- [x] done',
        '',
        '| a | b |',
        '| - | - |',
        '| 1 | 2 |',
        '',
        '```js',
        'const a = 1 < 2;',
        '```',
      ].join('\n')
    );
    expect(result).toMatch(/<input[^>]*checked[^>]*type="checkbox"/);
    expect(result).toContain('<table>');
    expect(result).toContain(
      '<pre><code class="language-js">const a = 1 &lt; 2;</code></pre>'
    );
  });
});

describe('code blocks', () => {
  it('leaves no trailing newline, which would become a blank line in Word', () => {
    expect(parseMarkdownToHtml('```\nplain\n```')).toBe(
      '<pre><code>plain</code></pre>\n'
    );
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

  it('keeps accented letters', () => {
    expect(slugify('Café résumé')).toBe('café-résumé');
  });

  it('composes decomposed accents, so the same title gives the same name', () => {
    expect(slugify('Cafe\u0301')).toBe('caf\u00e9');
  });

  it('keeps Cyrillic, CJK, and kana', () => {
    expect(slugify('Привет мир')).toBe('привет-мир');
    expect(slugify('日本語 タイトル')).toBe('日本語-タイトル');
    expect(slugify('关于开展2026年工作的通知')).toBe(
      '关于开展2026年工作的通知'
    );
  });

  it('keeps combining marks in scripts that need them', () => {
    expect(slugify('हिन्दी पाठ')).toBe('हिन्दी-पाठ');
  });

  it('drops marks left without a letter, like the emoji variation selector', () => {
    expect(slugify('\u2764\uFE0F')).toBe('');
    expect(slugify('Notes \u2764\uFE0F')).toBe('notes');
    expect(slugify('a\u2764\uFE0Fb')).toBe('ab');
  });

  it('strips characters that are unsafe in file names', () => {
    expect(slugify('a/b\\c:d*e?f"g<h>i|j')).toBe('abcdefghij');
    expect(slugify('报告：第一章／草稿')).toBe('报告第一章草稿');
  });
});

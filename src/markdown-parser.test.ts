import { describe, it, expect } from 'vitest';
import {
  parseMarkdownToHtml,
  parseMarkdownToTokens,
  extractTextFromTokens,
} from './markdown-parser.js';

describe('parseMarkdownToHtml', () => {
  it('converts a simple paragraph', () => {
    const html = parseMarkdownToHtml('Hello, world!');
    expect(html).toContain('Hello, world!');
    expect(html).toContain('<p>');
  });

  it('converts headings', () => {
    expect(parseMarkdownToHtml('# Heading 1')).toContain('<h1');
    expect(parseMarkdownToHtml('## Heading 2')).toContain('<h2');
    expect(parseMarkdownToHtml('### Heading 3')).toContain('<h3');
    expect(parseMarkdownToHtml('#### Heading 4')).toContain('<h4');
    expect(parseMarkdownToHtml('##### Heading 5')).toContain('<h5');
    expect(parseMarkdownToHtml('###### Heading 6')).toContain('<h6');
  });

  it('converts bold text', () => {
    const html = parseMarkdownToHtml('**bold text**');
    expect(html).toContain('<strong>bold text</strong>');
  });

  it('converts italic text', () => {
    const html = parseMarkdownToHtml('*italic text*');
    expect(html).toContain('<em>italic text</em>');
  });

  it('converts inline code', () => {
    const html = parseMarkdownToHtml('Use `code` here');
    expect(html).toContain('<code>code</code>');
  });

  it('converts code blocks', () => {
    const md = '```javascript\nconst x = 1;\n```';
    const html = parseMarkdownToHtml(md);
    expect(html).toContain('<pre>');
    expect(html).toContain('<code');
    expect(html).toContain('const x = 1;');
  });

  it('converts unordered lists', () => {
    const md = '- Item 1\n- Item 2\n- Item 3';
    const html = parseMarkdownToHtml(md);
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>');
    expect(html).toContain('Item 1');
    expect(html).toContain('Item 2');
    expect(html).toContain('Item 3');
  });

  it('converts ordered lists', () => {
    const md = '1. First\n2. Second\n3. Third';
    const html = parseMarkdownToHtml(md);
    expect(html).toContain('<ol>');
    expect(html).toContain('<li>');
    expect(html).toContain('First');
    expect(html).toContain('Second');
  });

  it('converts links', () => {
    const html = parseMarkdownToHtml('[GitHub](https://github.com)');
    expect(html).toContain('href="https://github.com"');
    expect(html).toContain('GitHub');
  });

  it('converts blockquotes', () => {
    const html = parseMarkdownToHtml('> This is a quote');
    expect(html).toContain('<blockquote>');
    expect(html).toContain('This is a quote');
  });

  it('converts horizontal rules', () => {
    const html = parseMarkdownToHtml('---');
    expect(html).toContain('<hr');
  });

  it('converts strikethrough text (GFM)', () => {
    const html = parseMarkdownToHtml('~~deleted~~');
    expect(html).toContain('<del>deleted</del>');
  });

  it('converts tables (GFM)', () => {
    const md = '| Name | Age |\n| --- | --- |\n| Alice | 30 |';
    const html = parseMarkdownToHtml(md);
    expect(html).toContain('<table>');
    expect(html).toContain('<th>');
    expect(html).toContain('Name');
    expect(html).toContain('Alice');
  });

  it('handles empty string input', () => {
    const html = parseMarkdownToHtml('');
    expect(html).toBe('');
  });

  it('handles multiple paragraphs', () => {
    const md = 'First paragraph.\n\nSecond paragraph.';
    const html = parseMarkdownToHtml(md);
    expect(html).toContain('First paragraph.');
    expect(html).toContain('Second paragraph.');
  });

  it('handles mixed formatting', () => {
    const md = 'This has **bold** and *italic* and `code` text.';
    const html = parseMarkdownToHtml(md);
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>italic</em>');
    expect(html).toContain('<code>code</code>');
  });
});

describe('parseMarkdownToTokens', () => {
  it('returns an array of tokens', () => {
    const tokens = parseMarkdownToTokens('Hello, world!');
    expect(Array.isArray(tokens)).toBe(true);
    expect(tokens.length).toBeGreaterThan(0);
  });

  it('tokenizes headings correctly', () => {
    const tokens = parseMarkdownToTokens('# My Heading');
    const heading = tokens.find((t) => t.type === 'heading');
    expect(heading).toBeDefined();
    expect(heading!.type).toBe('heading');
    expect((heading as { depth: number }).depth).toBe(1);
  });

  it('tokenizes paragraphs correctly', () => {
    const tokens = parseMarkdownToTokens('Just a paragraph.');
    const paragraph = tokens.find((t) => t.type === 'paragraph');
    expect(paragraph).toBeDefined();
    expect((paragraph as { text: string }).text).toContain(
      'Just a paragraph.'
    );
  });

  it('tokenizes code blocks correctly', () => {
    const tokens = parseMarkdownToTokens('```\ncode block\n```');
    const code = tokens.find((t) => t.type === 'code');
    expect(code).toBeDefined();
    expect((code as { text: string }).text).toBe('code block');
  });

  it('tokenizes unordered lists', () => {
    const tokens = parseMarkdownToTokens('- A\n- B\n- C');
    const list = tokens.find((t) => t.type === 'list');
    expect(list).toBeDefined();
    expect((list as { ordered: boolean }).ordered).toBe(false);
    expect((list as { items: unknown[] }).items).toHaveLength(3);
  });

  it('tokenizes ordered lists', () => {
    const tokens = parseMarkdownToTokens('1. First\n2. Second');
    const list = tokens.find((t) => t.type === 'list');
    expect(list).toBeDefined();
    expect((list as { ordered: boolean }).ordered).toBe(true);
    expect((list as { items: unknown[] }).items).toHaveLength(2);
  });

  it('tokenizes blockquotes', () => {
    const tokens = parseMarkdownToTokens('> A quote');
    const blockquote = tokens.find((t) => t.type === 'blockquote');
    expect(blockquote).toBeDefined();
  });

  it('tokenizes horizontal rules', () => {
    const tokens = parseMarkdownToTokens('---');
    const hr = tokens.find((t) => t.type === 'hr');
    expect(hr).toBeDefined();
  });

  it('tokenizes tables', () => {
    const md = '| H1 | H2 |\n| --- | --- |\n| A | B |';
    const tokens = parseMarkdownToTokens(md);
    const table = tokens.find((t) => t.type === 'table');
    expect(table).toBeDefined();
  });

  it('handles empty string', () => {
    const tokens = parseMarkdownToTokens('');
    expect(Array.isArray(tokens)).toBe(true);
  });

  it('tokenizes multiple heading levels', () => {
    const md = '# H1\n## H2\n### H3\n#### H4\n##### H5\n###### H6';
    const tokens = parseMarkdownToTokens(md);
    const headings = tokens.filter((t) => t.type === 'heading');
    expect(headings).toHaveLength(6);
    const depths = headings.map((h) => (h as { depth: number }).depth);
    expect(depths).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe('extractTextFromTokens', () => {
  it('extracts text from heading tokens', () => {
    const tokens = parseMarkdownToTokens('# Hello World');
    const text = extractTextFromTokens(tokens);
    expect(text).toContain('Hello World');
  });

  it('extracts text from paragraph tokens', () => {
    const tokens = parseMarkdownToTokens('Simple paragraph text.');
    const text = extractTextFromTokens(tokens);
    expect(text).toContain('Simple paragraph text.');
  });

  it('extracts text from list tokens', () => {
    const tokens = parseMarkdownToTokens('- Item A\n- Item B');
    const text = extractTextFromTokens(tokens);
    expect(text).toContain('Item A');
    expect(text).toContain('Item B');
  });

  it('extracts text from blockquote tokens', () => {
    const tokens = parseMarkdownToTokens('> Quoted text');
    const text = extractTextFromTokens(tokens);
    expect(text).toContain('Quoted text');
  });

  it('extracts text from code block tokens', () => {
    const tokens = parseMarkdownToTokens('```\nsome code\n```');
    const text = extractTextFromTokens(tokens);
    expect(text).toContain('some code');
  });

  it('extracts text from horizontal rules', () => {
    const tokens = parseMarkdownToTokens('---');
    const text = extractTextFromTokens(tokens);
    expect(text).toContain('---');
  });

  it('handles empty token array', () => {
    const text = extractTextFromTokens([]);
    expect(text).toBe('');
  });

  it('extracts text from mixed content', () => {
    const md = '# Title\n\nA paragraph.\n\n- List item\n\n> A quote';
    const tokens = parseMarkdownToTokens(md);
    const text = extractTextFromTokens(tokens);
    expect(text).toContain('Title');
    expect(text).toContain('A paragraph.');
    expect(text).toContain('List item');
    expect(text).toContain('A quote');
  });
});

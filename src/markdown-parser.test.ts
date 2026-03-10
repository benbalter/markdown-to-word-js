import { describe, it, expect } from 'vitest';
import {
  parseMarkdownToHtml,
  parseMarkdownToTokens,
  extractTextFromTokens,
} from './markdown-parser.js';

describe('parseMarkdownToHtml', () => {
  describe('headings', () => {
    it('converts h1 headings', () => {
      const html = parseMarkdownToHtml('# Hello');
      expect(html).toContain('<h1');
      expect(html).toContain('Hello');
    });

    it('converts h2 headings', () => {
      const html = parseMarkdownToHtml('## Hello');
      expect(html).toContain('<h2');
      expect(html).toContain('Hello');
    });

    it('converts h3 headings', () => {
      const html = parseMarkdownToHtml('### Hello');
      expect(html).toContain('<h3');
      expect(html).toContain('Hello');
    });

    it('converts h4 headings', () => {
      const html = parseMarkdownToHtml('#### Hello');
      expect(html).toContain('<h4');
      expect(html).toContain('Hello');
    });

    it('converts h5 headings', () => {
      const html = parseMarkdownToHtml('##### Hello');
      expect(html).toContain('<h5');
      expect(html).toContain('Hello');
    });

    it('converts h6 headings', () => {
      const html = parseMarkdownToHtml('###### Hello');
      expect(html).toContain('<h6');
      expect(html).toContain('Hello');
    });
  });

  describe('inline formatting', () => {
    it('converts bold text', () => {
      const html = parseMarkdownToHtml('**bold**');
      expect(html).toContain('<strong>bold</strong>');
    });

    it('converts italic text', () => {
      const html = parseMarkdownToHtml('*italic*');
      expect(html).toContain('<em>italic</em>');
    });

    it('converts strikethrough text', () => {
      const html = parseMarkdownToHtml('~~deleted~~');
      expect(html).toContain('<del>deleted</del>');
    });

    it('converts inline code', () => {
      const html = parseMarkdownToHtml('`code`');
      expect(html).toContain('<code>code</code>');
    });

    it('converts bold and italic combined', () => {
      const html = parseMarkdownToHtml('***bold italic***');
      expect(html).toContain('<strong>');
      expect(html).toContain('<em>');
    });
  });

  describe('links and images', () => {
    it('converts links', () => {
      const html = parseMarkdownToHtml('[text](https://example.com)');
      expect(html).toContain('<a href="https://example.com"');
      expect(html).toContain('text');
    });

    it('converts images', () => {
      const html = parseMarkdownToHtml('![alt text](image.png)');
      expect(html).toContain('<img');
      expect(html).toContain('src="image.png"');
      expect(html).toContain('alt="alt text"');
    });
  });

  describe('lists', () => {
    it('converts unordered lists', () => {
      const html = parseMarkdownToHtml('- Item 1\n- Item 2\n- Item 3');
      expect(html).toContain('<ul>');
      expect(html).toContain('<li>');
      expect(html).toContain('Item 1');
      expect(html).toContain('Item 2');
      expect(html).toContain('Item 3');
    });

    it('converts ordered lists', () => {
      const html = parseMarkdownToHtml('1. First\n2. Second\n3. Third');
      expect(html).toContain('<ol>');
      expect(html).toContain('<li>');
      expect(html).toContain('First');
      expect(html).toContain('Second');
      expect(html).toContain('Third');
    });
  });

  describe('code blocks', () => {
    it('converts fenced code blocks', () => {
      const html = parseMarkdownToHtml('```\nconsole.log("hi");\n```');
      expect(html).toContain('<pre>');
      expect(html).toContain('<code');
    });

    it('converts fenced code blocks with language', () => {
      const html = parseMarkdownToHtml(
        '```javascript\nconsole.log("hi");\n```'
      );
      expect(html).toContain('<pre>');
      expect(html).toContain('language-javascript');
    });
  });

  describe('blockquotes', () => {
    it('converts blockquotes', () => {
      const html = parseMarkdownToHtml('> This is a quote');
      expect(html).toContain('<blockquote>');
      expect(html).toContain('This is a quote');
    });
  });

  describe('horizontal rules', () => {
    it('converts horizontal rules', () => {
      const html = parseMarkdownToHtml('---');
      expect(html).toContain('<hr');
    });
  });

  describe('tables', () => {
    it('converts tables', () => {
      const md = '| Header 1 | Header 2 |\n|----------|----------|\n| Cell 1 | Cell 2 |';
      const html = parseMarkdownToHtml(md);
      expect(html).toContain('<table>');
      expect(html).toContain('<th>');
      expect(html).toContain('<td>');
      expect(html).toContain('Header 1');
      expect(html).toContain('Cell 1');
    });
  });

  describe('paragraphs', () => {
    it('wraps plain text in paragraph tags', () => {
      const html = parseMarkdownToHtml('Hello world');
      expect(html).toContain('<p>Hello world</p>');
    });

    it('handles multiple paragraphs', () => {
      const html = parseMarkdownToHtml('First paragraph\n\nSecond paragraph');
      expect(html).toContain('First paragraph');
      expect(html).toContain('Second paragraph');
    });
  });

  describe('GFM features', () => {
    it('converts line breaks with breaks option', () => {
      const html = parseMarkdownToHtml('Line 1\nLine 2');
      expect(html).toContain('<br');
    });
  });

  describe('edge cases', () => {
    it('handles empty string', () => {
      const html = parseMarkdownToHtml('');
      expect(html).toBe('');
    });

    it('handles whitespace-only input', () => {
      const html = parseMarkdownToHtml('   ');
      expect(html).toBeDefined();
    });

    it('handles special HTML characters in text', () => {
      const html = parseMarkdownToHtml('Use `<div>` tag');
      expect(html).toContain('&lt;div&gt;');
    });

    it('returns a string', () => {
      const html = parseMarkdownToHtml('# Test');
      expect(typeof html).toBe('string');
    });
  });
});

describe('parseMarkdownToTokens', () => {
  it('returns an array of tokens', () => {
    const tokens = parseMarkdownToTokens('# Hello\n\nParagraph');
    expect(Array.isArray(tokens)).toBe(true);
    expect(tokens.length).toBeGreaterThan(0);
  });

  it('identifies heading tokens', () => {
    const tokens = parseMarkdownToTokens('# Hello');
    const heading = tokens.find((t) => t.type === 'heading');
    expect(heading).toBeDefined();
  });

  it('identifies paragraph tokens', () => {
    const tokens = parseMarkdownToTokens('Hello world');
    const paragraph = tokens.find((t) => t.type === 'paragraph');
    expect(paragraph).toBeDefined();
  });

  it('identifies list tokens', () => {
    const tokens = parseMarkdownToTokens('- Item 1\n- Item 2');
    const list = tokens.find((t) => t.type === 'list');
    expect(list).toBeDefined();
  });

  it('identifies code tokens', () => {
    const tokens = parseMarkdownToTokens('```\ncode\n```');
    const code = tokens.find((t) => t.type === 'code');
    expect(code).toBeDefined();
  });

  it('identifies blockquote tokens', () => {
    const tokens = parseMarkdownToTokens('> quote');
    const blockquote = tokens.find((t) => t.type === 'blockquote');
    expect(blockquote).toBeDefined();
  });

  it('identifies table tokens', () => {
    const md = '| A | B |\n|---|---|\n| 1 | 2 |';
    const tokens = parseMarkdownToTokens(md);
    const table = tokens.find((t) => t.type === 'table');
    expect(table).toBeDefined();
  });

  it('identifies hr tokens', () => {
    const tokens = parseMarkdownToTokens('---');
    const hr = tokens.find((t) => t.type === 'hr');
    expect(hr).toBeDefined();
  });

  it('handles empty string', () => {
    const tokens = parseMarkdownToTokens('');
    expect(Array.isArray(tokens)).toBe(true);
  });
});

describe('extractTextFromTokens', () => {
  it('extracts text from heading tokens', () => {
    const tokens = parseMarkdownToTokens('# Hello');
    const text = extractTextFromTokens(tokens);
    expect(text).toContain('Hello');
  });

  it('extracts text from paragraph tokens', () => {
    const tokens = parseMarkdownToTokens('Hello world');
    const text = extractTextFromTokens(tokens);
    expect(text).toContain('Hello world');
  });

  it('extracts text from list tokens', () => {
    const tokens = parseMarkdownToTokens('- Item 1\n- Item 2');
    const text = extractTextFromTokens(tokens);
    expect(text).toContain('Item 1');
    expect(text).toContain('Item 2');
  });

  it('adds bullet markers for list items', () => {
    const tokens = parseMarkdownToTokens('- Item 1\n- Item 2');
    const text = extractTextFromTokens(tokens);
    expect(text).toContain('•');
  });

  it('extracts text from blockquote tokens', () => {
    const tokens = parseMarkdownToTokens('> Important');
    const text = extractTextFromTokens(tokens);
    expect(text).toContain('>');
    expect(text).toContain('Important');
  });

  it('extracts text from code tokens', () => {
    const tokens = parseMarkdownToTokens('```\ncode here\n```');
    const text = extractTextFromTokens(tokens);
    expect(text).toContain('code here');
  });

  it('extracts text from hr tokens', () => {
    const tokens = parseMarkdownToTokens('---');
    const text = extractTextFromTokens(tokens);
    expect(text).toContain('---');
  });

  it('handles empty token array', () => {
    const text = extractTextFromTokens([]);
    expect(text).toBe('');
  });

  it('returns trimmed text', () => {
    const tokens = parseMarkdownToTokens('Hello');
    const text = extractTextFromTokens(tokens);
    expect(text).toBe(text.trim());
  });

  it('handles mixed content', () => {
    const md = '# Title\n\nParagraph\n\n- Item\n\n> Quote\n\n---';
    const tokens = parseMarkdownToTokens(md);
    const text = extractTextFromTokens(tokens);
    expect(text).toContain('Title');
    expect(text).toContain('Paragraph');
    expect(text).toContain('Item');
    expect(text).toContain('Quote');
    expect(text).toContain('---');
  });
});

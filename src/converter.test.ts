import { describe, it, expect } from 'vitest';
import { convertMarkdownToWord } from './converter.js';

describe('convertMarkdownToWord', () => {
  it('returns a Blob', async () => {
    const blob = await convertMarkdownToWord('Hello, world!');
    expect(blob).toBeInstanceOf(Blob);
  });

  it('returns a valid docx blob type', async () => {
    const blob = await convertMarkdownToWord('Test content');
    expect(blob.type).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
  });

  it('produces a non-empty blob', async () => {
    const blob = await convertMarkdownToWord('Some text');
    expect(blob.size).toBeGreaterThan(0);
  });

  it('handles empty string input', async () => {
    const blob = await convertMarkdownToWord('');
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('handles heading conversion', async () => {
    const blob = await convertMarkdownToWord('# Heading 1');
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('handles all heading levels', async () => {
    const md =
      '# H1\n## H2\n### H3\n#### H4\n##### H5\n###### H6';
    const blob = await convertMarkdownToWord(md);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('handles bold and italic text', async () => {
    const blob = await convertMarkdownToWord(
      '**bold** and *italic* text'
    );
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('handles inline code', async () => {
    const blob = await convertMarkdownToWord('Use `code` here');
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('handles code blocks', async () => {
    const md = '```javascript\nconst x = 1;\n```';
    const blob = await convertMarkdownToWord(md);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('handles unordered lists', async () => {
    const md = '- Item 1\n- Item 2\n- Item 3';
    const blob = await convertMarkdownToWord(md);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('handles ordered lists', async () => {
    const md = '1. First\n2. Second\n3. Third';
    const blob = await convertMarkdownToWord(md);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('handles blockquotes', async () => {
    const blob = await convertMarkdownToWord('> A blockquote');
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('handles horizontal rules', async () => {
    const blob = await convertMarkdownToWord('---');
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('handles links', async () => {
    const blob = await convertMarkdownToWord(
      '[GitHub](https://github.com)'
    );
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('handles tables', async () => {
    const md = '| Name | Age |\n| --- | --- |\n| Alice | 30 |';
    const blob = await convertMarkdownToWord(md);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('handles task lists', async () => {
    const md = '- [x] Done\n- [ ] Pending';
    const blob = await convertMarkdownToWord(md);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('handles mixed content', async () => {
    const md = [
      '# Title',
      '',
      'A paragraph with **bold** and *italic*.',
      '',
      '- List item 1',
      '- List item 2',
      '',
      '> A blockquote',
      '',
      '```',
      'code block',
      '```',
      '',
      '---',
      '',
      '| Col 1 | Col 2 |',
      '| --- | --- |',
      '| A | B |',
    ].join('\n');
    const blob = await convertMarkdownToWord(md);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('accepts custom page margin options', async () => {
    const blob = await convertMarkdownToWord('Hello', {
      pageMargins: { top: 1.5, right: 1.5, bottom: 1.5, left: 1.5 },
    });
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('accepts a filename option', async () => {
    const blob = await convertMarkdownToWord('Hello', {
      filename: 'test.docx',
    });
    expect(blob).toBeInstanceOf(Blob);
  });

  it('produces different output for different input', async () => {
    const blob1 = await convertMarkdownToWord('# Short');
    const blob2 = await convertMarkdownToWord(
      '# Long document\n\nWith many paragraphs.\n\n- And lists\n- Of items\n\n> And quotes'
    );
    expect(blob2.size).toBeGreaterThan(blob1.size);
  });

  it('handles special characters in text', async () => {
    const blob = await convertMarkdownToWord(
      'Special chars: & < > " \' © ™'
    );
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('handles nested lists', async () => {
    const md = '- Parent\n  - Child 1\n  - Child 2\n- Another parent';
    const blob = await convertMarkdownToWord(md);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('handles code blocks with language specified', async () => {
    const md = '```python\nprint("hello")\n```';
    const blob = await convertMarkdownToWord(md);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('handles multiple code blocks', async () => {
    const md =
      '```js\nconst a = 1;\n```\n\n```py\nx = 2\n```';
    const blob = await convertMarkdownToWord(md);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('handles table with multiple rows', async () => {
    const md = [
      '| Name | Age | City |',
      '| --- | --- | --- |',
      '| Alice | 30 | NYC |',
      '| Bob | 25 | LA |',
      '| Carol | 35 | SF |',
    ].join('\n');
    const blob = await convertMarkdownToWord(md);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('handles a long document', async () => {
    const paragraphs = Array.from(
      { length: 50 },
      (_, i) => `Paragraph ${i + 1} with some content.`
    );
    const md = paragraphs.join('\n\n');
    const blob = await convertMarkdownToWord(md);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });
});

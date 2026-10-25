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

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

interface Paragraph {
  text: string;
  /** `<w:ind w:left>` in twips, if set. */
  indent: string | null;
  /** `<w:jc w:val>`, if set. */
  align: string | null;
  /** Whether it's a list item. */
  listItem: boolean;
}

/** The body's top-level paragraphs, in order. */
async function bodyParagraphs(markdown: string): Promise<Paragraph[]> {
  const dom = new DOMParser().parseFromString(
    await documentXml(markdown),
    'application/xml'
  );
  const body = dom.getElementsByTagNameNS(W_NS, 'body')[0];
  const attribute = (
    paragraph: Element,
    name: string,
    attr: string
  ): string | null =>
    paragraph
      .getElementsByTagNameNS(W_NS, name)[0]
      ?.getAttributeNS(W_NS, attr) ?? null;
  return Array.from(body.children)
    .filter((child) => child.localName === 'p')
    .map((paragraph) => ({
      text: Array.from(
        paragraph.getElementsByTagNameNS(W_NS, 't'),
        (t) => t.textContent
      ).join(''),
      indent: attribute(paragraph, 'ind', 'left'),
      align: attribute(paragraph, 'jc', 'val'),
      listItem: paragraph.getElementsByTagNameNS(W_NS, 'numPr').length > 0,
    }));
}

/** The run properties of the run whose text is `text`. */
async function runProperties(markdown: string, text: string): Promise<string> {
  const xml = await documentXml(markdown);
  const run = (xml.match(/<w:r>[\s\S]*?<\/w:r>/g) ?? []).find((r) =>
    r.includes(`>${text}</w:t>`)
  );
  expect(run, `a run with the text ${text}`).toBeDefined();
  return run!.match(/<w:rPr>[\s\S]*?<\/w:rPr>|<w:rPr\/>/)?.[0] ?? '';
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
      expect(prepare('```\nblock\n```\n')).toBe(
        parseMarkdownToHtml('```\nblock\n```\n')
      );
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
      expect(prepare(table)).toMatch(
        /<th[^>]*><p><strong>Name<\/strong><\/p><\/th>/
      );
    });

    it('turns GFM column alignment into a style the generator honors', () => {
      const html = prepare(table);
      expect(html).not.toContain('align=');
      expect(html).toContain('<td style="text-align: right;"><p>30</p></td>');
      expect(html).toContain('<td style="text-align: left;"><p>Alice</p></td>');
    });

    it('leaves an empty header cell empty', () => {
      expect(prepare('|   | b |\n| - | - |\n| 1 | 2 |\n')).toContain(
        '<th></th>'
      );
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
    const xml = await documentXml(
      '| Name | Age |\n| :-- | --: |\n| Alice | 30 |\n'
    );
    expect(xml).toMatch(/<w:tblBorders>[\s\S]*w:val="single"/);
    expect(xml).toMatch(/<w:b\/>[\s\S]*?<w:t[^>]*>Name</);
    expect(xml).toMatch(/<w:jc w:val="right"\/>[\s\S]*?<w:t[^>]*>30</);
  });

  it('sets inline code in the code font', async () => {
    const xml = await documentXml('Run `npm test` now.\n');
    expect(xml).toMatch(
      new RegExp(
        `<w:rFonts w:ascii="${CODE_FONT}" w:hAnsi="${CODE_FONT}"/>\\s*</w:rPr>\\s*<w:t[^>]*>npm test<`
      )
    );
  });
});

describe('block quotes in the generated .docx', () => {
  it('keeps each paragraph of a quote as its own paragraph', async () => {
    const paragraphs = await bodyParagraphs(
      'Before\n\n> p1\n>\n> p2\n\nAfter\n'
    );
    expect(paragraphs.map(({ text }) => text)).toEqual([
      'Before',
      'p1',
      'p2',
      'After',
    ]);
  });

  it('indents quotes, further for each level of nesting, and aligns them left', async () => {
    const paragraphs = await bodyParagraphs(
      '> outer\n>\n> > inner\n>\n> outer again\n'
    );
    expect(paragraphs).toEqual([
      { text: 'outer', indent: '720', align: 'left', listItem: false },
      { text: 'inner', indent: '1440', align: 'left', listItem: false },
      { text: 'outer again', indent: '720', align: 'left', listItem: false },
    ]);
  });

  it('leaves text outside the quote unindented', async () => {
    const [before, , after] = await bodyParagraphs(
      'Before\n\n> quoted\n\nAfter\n'
    );
    expect(before.indent).toBeNull();
    expect(after.indent).toBeNull();
  });

  it('keeps a heading and a list inside a quote', async () => {
    const paragraphs = await bodyParagraphs(
      '> ## Heading\n>\n> - one\n> - two\n'
    );
    expect(paragraphs.map(({ text, listItem }) => [text, listItem])).toEqual([
      ['Heading', false],
      ['one', true],
      ['two', true],
    ]);
    expect(paragraphs[0].indent).toBe('720');
  });

  it('leaves the indent of a quote in a list item to the list', async () => {
    const xml = await documentXml('- item\n\n  > loose\n\n- > tight\n');
    for (const pPr of xml.match(/<w:pPr>[\s\S]*?<\/w:pPr>/g) ?? []) {
      expect(pPr.match(/<w:ind /g)?.length ?? 0).toBeLessThanOrEqual(1);
    }
    const paragraphs = await bodyParagraphs('- > tight\n');
    expect(paragraphs).toEqual([
      { text: 'tight', indent: null, align: 'left', listItem: true },
    ]);
  });

  it('keeps a code block in a quote in the code font', async () => {
    expect(
      await runProperties('> ```\n> quoted code\n> ```\n', 'quoted code')
    ).toContain(`<w:rFonts w:ascii="${CODE_FONT}"`);
  });
});

describe('inline HTML the generator does not know', () => {
  it('keeps the text of <kbd>, <abbr>, <small> and the like', async () => {
    const paragraphs = await bodyParagraphs(
      'Press <kbd>Ctrl</kbd> and <abbr title="HyperText">HTML</abbr>, <small>fine</small> <var>x</var> <cite>Book</cite> <samp>out</samp>.\n'
    );
    expect(paragraphs.map(({ text }) => text)).toEqual([
      'Press Ctrl and HTML, fine x Book out.',
    ]);
  });

  it('wraps <q> in quotation marks, as a browser does', async () => {
    const paragraphs = await bodyParagraphs('She said <q>hi</q>.\n');
    expect(paragraphs.map(({ text }) => text)).toEqual(['She said “hi”.']);
  });

  it('sets <kbd> and <samp> in the code font', async () => {
    expect(await runProperties('Press <kbd>Ctrl</kbd>.\n', 'Ctrl')).toContain(
      `<w:rFonts w:ascii="${CODE_FONT}"`
    );
    expect(
      await runProperties('See <samp>output</samp>.\n', 'output')
    ).toContain(`<w:rFonts w:ascii="${CODE_FONT}"`);
  });

  it('italicizes <var>', async () => {
    expect(await runProperties('Let <var>n</var> be.\n', 'n')).toContain(
      '<w:i/>'
    );
  });

  it('highlights <mark>', async () => {
    expect(await runProperties('A <mark>key</mark> point.\n', 'key')).toMatch(
      /<w:shd w:val="clear" w:fill="FFFF00"\/>/
    );
  });

  it('keeps the text of tags it has no rule for, custom ones included', async () => {
    const paragraphs = await bodyParagraphs(
      'A <custom-el>custom</custom-el> tag, <time>noon</time> and <label>this</label>.\n'
    );
    expect(paragraphs.map(({ text }) => text)).toEqual([
      'A custom tag, noon and this.',
    ]);
  });

  it('shows a placeholder tag that is never closed as written', async () => {
    const paragraphs = await bodyParagraphs(
      'Replace <your-name> with your name.\n\nUse <Foo Bar="1"> here.\n'
    );
    expect(paragraphs.map(({ text }) => text)).toEqual([
      'Replace <your-name> with your name.',
      'Use <Foo Bar="1"> here.',
    ]);
  });

  it('keeps a placeholder tag spelled exactly as in the source', async () => {
    const paragraphs = await bodyParagraphs(
      "Fill in <your-name title='A &quot;b&quot; & c > d'> and <your-name>.\n"
    );
    expect(paragraphs.map(({ text }) => text)).toEqual([
      "Fill in <your-name title='A &quot;b&quot; & c > d'> and <your-name>.",
    ]);
  });

  it('still leaves out what a browser would not show as text', () => {
    const html = prepare(
      'a <script>alert(1)</script> <svg><text>t</text></svg> b\n'
    );
    expect(html).toContain('<script>alert(1)</script>');
    expect(html).toContain('<svg><text>t</text></svg>');
  });

  it('leaves the same tags alone inside a code block', () => {
    const markdown = '```\n<kbd>x</kbd>\n```\n';
    expect(prepare(markdown)).toBe(parseMarkdownToHtml(markdown));
  });
});

describe('footnotes in the generated .docx', () => {
  const markdown =
    'Note[^1] and another[^two].\n\n[^1]: The note.\n[^two]: The second note.\n';

  it('numbers the references and lists the notes after a rule, in order', async () => {
    const paragraphs = await bodyParagraphs(markdown);
    expect(paragraphs.map(({ text, listItem }) => [text, listItem])).toEqual([
      ['Note1 and another2.', false],
      ['', false],
      ['The note.', true],
      ['The second note.', true],
    ]);
  });

  it('numbers the notes from 1 after an earlier numbered list', async () => {
    const xml = await documentXml(`1. a\n2. b\n\n${markdown}`);
    const numIds = Array.from(
      xml.matchAll(/<w:numId w:val="(\d+)"\/>/g),
      (m) => m[1]
    );
    expect(numIds).toHaveLength(4);
    expect(numIds[2]).toBe(numIds[3]);
    expect(numIds[2]).not.toBe(numIds[0]);
  });

  it('sets each reference as a superscript', async () => {
    expect(await runProperties(markdown, '1')).toContain(
      '<w:vertAlign w:val="superscript"/>'
    );
  });

  it('drops the in-page links and the heading meant for screen readers', () => {
    const html = prepare(markdown);
    expect(html).not.toMatch(/<a [^>]*href="#/);
    expect(html).not.toContain('↩');
    expect(html).not.toContain('Footnotes');
    expect(html).toContain('<li id="footnote-1">\n<p>The note.</p>');
  });

  it('leaves no literal footnote syntax behind', async () => {
    const text = (await bodyParagraphs(markdown))
      .map(({ text }) => text)
      .join('\n');
    expect(text).not.toContain('[^');
  });
});

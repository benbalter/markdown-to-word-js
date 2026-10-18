import { describe, it, expect, beforeAll } from 'vitest';
import JSZip from 'jszip';
import { convertMarkdownToWord } from '../src/converter';
import { CHINESE_OFFICIAL_DOC_FONTS } from '../src/font-presets';
import { CODE_FONT } from '../src/docx-code-blocks';

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

const MARKDOWN = `正文 with \`inline\` code。

\`\`\`python
def f():
    return 1  # 中文注释

    return 2
\`\`\`
`;

interface CodeRun {
  fonts: Record<string, string | null>;
  children: string[];
  lines: (string | null)[];
}

async function codeRun(blob: Blob): Promise<CodeRun> {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const xml = await zip.file('word/document.xml')!.async('string');
  const dom = new DOMParser().parseFromString(xml, 'application/xml');
  // Inline code is monospace too, so find the block's run by its text.
  const run = Array.from(dom.getElementsByTagNameNS(W_NS, 'r')).find(
    (candidate) =>
      candidate
        .getElementsByTagNameNS(W_NS, 't')[0]
        ?.textContent?.startsWith('def f():')
  )!;

  return {
    fonts: Object.fromEntries(
      Array.from(run.getElementsByTagNameNS(W_NS, 'rFonts')[0].attributes).map(
        (attribute) => [attribute.localName, attribute.value]
      )
    ),
    children: Array.from(run.children)
      .filter((child) => child.localName !== 'rPr')
      .map((child) => child.localName),
    lines: Array.from(run.children)
      .filter((child) => child.localName === 't')
      .map((child) => child.textContent),
  };
}

async function elementCounts(blob: Blob): Promise<Record<string, number>> {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const xml = await zip.file('word/document.xml')!.async('string');
  return {
    paragraph: (xml.match(/<w:p>/g) ?? []).length,
    lineBreak: (xml.match(/<w:br/g) ?? []).length,
    rawNewlineInText: (xml.match(/<w:t[^>]*>[^<]*\n/g) ?? []).length,
  };
}

describe.each([
  ['without the font preset', undefined],
  ['with the font preset', CHINESE_OFFICIAL_DOC_FONTS],
] as const)('code blocks %s', (_label, fontPreset) => {
  let blob: Blob;
  let run: CodeRun;

  beforeAll(async () => {
    blob = await convertMarkdownToWord(
      MARKDOWN,
      fontPreset ? { fontPreset } : {}
    );
    run = await codeRun(blob);
  });

  it('puts the monospace face in every font slot, Chinese comments included', () => {
    expect(run.fonts).toMatchObject({
      ascii: CODE_FONT,
      hAnsi: CODE_FONT,
      eastAsia: CODE_FONT,
    });
  });

  it('turns each source newline into a line break Word renders', () => {
    // The blank line is the paired <w:br/>, so it needs no text node.
    expect(run.children).toEqual(['t', 'br', 't', 'br', 'br', 't']);
    expect(run.lines).toEqual([
      'def f():',
      '    return 1  # 中文注释',
      '    return 2',
    ]);
  });

  it('keeps the block in one paragraph and leaves no raw newline behind', async () => {
    const counts = await elementCounts(blob);

    expect(counts.lineBreak).toBe(3);
    expect(counts.rawNewlineInText).toBe(0);
  });
});

async function documentXml(blob: Blob): Promise<string> {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  return zip.file('word/document.xml')!.async('string');
}

function runFonts(xml: string): Record<string, string | null>[] {
  const dom = new DOMParser().parseFromString(xml, 'application/xml');
  return Array.from(dom.getElementsByTagNameNS(W_NS, 'r'))
    .filter((run) => run.getElementsByTagNameNS(W_NS, 't').length > 0)
    .map((run) => {
      const rFonts = run.getElementsByTagNameNS(W_NS, 'rFonts')[0];
      return {
        ascii: rFonts?.getAttributeNS(W_NS, 'ascii') ?? null,
        eastAsia: rFonts?.getAttributeNS(W_NS, 'eastAsia') ?? null,
      };
    });
}

describe('code block detection', () => {
  it('styles a single-line code block, which has no newline to give it away', async () => {
    const xml = await documentXml(
      await convertMarkdownToWord('```\nonly line\n```\n')
    );

    expect(runFonts(xml)).toEqual([{ ascii: CODE_FONT, eastAsia: CODE_FONT }]);
  });

  it('styles every run of a raw HTML <pre>, including nested markup', async () => {
    const xml = await documentXml(
      await convertMarkdownToWord(
        '<pre>first\nsecond <b>bold</b>\nthird</pre>\n'
      )
    );

    expect(runFonts(xml)).toEqual(
      Array(3).fill({ ascii: CODE_FONT, eastAsia: CODE_FONT })
    );
    expect((xml.match(/<w:br\/>/g) ?? []).length).toBe(2);
  });

  it('tells an inline-code-only paragraph from a code block with the same text', async () => {
    const xml = await documentXml(
      await convertMarkdownToWord('`x = 1`\n\n```\nx = 1\n```\n')
    );

    expect(runFonts(xml)).toEqual([
      { ascii: CODE_FONT, eastAsia: null },
      { ascii: CODE_FONT, eastAsia: CODE_FONT },
    ]);
  });

  it('leaves a paragraph alone even when a later code block repeats its text', async () => {
    const xml = await documentXml(
      await convertMarkdownToWord(
        '```\nfirst\n```\n\nsame text\n\n```\nsame text\n```\n'
      )
    );

    expect(runFonts(xml)).toEqual([
      { ascii: CODE_FONT, eastAsia: CODE_FONT },
      { ascii: null, eastAsia: null },
      { ascii: CODE_FONT, eastAsia: CODE_FONT },
    ]);
  });
});

describe('surrounding content', () => {
  it('does not restyle the body paragraph', async () => {
    const blob = await convertMarkdownToWord(MARKDOWN);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const xml = await zip.file('word/document.xml')!.async('string');
    const dom = new DOMParser().parseFromString(xml, 'application/xml');

    const bodyRuns = Array.from(dom.getElementsByTagNameNS(W_NS, 'r')).filter(
      (run) =>
        run.getElementsByTagNameNS(W_NS, 't')[0]?.textContent === '正文 with '
    );
    expect(bodyRuns).toHaveLength(1);
    expect(bodyRuns[0].getElementsByTagNameNS(W_NS, 'rFonts')).toHaveLength(0);
  });

  it('leaves an inline font-family that names the generator code font alone', async () => {
    const blob = await convertMarkdownToWord(
      '<span style="font-family: Courier">not code</span>\n\n```\ncode\n```\n'
    );
    const xml = await documentXml(blob);

    expect(xml).toMatch(
      /<w:rFonts w:ascii="Courier" w:hAnsi="Courier"\/>\s*<\/w:rPr>\s*<w:t[^>]*>not code</
    );
  });

  it('leaves the blob untouched when the markdown has no code block', async () => {
    const blob = await convertMarkdownToWord('# 标题\n\n正文。\n');
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const xml = await zip.file('word/document.xml')!.async('string');

    expect(xml).toContain('<w:t xml:space="preserve">正文。</w:t>');
  });
});

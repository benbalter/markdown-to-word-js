import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { convertMarkdownToWord } from '../src/converter';
import { CODE_FONT, RULE_TEXT } from '../src/docx-html';
import { CHINESE_OFFICIAL_DOC_FONTS } from '../src/font-presets';

const fixtureRoot = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

async function documentXml(markdown: string, options = {}): Promise<string> {
  const blob = await convertMarkdownToWord(markdown, options);
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  return zip.file('word/document.xml')!.async('string');
}

function stripXmlTagsSafely(input: string): string {
  let current = input;
  let previous: string;
  do {
    previous = current;
    current = current.replace(/<[^>]+>/g, '');
  } while (current !== previous);
  return current;
}

/** Each body paragraph as its text, or `<rule>` for an empty bordered one. */
function paragraphs(xml: string): string[] {
  const body = xml.slice(xml.indexOf('<w:body>'), xml.lastIndexOf('<w:sectPr'));
  return (body.match(/<w:p>[\s\S]*?<\/w:p>/g) ?? []).map((p) => {
    const text = (p.match(/<w:t[^>]*>[^<]*<\/w:t>/g) ?? [])
      .map((t) => stripXmlTagsSafely(t))
      .join('');
    return text === '' && /<w:pBdr>\s*<w:bottom w:val="single"/.test(p) ? '<rule>' : text;
  });
}

describe('horizontal rules', () => {
  it('draws the rule the generator would drop', async () => {
    const markdown = readFileSync(join(fixtureRoot, 'horizontal-rule.md'), 'utf-8');
    expect(paragraphs(await documentXml(markdown))).toEqual([
      'Above the rule.',
      '<rule>',
      'Below the rule.',
    ]);
  });

  it('draws every rule, in order', async () => {
    expect(paragraphs(await documentXml('one\n\n---\n\ntwo\n\n***\n\nthree\n'))).toEqual([
      'one',
      '<rule>',
      'two',
      '<rule>',
      'three',
    ]);
  });

  it('leaves a paragraph that only says the placeholder text alone', async () => {
    expect(paragraphs(await documentXml('\\* \\* \\*\n\n---\n'))).toEqual([RULE_TEXT, '<rule>']);
  });
});

describe('tables', () => {
  const table = '| a | b |\n| - | - |\n| 1 | 2 |\n';

  it('repeats the header row on each page the table spans', async () => {
    const xml = await documentXml(table);
    const rows = xml.match(/<w:tr>[\s\S]*?<\/w:tr>/g) ?? [];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain('<w:tblHeader/>');
    expect(rows[1]).not.toContain('<w:tblHeader');
  });

  it('leaves a raw HTML table without header cells alone', async () => {
    const xml = await documentXml('<table><tr><td>1</td><td>2</td></tr></table>\n');
    expect(xml).not.toContain('<w:tblHeader');
  });

  it('keeps only the first grid, as the schema requires', async () => {
    const xml = await documentXml(`${table}\n${table}`);
    expect((xml.match(/<w:tbl>/g) ?? []).length).toBe(2);
    expect((xml.match(/<w:tblGrid>/g) ?? []).length).toBe(2);
    for (const tbl of xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) ?? []) {
      expect(tbl.indexOf('<w:tblGrid>')).toBeLessThan(tbl.indexOf('<w:tr>'));
    }
  });
});

describe('with the font preset', () => {
  it('keeps rules, header rows, task boxes and inline code after the preset runs', async () => {
    const xml = await documentXml(
      '- [x] 完成\n\n运行 `npm test`。\n\n---\n\n| 名称 | 数量 |\n| - | -: |\n| 甲 | 1 |\n',
      { fontPreset: CHINESE_OFFICIAL_DOC_FONTS }
    );

    expect(xml).toContain('☒ 完成');
    expect(xml).toMatch(
      new RegExp(`<w:rFonts w:ascii="${CODE_FONT}"[^>]*/>\\s*</w:rPr>\\s*<w:t[^>]*>npm test<`)
    );
    expect(paragraphs(xml)).toContain('<rule>');
    expect(xml).toContain('<w:tblHeader/>');
    expect(xml).toContain('<w:tblBorders>');
  });
});

describe('section properties', () => {
  /** The local names of `<w:body>`'s children, in order. */
  function bodyChildren(xml: string): string[] {
    const dom = new DOMParser().parseFromString(xml, 'application/xml');
    const body = dom.getElementsByTagNameNS(W_NS, 'body')[0];
    return Array.from(body.children, (child) => child.localName);
  }

  it('moves <w:sectPr> to the end of the body, as the schema requires', async () => {
    // No rules or tables, so nothing else in the structure patch applies.
    expect(bodyChildren(await documentXml('# Title\n\nText.\n'))).toEqual(['p', 'p', 'sectPr']);
  });

  it('keeps the page size and margins, with or without the 公文 preset', async () => {
    const plain = await documentXml('Text.\n', {
      pageMargins: { top: 1, right: 1, bottom: 1, left: 1 },
    });
    expect(bodyChildren(plain).at(-1)).toBe('sectPr');
    expect(plain).toMatch(/<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/);

    const preset = await documentXml('正文。\n', { fontPreset: CHINESE_OFFICIAL_DOC_FONTS });
    expect(bodyChildren(preset).at(-1)).toBe('sectPr');
    expect(preset).toMatch(/<w:pgSz w:w="11906" w:h="16838"/);
    expect(preset).toMatch(/<w:docGrid /);
  });
});

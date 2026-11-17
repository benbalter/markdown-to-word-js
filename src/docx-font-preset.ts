import JSZip from 'jszip';
import type {
  FontPreset,
  LevelStyle,
  LineSpacing,
  ParagraphStyle,
  TableStyle,
} from './font-presets.js';
import {
  keepXmlDeclaration,
  paragraphProperty,
  WORDPROCESSING_NS as W_NS,
} from './xml-part.js';

/** Theme slots WinWord prefers over explicitly named fonts. */
const THEME_FONT_ATTRIBUTES = [
  'asciiTheme',
  'eastAsiaTheme',
  'hAnsiTheme',
  'cstheme',
];

/**
 * `<w:line>` is ignored while the rule is auto, but WinWord still writes 240
 * twips, so the preset writes the pair Word itself produces.
 */
const SINGLE_SPACING = { line: '240', rule: 'auto' };

/** Word's document grid, in the units of `<w:docGrid>`. */
interface Grid {
  /** Line pitch in twips. */
  linePitch: number;
  /** Character pitch relative to the body font size, in 1/4096 point. */
  charSpace: number;
}

/** What the styles need to know about the paragraphs, resolved once. */
interface Layout {
  spacing: { line: string; rule: string };
  /** First-line indent of body paragraphs in twips, or 0 for none. */
  firstLineIndent: number;
}

/**
 * Rewrites the fonts, sizes, paragraph spacing, page grid and list layout of an
 * already generated .docx.
 *
 * `html-to-docx` only ever writes `w:ascii`, which WinWord applies to Latin
 * characters and digits; Chinese characters fall back to the theme font. The
 * East Asian slots are set here instead, so this stays out of the way of the
 * default conversion output.
 *
 * The grid is measured from the page the document actually has, so it still
 * fits when `pageMargins` overrode the preset's margins.
 */
export async function applyFontPreset(
  wordDocument: Blob,
  preset: FontPreset
): Promise<Blob> {
  const zip = await JSZip.loadAsync(await wordDocument.arrayBuffer());
  const stylesEntry = zip.file('word/styles.xml');
  if (!stylesEntry) {
    throw new Error(
      'Cannot apply font preset: document contains no word/styles.xml'
    );
  }

  // The numbering part is read first: laying the document's lists out needs to
  // know which format each numbering definition uses at each level.
  const numberingEntry = zip.file('word/numbering.xml');
  const numberingXml = numberingEntry
    ? await numberingEntry.async('string')
    : null;
  const formats = numberingXml ? numberFormatsOf(numberingXml) : undefined;

  let grid: Grid | null = null;
  const pageGrid = preset.page?.grid;
  if (
    pageGrid ||
    preset.paragraph.lineSpacing === 'grid' ||
    preset.paragraph.firstLineIndentChars ||
    preset.list?.multilevelNumbers ||
    preset.table
  ) {
    const documentEntry = zip.file('word/document.xml');
    if (!documentEntry) {
      throw new Error(
        'Cannot apply font preset: document contains no word/document.xml'
      );
    }
    const documentXml = await documentEntry.async('string');
    const patched = patchDocumentXml(documentXml, preset, formats);
    grid = patched.grid;
    zip.file('word/document.xml', patched.xml);
  }

  const stylesXml = await stylesEntry.async('string');
  zip.file('word/styles.xml', patchStylesXml(stylesXml, preset, grid));

  // Lists are laid out only when the preset describes them; a document
  // without lists has no numbering part anyway.
  if (numberingXml !== null && preset.list) {
    zip.file('word/numbering.xml', patchNumberingXml(numberingXml, preset));
  }

  const patched = await zip.generateAsync({ type: 'arraybuffer' });
  return new Blob([patched], { type: wordDocument.type });
}

/**
 * Applies `preset` to the document default run properties and to the six
 * heading styles of a styles.xml part. `grid` is the page grid that
 * `patchDocumentXml` set, which `lineSpacing: 'grid'` takes its pitch from.
 */
export function patchStylesXml(
  stylesXml: string,
  preset: FontPreset,
  grid: Grid | null = null
): string {
  const dom = new DOMParser().parseFromString(stylesXml, 'application/xml');
  const layout = resolveLayout(preset, grid);

  const docDefaults = requireElement(dom, 'docDefaults');
  applyLevelStyle(docDefaults, preset.body, preset.paragraph, layout);
  if (layout.spacing.rule === 'exact') {
    // Widow control pulls a line onto the next page whenever a paragraph would
    // leave a single line behind, so pages would often hold one line fewer
    // than the grid. Word turns it on unless the document says otherwise.
    paragraphProperty(
      paragraphPropertiesOf(docDefaults),
      'widowControl'
    ).setAttributeNS(W_NS, 'w:val', '0');
  }

  const styles = Array.from(dom.getElementsByTagNameNS(W_NS, 'style'));
  for (const style of styles) {
    const heading = /^Heading([1-6])$/.exec(
      style.getAttributeNS(W_NS, 'styleId') ?? ''
    );
    if (heading) {
      applyLevelStyle(
        style,
        preset.headings[Number(heading[1]) - 1],
        preset.paragraph,
        layout
      );
    }
  }

  return keepXmlDeclaration(
    stylesXml,
    new XMLSerializer().serializeToString(dom)
  );
}

function resolveLayout(preset: FontPreset, grid: Grid | null): Layout {
  const { lineSpacing, firstLineIndentChars = 0 } = preset.paragraph;
  return {
    spacing: spacingFor(lineSpacing, grid),
    firstLineIndent: Math.round(firstLineIndentChars * preset.body.sizePt * 20),
  };
}

/** The `<w:spacing>` pair a line-spacing choice resolves to on this page. */
function spacingFor(
  lineSpacing: LineSpacing,
  grid: Grid | null
): { line: string; rule: string } {
  if (lineSpacing !== 'grid') {
    return SINGLE_SPACING;
  }
  if (!grid) {
    throw new Error(
      "Cannot apply font preset: lineSpacing 'grid' needs page.grid"
    );
  }
  return { line: String(grid.linePitch), rule: 'exact' };
}

/**
 * Sets the page grid in the section properties of a document.xml part, and
 * fixes up the paragraphs that the style-level layout would break:
 *
 * - The generator gives every paragraph `<w:spacing w:lineRule="auto"/>`.
 *   Spacing attributes inherit one at a time, so that lone `auto` combined
 *   with the style's exact line height would read as a multiple of 240 twips
 *   (about 2.4 lines). It is dropped when the preset uses grid spacing.
 * - Exact line spacing would crop an inline image to one line, so paragraphs
 *   with a drawing keep single spacing; the grid then rounds them up to whole
 *   lines.
 * - Table cells drop the first-line indent; it only crowds narrow columns.
 * - When the preset describes table cells, they are laid out on their own
 *   terms instead of inheriting the page grid: vertical alignment, line
 *   spacing and grid snapping.
 */
export function patchDocumentXml(
  documentXml: string,
  preset: FontPreset,
  formats?: NumberFormats
): { xml: string; grid: Grid | null } {
  const dom = new DOMParser().parseFromString(documentXml, 'application/xml');

  if (preset.list?.multilevelNumbers && formats) {
    unifyListNumbering(dom, formats);
  }

  let grid: Grid | null = null;
  const pageGrid = preset.page?.grid;
  if (pageGrid) {
    for (const sectPr of Array.from(
      dom.getElementsByTagNameNS(W_NS, 'sectPr')
    )) {
      grid = measureGrid(sectPr, pageGrid, preset.body.sizePt);
      setDocGrid(sectPr, grid);
    }
  }

  const gridSpacing = preset.paragraph.lineSpacing === 'grid';
  const table = preset.table;
  for (const paragraph of Array.from(dom.getElementsByTagNameNS(W_NS, 'p'))) {
    const pPr = children(paragraph).find((child) => child.localName === 'pPr');
    const inTableCell = isInTableCell(paragraph);

    if (gridSpacing && !inTableCell) {
      if (paragraph.getElementsByTagNameNS(W_NS, 'drawing').length > 0) {
        const spacing = paragraphProperty(pPrOf(paragraph), 'spacing');
        spacing.setAttributeNS(W_NS, 'w:line', SINGLE_SPACING.line);
        spacing.setAttributeNS(W_NS, 'w:lineRule', SINGLE_SPACING.rule);
      } else {
        const spacing =
          pPr && children(pPr).find((child) => child.localName === 'spacing');
        if (spacing && !spacing.hasAttributeNS(W_NS, 'line')) {
          spacing.removeAttributeNS(W_NS, 'lineRule');
          if (spacing.attributes.length === 0) {
            spacing.remove();
          }
        }
      }
    }

    if (table && inTableCell) {
      layoutTableCell(pPrOf(paragraph), table, grid);
    }

    if (preset.paragraph.firstLineIndentChars && inTableCell) {
      removeFirstLineIndent(pPrOf(paragraph));
    }
  }

  if (table) {
    for (const cell of Array.from(dom.getElementsByTagNameNS(W_NS, 'tc'))) {
      cellVerticalAlign(cell).setAttributeNS(
        W_NS,
        'w:val',
        table.verticalAlign
      );
    }
  }

  return {
    xml: keepXmlDeclaration(
      documentXml,
      new XMLSerializer().serializeToString(dom)
    ),
    grid,
  };
}

/** The number format a numbering definition uses at each level. */
export type NumberFormats = ReadonlyMap<string, string[]>;

/**
 * Reads the numbering part into a `numId` → formats map, the way the document's
 * paragraphs reference it. `<w:num>` names an `<w:abstractNum>`, so the
 * abstract's levels answer for the id the paragraphs use.
 */
function numberFormatsOf(numberingXml: string): NumberFormats {
  const dom = new DOMParser().parseFromString(numberingXml, 'application/xml');
  const formatsByAbstract = new Map<string, string[]>();

  for (const abstract of Array.from(
    dom.getElementsByTagNameNS(W_NS, 'abstractNum')
  )) {
    const abstractId = abstract.getAttributeNS(W_NS, 'abstractNumId');
    if (abstractId === null) {
      continue;
    }
    const levels: string[] = [];
    for (const lvl of children(abstract).filter(
      (child) => child.localName === 'lvl'
    )) {
      const ilvl = Number(lvl.getAttributeNS(W_NS, 'ilvl') ?? levels.length);
      levels[ilvl] =
        children(lvl)
          .find((child) => child.localName === 'numFmt')
          ?.getAttributeNS(W_NS, 'val') ?? '';
    }
    formatsByAbstract.set(abstractId, levels);
  }

  const formats = new Map<string, string[]>();
  for (const num of Array.from(dom.getElementsByTagNameNS(W_NS, 'num'))) {
    const numId = num.getAttributeNS(W_NS, 'numId');
    const abstractId = num
      .getElementsByTagNameNS(W_NS, 'abstractNumId')[0]
      ?.getAttributeNS(W_NS, 'val');
    const levels =
      abstractId === null ? undefined : formatsByAbstract.get(abstractId);
    if (numId !== null && levels) {
      formats.set(numId, levels);
    }
  }

  return formats;
}

interface ParagraphNumbering {
  ilvl: number;
  numId: string;
  numIdElement: Element;
}

/** The `<w:numPr>` of a paragraph, when it has one that names a numbering. */
function numberingOf(paragraph: Element): ParagraphNumbering | null {
  const pPr = children(paragraph).find((child) => child.localName === 'pPr');
  const numPr =
    pPr && children(pPr).find((child) => child.localName === 'numPr');
  if (!numPr) {
    return null;
  }

  const numIdElement = children(numPr).find(
    (child) => child.localName === 'numId'
  );
  const numId = numIdElement?.getAttributeNS(W_NS, 'val');
  if (!numIdElement || numId === undefined || numId === null) {
    return null;
  }

  const ilvl = Number(
    children(numPr)
      .find((child) => child.localName === 'ilvl')
      ?.getAttributeNS(W_NS, 'val') ?? '0'
  );
  return { ilvl, numId, numIdElement };
}

/**
 * Word counts a multi-level list inside one numbering definition: its items
 * share a `w:numId` and only `w:ilvl` changes. The generator instead gives
 * every nesting depth its own definition, so a nested item's `%1` is that
 * sub-list's counter rather than its parent's, and 1.1 can never appear.
 *
 * Point the deeper items of a list at the definition its first level uses. A
 * fresh first-level definition opens a new list, so separate lists never share
 * a counter, and a nested level whose format differs from the list's own (a
 * bullet inside a numbered list) keeps its own definition.
 */
function unifyListNumbering(dom: Document, formats: NumberFormats): void {
  let listNumId: string | null = null;

  for (const paragraph of Array.from(dom.getElementsByTagNameNS(W_NS, 'p'))) {
    const numbering = numberingOf(paragraph);
    if (!numbering) {
      // A list item's later paragraphs are unnumbered but indented under the
      // item, so only an unindented paragraph ends the list.
      const ind = paragraph.getElementsByTagNameNS(W_NS, 'ind')[0];
      if (Number(ind?.getAttributeNS(W_NS, 'left') ?? 0) <= 0) {
        listNumId = null;
      }
      continue;
    }

    if (numbering.ilvl === 0) {
      listNumId = numbering.numId;
      continue;
    }
    if (listNumId === null) {
      continue;
    }

    const list = formats.get(listNumId);
    const own = formats.get(numbering.numId);
    if (!list || !own || list[numbering.ilvl] !== own[numbering.ilvl]) {
      continue;
    }
    numbering.numIdElement.setAttributeNS(W_NS, 'w:val', listNumId);
  }
}

/**
 * Lays out lists the way a 公文 does, in the place Word itself writes these
 * choices — the numbering definitions:
 *
 * - 首行缩进 N 字符: the item's first line is indented by the preset's
 *   `firstLineIndentChars`, written as `w:firstLineChars` so Word shows it in
 *   characters and it scales with the font size.
 * - 编号与内容的间距 适中: `w:suff` is `space`, so one space separates the
 *   number or bullet from its content instead of a tab.
 * - 文本之前: ordered levels sit flush with the text block at every level, the
 *   way a printed 公文 numbers its items (1. （1） ① all start from the same
 *   margin). Bulleted levels instead step out by the preset's indent each
 *   level, because a bullet carries no hierarchy of its own.
 * - one bullet per nesting level, ● then ○ then ▪.
 *
 * Numbering itself is left alone: ordered levels keep the generator's
 * `%1.` / `%2.` text. The level's tab stop stays where it is, so a renderer
 * that ignores `w:suff` still puts the content near the indent rather than on
 * top of the mark.
 */
export function patchNumberingXml(
  numberingXml: string,
  preset: FontPreset
): string {
  const dom = new DOMParser().parseFromString(numberingXml, 'application/xml');
  const indentChars = preset.paragraph.firstLineIndentChars ?? 0;
  const bullets = preset.list?.bullets ?? [];

  for (const lvl of Array.from(dom.getElementsByTagNameNS(W_NS, 'lvl'))) {
    const format = children(lvl).find((child) => child.localName === 'numFmt');
    const bulleted = format?.getAttributeNS(W_NS, 'val') === 'bullet';
    const level = Number(lvl.getAttributeNS(W_NS, 'ilvl') ?? '0');
    // Only bullets nest by indentation; numbering text already shows the level.
    const indentLevel = bulleted ? level : 0;

    setNumberSeparator(lvl);

    const ind = childOrCreate(numberingParagraphOf(lvl), 'ind', 'last');
    for (const attribute of ['hanging', 'hangingChars', 'firstLine']) {
      ind.removeAttributeNS(W_NS, attribute);
    }
    // One character is the body font size in twips, which is what a renderer
    // that ignores the `*Chars` attributes needs alongside them.
    ind.setAttributeNS(
      W_NS,
      'w:left',
      String(indentLevel * indentChars * preset.body.sizePt * 20)
    );
    ind.setAttributeNS(
      W_NS,
      'w:leftChars',
      String(indentLevel * indentChars * 100)
    );
    ind.setAttributeNS(W_NS, 'w:firstLineChars', String(indentChars * 100));

    if (bulleted && bullets.length) {
      setBulletGlyph(lvl, level, bullets, preset.body.eastAsia);
    } else if (!bulleted && preset.list?.multilevelNumbers) {
      setMultilevelNumber(lvl, level);
    }
  }

  return keepXmlDeclaration(
    numberingXml,
    new XMLSerializer().serializeToString(dom)
  );
}

/**
 * Gives each nesting level its own bullet, as Word's multi-level library does.
 * The generator repeats one private-use glyph in the Symbol font at every
 * level, so the level's run properties move to the body font, which carries
 * these shapes.
 */
function setBulletGlyph(
  lvl: Element,
  level: number,
  bullets: string[],
  font: string
): void {
  const format = children(lvl).find((child) => child.localName === 'numFmt');
  if (format?.getAttributeNS(W_NS, 'val') !== 'bullet') {
    return;
  }

  const lvlText = children(lvl).find((child) => child.localName === 'lvlText');
  if (!lvlText) {
    return;
  }
  lvlText.setAttributeNS(
    W_NS,
    'w:val',
    bullets[Math.min(level, bullets.length - 1)]
  );

  const rFonts = childOrCreate(
    childOrCreate(lvl, 'rPr', 'last'),
    'rFonts',
    'first'
  );
  for (const attribute of ['ascii', 'hAnsi', 'eastAsia', 'cs']) {
    rFonts.setAttributeNS(W_NS, `w:${attribute}`, font);
  }
}

/**
 * Makes a nested number carry its parents: level 0 stays `1.`, level 1 becomes
 * `1.1`, level 2 `1.1.1`. Word restarts a level whenever the one above it
 * moves, which is its default, so the second item of the third item reads 3.2.
 */
function setMultilevelNumber(lvl: Element, level: number): void {
  const lvlText = children(lvl).find((child) => child.localName === 'lvlText');
  if (!lvlText) {
    return;
  }

  const parents = Array.from({ length: level }, (_, index) => `%${index + 1}`);
  lvlText.setAttributeNS(
    W_NS,
    'w:val',
    [...parents, `%${level + 1}.`].join('.')
  );
}

/** `<w:suff>` sits between `<w:isLgl>` and `<w:lvlText>` in a level. */
function setNumberSeparator(lvl: Element): void {
  const existing = children(lvl).find((child) => child.localName === 'suff');
  const suff = existing ?? lvl.ownerDocument.createElementNS(W_NS, 'w:suff');
  if (!existing) {
    const lvlText = children(lvl).find(
      (child) => child.localName === 'lvlText'
    );
    lvl.insertBefore(suff, lvlText ?? null);
  }
  suff.setAttributeNS(W_NS, 'w:val', 'space');
}

/** The paragraph properties a numbering level carries, created when absent. */
function numberingParagraphOf(lvl: Element): Element {
  return childOrCreate(lvl, 'pPr', 'last');
}

/**
 * Cells sit outside the page grid: exact spacing at the line pitch would
 * stretch every row to a whole pitch and clip what wraps, so a cell paragraph
 * takes its own line spacing and stops snapping to the grid (Word's 如果定义了
 * 文档网格，则与网格对齐 checkbox, `w:snapToGrid`).
 */
function layoutTableCell(
  pPr: Element,
  table: TableStyle,
  grid: Grid | null
): void {
  const spacing = spacingFor(table.lineSpacing, grid);
  const spacingElement = paragraphProperty(pPr, 'spacing');
  spacingElement.setAttributeNS(W_NS, 'w:line', spacing.line);
  spacingElement.setAttributeNS(W_NS, 'w:lineRule', spacing.rule);

  paragraphProperty(pPr, 'snapToGrid').setAttributeNS(
    W_NS,
    'w:val',
    table.snapToGrid ? '1' : '0'
  );
}

/** `<w:vAlign>` in a cell's properties, created where Word writes it. */
function cellVerticalAlign(cell: Element): Element {
  const tcPr = childOrCreate(cell, 'tcPr', 'first');
  const existing = children(tcPr).find((child) => child.localName === 'vAlign');
  if (existing) {
    return existing;
  }
  const created = tcPr.ownerDocument.createElementNS(W_NS, 'w:vAlign');
  const hideMark = children(tcPr).find(
    (child) => child.localName === 'hideMark'
  );
  return tcPr.insertBefore(created, hideMark ?? null);
}

/**
 * The grid for the text block of `sectPr`'s page. Word stores the character
 * pitch as an offset from the body font size. Both pitches are rounded down,
 * as Word does, so the lines and characters always fit: for the page Word
 * itself sets up with GB/T 9704 margins, this reproduces its linePitch="579"
 * and charSpace="-834".
 */
function measureGrid(
  sectPr: Element,
  {
    linesPerPage,
    charsPerLine,
  }: { linesPerPage: number; charsPerLine: number },
  bodySizePt: number
): Grid {
  const pgSz = children(sectPr).find((child) => child.localName === 'pgSz');
  const pgMar = children(sectPr).find((child) => child.localName === 'pgMar');
  const twips = (element: Element | undefined, attribute: string): number => {
    const value = Number(element?.getAttributeNS(W_NS, attribute));
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(
        `Cannot apply font preset: section has no page ${attribute}`
      );
    }
    return value;
  };

  const textHeight =
    twips(pgSz, 'h') - twips(pgMar, 'top') - twips(pgMar, 'bottom');
  const textWidth =
    twips(pgSz, 'w') - twips(pgMar, 'left') - twips(pgMar, 'right');
  const charPitchPt = textWidth / 20 / charsPerLine;

  return {
    linePitch: Math.floor(textHeight / linesPerPage),
    charSpace: Math.floor((charPitchPt - bodySizePt) * 4096),
  };
}

function setDocGrid(sectPr: Element, grid: Grid): void {
  let docGrid = children(sectPr).find((child) => child.localName === 'docGrid');
  if (!docGrid) {
    docGrid = sectPr.ownerDocument.createElementNS(W_NS, 'w:docGrid');
    // <w:docGrid> is the last section property but <w:printerSettings>.
    const printerSettings = children(sectPr).find(
      (child) => child.localName === 'printerSettings'
    );
    sectPr.insertBefore(docGrid, printerSettings ?? null);
  }
  docGrid.setAttributeNS(W_NS, 'w:type', 'linesAndChars');
  docGrid.setAttributeNS(W_NS, 'w:linePitch', String(grid.linePitch));
  docGrid.setAttributeNS(W_NS, 'w:charSpace', String(grid.charSpace));
}

function isInTableCell(paragraph: Element): boolean {
  for (let node = paragraph.parentElement; node; node = node.parentElement) {
    if (node.namespaceURI === W_NS && node.localName === 'tc') {
      return true;
    }
  }
  return false;
}

function removeFirstLineIndent(pPr: Element): void {
  const ind = paragraphProperty(pPr, 'ind');
  if (!ind.hasAttributeNS(W_NS, 'hanging')) {
    ind.setAttributeNS(W_NS, 'w:firstLine', '0');
  }
}

/** A paragraph's `<w:pPr>`, created as its first child if missing. */
function pPrOf(paragraph: Element): Element {
  return childOrCreate(paragraph, 'pPr', 'first');
}

function applyLevelStyle(
  scope: Element,
  style: LevelStyle,
  paragraph: ParagraphStyle,
  layout: Layout
): void {
  const rPr = runPropertiesOf(scope);

  const rFonts = childOrCreate(rPr, 'rFonts', 'first');
  for (const attribute of THEME_FONT_ATTRIBUTES) {
    rFonts.removeAttributeNS(W_NS, attribute);
  }
  rFonts.setAttributeNS(W_NS, 'w:ascii', style.latin);
  rFonts.setAttributeNS(W_NS, 'w:hAnsi', style.latin);
  rFonts.setAttributeNS(W_NS, 'w:eastAsia', style.eastAsia);

  for (const child of children(rPr)) {
    if (child.localName === 'b' || child.localName === 'bCs') {
      child.remove();
    }
  }
  if (style.bold) {
    rPr.insertBefore(
      rPr.ownerDocument.createElementNS(W_NS, 'w:b'),
      rFonts.nextSibling
    );
  }

  // <w:sz> is measured in half points.
  const size = String(style.sizePt * 2);
  childOrCreate(rPr, 'sz', 'last').setAttributeNS(W_NS, 'w:val', size);
  childOrCreate(rPr, 'szCs', 'last').setAttributeNS(W_NS, 'w:val', size);

  const pPr = paragraphPropertiesOf(scope);
  const spacing = paragraphProperty(pPr, 'spacing');
  spacing.setAttributeNS(W_NS, 'w:before', String(paragraph.beforePt * 20));
  spacing.setAttributeNS(W_NS, 'w:after', String(paragraph.afterPt * 20));
  spacing.setAttributeNS(W_NS, 'w:line', layout.spacing.line);
  spacing.setAttributeNS(W_NS, 'w:lineRule', layout.spacing.rule);

  if (style.centered) {
    // An indented first line would push a centered title off center.
    if (layout.firstLineIndent) {
      paragraphProperty(pPr, 'ind').setAttributeNS(W_NS, 'w:firstLine', '0');
    }
    paragraphProperty(pPr, 'jc').setAttributeNS(W_NS, 'w:val', 'center');
  } else if (layout.firstLineIndent) {
    paragraphProperty(pPr, 'ind').setAttributeNS(
      W_NS,
      'w:firstLine',
      String(layout.firstLineIndent)
    );
  }
}

function runPropertiesOf(parent: Element): Element {
  const container =
    parent.localName === 'docDefaults'
      ? childOrCreate(parent, 'rPrDefault', 'first')
      : parent;
  // In a <w:style> the run properties go last, after any <w:pPr>.
  return childOrCreate(container, 'rPr', 'last');
}

function paragraphPropertiesOf(parent: Element): Element {
  if (parent.localName === 'docDefaults') {
    const pPrDefault = childOrCreate(parent, 'pPrDefault', 'last');
    return childOrCreate(pPrDefault, 'pPr', 'first');
  }

  const existing = children(parent).find((child) => child.localName === 'pPr');
  if (existing) {
    return existing;
  }
  // In a <w:style> the paragraph properties go before the run properties.
  const created = parent.ownerDocument.createElementNS(W_NS, 'w:pPr');
  return parent.insertBefore(created, runPropertiesOf(parent));
}

function children(element: Element): Element[] {
  return Array.from(element.children).filter(
    (child) => child.namespaceURI === W_NS
  );
}

function childOrCreate(
  parent: Element,
  localName: string,
  position: 'first' | 'last'
): Element {
  const existing = children(parent).find(
    (child) => child.localName === localName
  );
  if (existing) {
    return existing;
  }
  const created = parent.ownerDocument.createElementNS(W_NS, `w:${localName}`);
  return position === 'first'
    ? parent.insertBefore(created, parent.firstChild)
    : parent.appendChild(created);
}

function requireElement(dom: Document, localName: string): Element {
  const element = dom.getElementsByTagNameNS(W_NS, localName)[0];
  if (!element) {
    throw new Error(
      `Cannot apply font preset: styles.xml has no <w:${localName}> element`
    );
  }
  return element;
}

import JSZip from 'jszip';
import type { FontPreset, LevelStyle, ParagraphStyle } from './font-presets.js';
import { keepXmlDeclaration, paragraphProperty, WORDPROCESSING_NS as W_NS } from './xml-part.js';

/** Theme slots WinWord prefers over explicitly named fonts. */
const THEME_FONT_ATTRIBUTES = ['asciiTheme', 'eastAsiaTheme', 'hAnsiTheme', 'cstheme'];

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
 * Rewrites the fonts, sizes, paragraph spacing and page grid of an already
 * generated .docx.
 *
 * `html-to-docx` only ever writes `w:ascii`, which WinWord applies to Latin
 * characters and digits; Chinese characters fall back to the theme font. The
 * East Asian slots are set here instead, so this stays out of the way of the
 * default conversion output.
 *
 * The grid is measured from the page the document actually has, so it still
 * fits when `pageMargins` overrode the preset's margins.
 */
export async function applyFontPreset(wordDocument: Blob, preset: FontPreset): Promise<Blob> {
  const zip = await JSZip.loadAsync(await wordDocument.arrayBuffer());
  const stylesEntry = zip.file('word/styles.xml');
  if (!stylesEntry) {
    throw new Error('Cannot apply font preset: document contains no word/styles.xml');
  }

  let grid: Grid | null = null;
  const pageGrid = preset.page?.grid;
  if (
    pageGrid ||
    preset.paragraph.lineSpacing === 'grid' ||
    preset.paragraph.firstLineIndentChars
  ) {
    const documentEntry = zip.file('word/document.xml');
    if (!documentEntry) {
      throw new Error('Cannot apply font preset: document contains no word/document.xml');
    }
    const documentXml = await documentEntry.async('string');
    const patched = patchDocumentXml(documentXml, preset);
    grid = patched.grid;
    zip.file('word/document.xml', patched.xml);
  }

  const stylesXml = await stylesEntry.async('string');
  zip.file('word/styles.xml', patchStylesXml(stylesXml, preset, grid));

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
    paragraphProperty(paragraphPropertiesOf(docDefaults), 'widowControl').setAttributeNS(
      W_NS,
      'w:val',
      '0'
    );
  }

  const styles = Array.from(dom.getElementsByTagNameNS(W_NS, 'style'));
  for (const style of styles) {
    const heading = /^Heading([1-6])$/.exec(style.getAttributeNS(W_NS, 'styleId') ?? '');
    if (heading) {
      applyLevelStyle(style, preset.headings[Number(heading[1]) - 1], preset.paragraph, layout);
    }
  }

  return keepXmlDeclaration(stylesXml, new XMLSerializer().serializeToString(dom));
}

function resolveLayout(preset: FontPreset, grid: Grid | null): Layout {
  const { lineSpacing, firstLineIndentChars = 0 } = preset.paragraph;
  if (lineSpacing === 'grid' && !grid) {
    throw new Error("Cannot apply font preset: lineSpacing 'grid' needs page.grid");
  }
  return {
    spacing:
      lineSpacing === 'grid' && grid
        ? { line: String(grid.linePitch), rule: 'exact' }
        : SINGLE_SPACING,
    firstLineIndent: Math.round(firstLineIndentChars * preset.body.sizePt * 20),
  };
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
 */
export function patchDocumentXml(
  documentXml: string,
  preset: FontPreset
): { xml: string; grid: Grid | null } {
  const dom = new DOMParser().parseFromString(documentXml, 'application/xml');

  let grid: Grid | null = null;
  const pageGrid = preset.page?.grid;
  if (pageGrid) {
    for (const sectPr of Array.from(dom.getElementsByTagNameNS(W_NS, 'sectPr'))) {
      grid = measureGrid(sectPr, pageGrid, preset.body.sizePt);
      setDocGrid(sectPr, grid);
    }
  }

  const gridSpacing = preset.paragraph.lineSpacing === 'grid';
  for (const paragraph of Array.from(dom.getElementsByTagNameNS(W_NS, 'p'))) {
    const pPr = children(paragraph).find((child) => child.localName === 'pPr');

    if (gridSpacing) {
      if (paragraph.getElementsByTagNameNS(W_NS, 'drawing').length > 0) {
        const spacing = paragraphProperty(pPrOf(paragraph), 'spacing');
        spacing.setAttributeNS(W_NS, 'w:line', SINGLE_SPACING.line);
        spacing.setAttributeNS(W_NS, 'w:lineRule', SINGLE_SPACING.rule);
      } else {
        const spacing = pPr && children(pPr).find((child) => child.localName === 'spacing');
        if (spacing && !spacing.hasAttributeNS(W_NS, 'line')) {
          spacing.removeAttributeNS(W_NS, 'lineRule');
          if (spacing.attributes.length === 0) {
            spacing.remove();
          }
        }
      }
    }

    if (preset.paragraph.firstLineIndentChars && isInTableCell(paragraph)) {
      removeFirstLineIndent(pPrOf(paragraph));
    }
  }

  return {
    xml: keepXmlDeclaration(documentXml, new XMLSerializer().serializeToString(dom)),
    grid,
  };
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
  { linesPerPage, charsPerLine }: { linesPerPage: number; charsPerLine: number },
  bodySizePt: number
): Grid {
  const pgSz = children(sectPr).find((child) => child.localName === 'pgSz');
  const pgMar = children(sectPr).find((child) => child.localName === 'pgMar');
  const twips = (element: Element | undefined, attribute: string): number => {
    const value = Number(element?.getAttributeNS(W_NS, attribute));
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`Cannot apply font preset: section has no page ${attribute}`);
    }
    return value;
  };

  const textHeight = twips(pgSz, 'h') - twips(pgMar, 'top') - twips(pgMar, 'bottom');
  const textWidth = twips(pgSz, 'w') - twips(pgMar, 'left') - twips(pgMar, 'right');
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
    const printerSettings = children(sectPr).find((child) => child.localName === 'printerSettings');
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
    rPr.insertBefore(rPr.ownerDocument.createElementNS(W_NS, 'w:b'), rFonts.nextSibling);
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
  return Array.from(element.children).filter((child) => child.namespaceURI === W_NS);
}

function childOrCreate(parent: Element, localName: string, position: 'first' | 'last'): Element {
  const existing = children(parent).find((child) => child.localName === localName);
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
    throw new Error(`Cannot apply font preset: styles.xml has no <w:${localName}> element`);
  }
  return element;
}

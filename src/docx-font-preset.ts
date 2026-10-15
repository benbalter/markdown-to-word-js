import JSZip from 'jszip';
import type { FontPreset, LevelStyle, LineSpacing, ParagraphStyle } from './font-presets.js';
import { keepXmlDeclaration, WORDPROCESSING_NS as W_NS } from './xml-part.js';

/** Theme slots WinWord prefers over explicitly named fonts. */
const THEME_FONT_ATTRIBUTES = ['asciiTheme', 'eastAsiaTheme', 'hAnsiTheme', 'cstheme'];

/**
 * `<w:line>` is ignored while the rule is auto, but WinWord still writes 240
 * twips, so the preset writes the pair Word itself produces.
 */
const LINE_SPACING: Record<LineSpacing, { line: string; rule: string }> = {
  single: { line: '240', rule: 'auto' },
};

/**
 * Rewrites the fonts, sizes and paragraph spacing of an already generated .docx.
 *
 * `html-to-docx` only ever writes `w:ascii`, which WinWord applies to Latin
 * characters and digits; Chinese characters fall back to the theme font. The
 * East Asian slots are set here instead, so this stays out of the way of the
 * default conversion output.
 */
export async function applyFontPreset(wordDocument: Blob, preset: FontPreset): Promise<Blob> {
  const zip = await JSZip.loadAsync(await wordDocument.arrayBuffer());
  const stylesEntry = zip.file('word/styles.xml');
  if (!stylesEntry) {
    throw new Error('Cannot apply font preset: document contains no word/styles.xml');
  }

  const stylesXml = await stylesEntry.async('string');
  zip.file('word/styles.xml', patchStylesXml(stylesXml, preset));

  const patched = await zip.generateAsync({ type: 'arraybuffer' });
  return new Blob([patched], { type: wordDocument.type });
}

/**
 * Applies `preset` to the document default run properties and to the six
 * heading styles of a styles.xml part.
 */
export function patchStylesXml(stylesXml: string, preset: FontPreset): string {
  const dom = new DOMParser().parseFromString(stylesXml, 'application/xml');

  const docDefaults = requireElement(dom, 'docDefaults');
  applyLevelStyle(docDefaults, preset.body, preset.paragraph);

  const styles = Array.from(dom.getElementsByTagNameNS(W_NS, 'style'));
  for (const style of styles) {
    const heading = /^Heading([1-6])$/.exec(style.getAttributeNS(W_NS, 'styleId') ?? '');
    if (heading) {
      applyLevelStyle(style, preset.headings[Number(heading[1]) - 1], preset.paragraph);
    }
  }

  return keepXmlDeclaration(stylesXml, new XMLSerializer().serializeToString(dom));
}

function applyLevelStyle(scope: Element, style: LevelStyle, paragraph: ParagraphStyle): void {
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

  const spacing = childOrCreate(paragraphPropertiesOf(scope), 'spacing', 'first');
  spacing.setAttributeNS(W_NS, 'w:before', String(paragraph.beforePt * 20));
  spacing.setAttributeNS(W_NS, 'w:after', String(paragraph.afterPt * 20));

  const line = LINE_SPACING[paragraph.lineSpacing];
  spacing.setAttributeNS(W_NS, 'w:line', line.line);
  spacing.setAttributeNS(W_NS, 'w:lineRule', line.rule);
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

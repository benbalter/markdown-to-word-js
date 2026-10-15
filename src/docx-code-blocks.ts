import JSZip from 'jszip';
import { keepXmlDeclaration, WORDPROCESSING_NS as W_NS, XML_NS } from './xml-part.js';

/** A monospace face that ships with Windows, so Chinese comments stay aligned. */
export const CODE_FONT = 'Courier New';

/** Theme slots WinWord prefers over explicitly named fonts. */
const THEME_FONT_ATTRIBUTES = ['asciiTheme', 'eastAsiaTheme', 'hAnsiTheme', 'cstheme'];

/**
 * Makes code blocks survive in Word, regardless of the font preset:
 *
 * - Line breaks: the generator keeps the source newlines of a `<pre>` as bare
 *   `LF` inside `<w:t>`, which WinWord renders as whitespace; they become
 *   `<w:br/>` here. Everywhere else the generator emits `<w:br/>` itself, so a
 *   bare `LF` is the bug's own signature and needs no other marker.
 * - Typeface: the generator sets only `w:ascii`/`w:hAnsi`, so Chinese comments
 *   fell through to the body font. Code paragraphs are found by their text,
 *   matched in order against `codeBlocks`, and get the monospace face in all
 *   three slots. Keying on the generator's hardcoded code font instead would
 *   also catch any inline `font-family` that names the same font.
 *
 * @param codeBlocks The text content of each `<pre>` in the source HTML, in
 *   document order.
 */
export async function formatCodeBlocks(wordDocument: Blob, codeBlocks: string[]): Promise<Blob> {
  const zip = await JSZip.loadAsync(await wordDocument.arrayBuffer());
  const documentEntry = zip.file('word/document.xml');
  if (!documentEntry) {
    throw new Error('Cannot format code blocks: document contains no word/document.xml');
  }

  const documentXml = await documentEntry.async('string');
  const formatted = formatDocumentXml(documentXml, codeBlocks);
  if (formatted === documentXml) {
    return wordDocument;
  }

  zip.file('word/document.xml', formatted);
  const patched = await zip.generateAsync({ type: 'arraybuffer' });
  return new Blob([patched], { type: wordDocument.type });
}

/** Exported for testing. */
export function formatDocumentXml(documentXml: string, codeBlocks: string[]): string {
  const dom = new DOMParser().parseFromString(documentXml, 'application/xml');
  let changed = false;

  // The generator emits one paragraph per <pre>, in source order, so a single
  // forward pass pairs each code block with the next paragraph of equal text.
  // Whitespace is ignored because the generator may trim or collapse it. A
  // plain paragraph can repeat a code block's text, so a match also needs every
  // run to name a font, as the generator does for <pre> but not for body text.
  const pending = codeBlocks.map(compact).filter((text) => text !== '');
  for (const paragraph of Array.from(dom.getElementsByTagNameNS(W_NS, 'p'))) {
    if (pending.length === 0) {
      break;
    }
    if (compact(paragraphText(paragraph)) === pending[0] && hasExplicitFonts(paragraph)) {
      pending.shift();
      setCodeFont(paragraph);
      changed = true;
    }
  }

  for (const text of Array.from(dom.getElementsByTagNameNS(W_NS, 't'))) {
    changed = expandLineBreaks(text) || changed;
  }

  if (!changed) {
    return documentXml;
  }
  return keepXmlDeclaration(documentXml, new XMLSerializer().serializeToString(dom));
}

function compact(text: string): string {
  return text.replace(/\s+/g, '');
}

function paragraphText(paragraph: Element): string {
  return Array.from(paragraph.getElementsByTagNameNS(W_NS, 't'))
    .map((text) => text.textContent ?? '')
    .join('');
}

function hasExplicitFonts(paragraph: Element): boolean {
  return textRuns(paragraph).every((run) => {
    const rFonts = firstChild(run, 'rPr')?.getElementsByTagNameNS(W_NS, 'rFonts')[0];
    return Boolean(rFonts?.getAttributeNS(W_NS, 'ascii'));
  });
}

function textRuns(paragraph: Element): Element[] {
  return Array.from(paragraph.getElementsByTagNameNS(W_NS, 'r')).filter(
    (run) => run.getElementsByTagNameNS(W_NS, 't').length > 0
  );
}

function setCodeFont(paragraph: Element): void {
  const document = paragraph.ownerDocument;

  for (const run of textRuns(paragraph)) {
    let rPr = firstChild(run, 'rPr');
    if (!rPr) {
      rPr = run.insertBefore(document.createElementNS(W_NS, 'w:rPr'), run.firstChild);
    }

    // <w:rFonts> comes first in <w:rPr>.
    let rFonts = firstChild(rPr, 'rFonts');
    if (!rFonts) {
      rFonts = rPr.insertBefore(document.createElementNS(W_NS, 'w:rFonts'), rPr.firstChild);
    }

    for (const attribute of THEME_FONT_ATTRIBUTES) {
      rFonts.removeAttributeNS(W_NS, attribute);
    }
    for (const attribute of ['ascii', 'hAnsi', 'eastAsia'] as const) {
      rFonts.setAttributeNS(W_NS, `w:${attribute}`, CODE_FONT);
    }
  }
}

function firstChild(parent: Element, localName: string): Element | undefined {
  return Array.from(parent.children).find(
    (child) => child.namespaceURI === W_NS && child.localName === localName
  );
}

/**
 * Replaces one `<w:t>a\nb</w:t>` with `<w:t>a</w:t><w:br/><w:t>b</w:t>`.
 * Returns whether anything changed.
 */
function expandLineBreaks(text: Element): boolean {
  const lines = (text.textContent ?? '').split('\n');
  if (lines.length < 2) {
    return false;
  }

  const document = text.ownerDocument;
  const run = text.parentNode as Element;

  for (const [index, line] of lines.entries()) {
    if (index > 0) {
      run.insertBefore(document.createElementNS(W_NS, 'w:br'), text);
    }
    if (line !== '') {
      const textElement = document.createElementNS(W_NS, 'w:t');
      textElement.setAttributeNS(XML_NS, 'xml:space', 'preserve');
      textElement.textContent = line;
      run.insertBefore(textElement, text);
    }
  }

  run.removeChild(text);
  return true;
}

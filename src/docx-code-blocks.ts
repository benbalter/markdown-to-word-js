import JSZip from 'jszip';
import { keepXmlDeclaration, WORDPROCESSING_NS as W_NS, XML_NS } from './xml-part.js';

/**
 * `html-to-docx` hardcodes this run font for `<pre>` content, which doubles as
 * the only marker that a run holds a code block.
 */
const GENERATOR_CODE_FONT = 'Courier';

/** A monospace face that ships with Windows, so Chinese comments stay aligned. */
export const CODE_FONT = 'Courier New';

/**
 * Makes code blocks survive in Word, regardless of the font preset:
 *
 * - Line breaks: the generator keeps the source newlines as bare `LF` inside
 *   `<w:t>`, which WinWord renders as whitespace; they become `<w:br/>` here.
 * - Typeface: the generator sets only `w:ascii`/`w:hAnsi`, so Chinese comments
 *   fell through to the body 仿宋. All three slots get the monospace face.
 */
export async function formatCodeBlocks(wordDocument: Blob): Promise<Blob> {
  const zip = await JSZip.loadAsync(await wordDocument.arrayBuffer());
  const documentEntry = zip.file('word/document.xml');
  if (!documentEntry) {
    throw new Error('Cannot format code blocks: document contains no word/document.xml');
  }

  const documentXml = await documentEntry.async('string');
  const formatted = formatDocumentXml(documentXml);
  if (formatted === documentXml) {
    return wordDocument;
  }

  zip.file('word/document.xml', formatted);
  const patched = await zip.generateAsync({ type: 'arraybuffer' });
  return new Blob([patched], { type: wordDocument.type });
}

/** Exported for testing. */
export function formatDocumentXml(documentXml: string): string {
  if (!documentXml.includes(`w:ascii="${GENERATOR_CODE_FONT}"`)) {
    return documentXml;
  }

  const dom = new DOMParser().parseFromString(documentXml, 'application/xml');

  for (const run of Array.from(dom.getElementsByTagNameNS(W_NS, 'r'))) {
    const rFonts = run
      .getElementsByTagNameNS(W_NS, 'rPr')[0]
      ?.getElementsByTagNameNS(W_NS, 'rFonts')[0];
    if (rFonts?.getAttributeNS(W_NS, 'ascii') !== GENERATOR_CODE_FONT) {
      continue;
    }

    for (const attribute of ['ascii', 'hAnsi', 'eastAsia'] as const) {
      rFonts.setAttributeNS(W_NS, `w:${attribute}`, CODE_FONT);
    }

    for (const text of Array.from(runTexts(run))) {
      expandLineBreaks(text);
    }
  }

  return keepXmlDeclaration(documentXml, new XMLSerializer().serializeToString(dom));
}

function runTexts(run: Element): Element[] {
  return Array.from(run.children).filter((child) => child.localName === 't');
}

/** Replaces one `<w:t>a\nb</w:t>` with `<w:t>a</w:t><w:br/><w:t>b</w:t>`. */
function expandLineBreaks(text: Element): void {
  const lines = (text.textContent ?? '').split('\n');
  if (lines.length < 2) {
    return;
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
}

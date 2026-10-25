import JSZip from 'jszip';
import { RULE_TEXT } from './docx-html.js';
import { keepXmlDeclaration, WORDPROCESSING_NS as W_NS } from './xml-part.js';

const CONTENT_TYPES = '[Content_Types].xml';
const CONTENT_TYPES_NS =
  'http://schemas.openxmlformats.org/package/2006/content-types';

/** The media type of each image extension html-to-docx can write. */
const IMAGE_CONTENT_TYPES: Record<string, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  gif: 'image/gif',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
};

/** What the source HTML says about the document's rules and tables. */
export interface DocumentStructure {
  /** How many `<hr>` the HTML has. */
  rules: number;
  /** For each `<table>` in document order, whether its first row is a header. */
  headerRows: boolean[];
}

/**
 * Restores structure the generator drops or gets wrong:
 *
 * - Horizontal rules: each centered RULE_TEXT paragraph that stands in for an
 *   `<hr>` (see prepareHtmlForDocx) becomes an empty paragraph with a bottom
 *   border. They're matched in order against the number of `<hr>`, so a
 *   paragraph that only happens to say `* * *` is left alone once they run out.
 * - Header rows: a table's header row gets `<w:tblHeader/>`, so Word repeats
 *   it at the top of each page the table spans.
 * - Table grids: the generator writes a second `<w:tblGrid>` between rows,
 *   which the schema doesn't allow; only the first is kept.
 * - Section properties: the generator writes the body's `<w:sectPr>` (page
 *   size and margins) as its first child. The schema requires it last, and
 *   strict readers ignore it elsewhere, so it's moved to the end.
 * - Image content types: the generator declares only JPEG, PNG and SVG in
 *   `[Content_Types].xml`, but embeds GIF and BMP too. Every part needs a
 *   declared type, and Word offers to repair a file that lacks one, so each
 *   image extension in `word/media/` gets a `<Default>`.
 */
export async function patchStructure(
  wordDocument: Blob,
  structure: DocumentStructure
): Promise<Blob> {
  const zip = await JSZip.loadAsync(await wordDocument.arrayBuffer());
  const documentEntry = zip.file('word/document.xml');
  if (!documentEntry) {
    throw new Error(
      'Cannot patch structure: document contains no word/document.xml'
    );
  }

  const documentXml = await documentEntry.async('string');
  const patched = patchDocumentXml(documentXml, structure);
  const typesEntry = zip.file(CONTENT_TYPES);
  const typesXml = typesEntry ? await typesEntry.async('string') : null;
  const patchedTypes =
    typesXml === null
      ? null
      : patchContentTypes(typesXml, Object.keys(zip.files));
  if (patched === documentXml && patchedTypes === typesXml) {
    return wordDocument;
  }

  zip.file('word/document.xml', patched);
  if (patchedTypes !== null) zip.file(CONTENT_TYPES, patchedTypes);
  return new Blob([await zip.generateAsync({ type: 'arraybuffer' })], {
    type: wordDocument.type,
  });
}

/**
 * Adds a `<Default>` to `typesXml` for each image extension among `paths`
 * under `word/media/` that it doesn't declare yet. Exported for testing.
 */
export function patchContentTypes(typesXml: string, paths: string[]): string {
  const dom = new DOMParser().parseFromString(typesXml, 'application/xml');
  const types = dom.documentElement;
  const declared = new Set(
    Array.from(types.getElementsByTagNameNS(CONTENT_TYPES_NS, 'Default'), (d) =>
      (d.getAttribute('Extension') ?? '').toLowerCase()
    )
  );
  let changed = false;
  for (const path of paths) {
    if (!path.startsWith('word/media/')) continue;
    const extension = /\.([^./]+)$/.exec(path)?.[1].toLowerCase();
    const contentType = extension && IMAGE_CONTENT_TYPES[extension];
    if (!contentType || declared.has(extension)) continue;
    const entry = dom.createElementNS(CONTENT_TYPES_NS, 'Default');
    entry.setAttribute('Extension', extension);
    entry.setAttribute('ContentType', contentType);
    // Defaults come before Overrides in the schema.
    types.insertBefore(
      entry,
      types.getElementsByTagNameNS(CONTENT_TYPES_NS, 'Override')[0] ?? null
    );
    declared.add(extension);
    changed = true;
  }
  if (!changed) return typesXml;
  return keepXmlDeclaration(
    typesXml,
    new XMLSerializer().serializeToString(dom)
  );
}

/** Exported for testing. */
export function patchDocumentXml(
  documentXml: string,
  structure: DocumentStructure
): string {
  const dom = new DOMParser().parseFromString(documentXml, 'application/xml');
  let changed = false;

  let rulesLeft = structure.rules;
  for (const paragraph of Array.from(dom.getElementsByTagNameNS(W_NS, 'p'))) {
    if (rulesLeft === 0) break;
    if (isRulePlaceholder(paragraph)) {
      drawRule(paragraph);
      rulesLeft--;
      changed = true;
    }
  }

  const tables = Array.from(dom.getElementsByTagNameNS(W_NS, 'tbl'));
  for (const [index, table] of tables.entries()) {
    const grids = children(table, 'tblGrid');
    for (const extra of grids.slice(1)) {
      extra.remove();
      changed = true;
    }

    const firstRow = children(table, 'tr')[0];
    if (structure.headerRows[index] && firstRow) {
      markHeaderRow(firstRow);
      changed = true;
    }
  }

  const body = dom.getElementsByTagNameNS(W_NS, 'body')[0];
  const sectPr = body && children(body, 'sectPr')[0];
  if (sectPr && body.lastElementChild !== sectPr) {
    body.appendChild(sectPr);
    changed = true;
  }

  if (!changed) {
    return documentXml;
  }
  return keepXmlDeclaration(
    documentXml,
    new XMLSerializer().serializeToString(dom)
  );
}

function isRulePlaceholder(paragraph: Element): boolean {
  const text = Array.from(paragraph.getElementsByTagNameNS(W_NS, 't'))
    .map((t) => t.textContent ?? '')
    .join('');
  const jc = children(children(paragraph, 'pPr')[0] ?? paragraph, 'jc')[0];
  return (
    text.trim() === RULE_TEXT && jc?.getAttributeNS(W_NS, 'val') === 'center'
  );
}

/** Replaces the paragraph's content with nothing but a bottom border. */
function drawRule(paragraph: Element): void {
  const document = paragraph.ownerDocument;
  while (paragraph.firstChild) {
    paragraph.removeChild(paragraph.firstChild);
  }

  const pPr = paragraph.appendChild(document.createElementNS(W_NS, 'w:pPr'));
  const pBdr = pPr.appendChild(document.createElementNS(W_NS, 'w:pBdr'));
  const bottom = pBdr.appendChild(document.createElementNS(W_NS, 'w:bottom'));
  bottom.setAttributeNS(W_NS, 'w:val', 'single');
  bottom.setAttributeNS(W_NS, 'w:sz', '6');
  bottom.setAttributeNS(W_NS, 'w:space', '1');
  bottom.setAttributeNS(W_NS, 'w:color', 'auto');
}

function markHeaderRow(row: Element): void {
  const document = row.ownerDocument;
  let trPr = children(row, 'trPr')[0];
  if (!trPr) {
    trPr = row.insertBefore(
      document.createElementNS(W_NS, 'w:trPr'),
      row.firstChild
    );
  }
  if (children(trPr, 'tblHeader').length === 0) {
    // The generator writes at most cantSplit here, which comes before tblHeader.
    trPr.appendChild(document.createElementNS(W_NS, 'w:tblHeader'));
  }
}

function children(parent: Element, localName: string): Element[] {
  return Array.from(parent.children).filter(
    (child) => child.namespaceURI === W_NS && child.localName === localName
  );
}

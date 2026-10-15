/** Namespace of the WordprocessingML parts inside a .docx. */
export const WORDPROCESSING_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

/** Namespace of the `xml:` prefix, used for `xml:space`. */
export const XML_NS = 'http://www.w3.org/XML/1998/namespace';

/**
 * `XMLSerializer` drops the XML declaration that OPC parts start with, so it is
 * copied back from the source.
 */
export function keepXmlDeclaration(original: string, serialized: string): string {
  const declaration = /^\s*(<\?xml[^>]*\?>)/.exec(original);
  if (declaration && !serialized.trimStart().startsWith('<?')) {
    return `${declaration[1]}\n${serialized}`;
  }
  return serialized;
}

/** The children of `<w:pPr>`, in the order the schema requires. */
const PARAGRAPH_PROPERTY_ORDER = [
  'pStyle',
  'keepNext',
  'keepLines',
  'pageBreakBefore',
  'framePr',
  'widowControl',
  'numPr',
  'suppressLineNumbers',
  'pBdr',
  'shd',
  'tabs',
  'suppressAutoHyphens',
  'kinsoku',
  'wordWrap',
  'overflowPunct',
  'topLinePunct',
  'autoSpaceDE',
  'autoSpaceDN',
  'bidi',
  'adjustRightInd',
  'snapToGrid',
  'spacing',
  'ind',
  'contextualSpacing',
  'mirrorIndents',
  'suppressOverlap',
  'jc',
  'textDirection',
  'textAlignment',
  'textboxTightWrap',
  'outlineLvl',
  'divId',
  'cnfStyle',
  'rPr',
  'sectPr',
  'pPrChange',
];

/**
 * The `localName` child of a `<w:pPr>`, created in schema order if missing.
 * WinWord rejects paragraph properties that are out of order.
 */
export function paragraphProperty(pPr: Element, localName: string): Element {
  const rank = PARAGRAPH_PROPERTY_ORDER.indexOf(localName);
  let before: Element | null = null;
  for (const child of Array.from(pPr.children)) {
    if (child.namespaceURI !== WORDPROCESSING_NS) {
      continue;
    }
    if (child.localName === localName) {
      return child;
    }
    if (before === null && PARAGRAPH_PROPERTY_ORDER.indexOf(child.localName) > rank) {
      before = child;
    }
  }
  const created = pPr.ownerDocument.createElementNS(WORDPROCESSING_NS, `w:${localName}`);
  return pPr.insertBefore(created, before);
}

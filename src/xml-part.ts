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

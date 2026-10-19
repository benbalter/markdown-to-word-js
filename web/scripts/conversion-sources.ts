// How a conversion started, the `source` dimension of the anonymous conversion
// counter. Shared by the browser beacon (analytics.ts) and the Worker
// (worker/index.js), which bounds the beacon's `s` parameter to this list, so
// keep it pure data. Each value counts one .docx produced:
//   drop    a .md file dropped on the page or chosen with the file picker
//   paste   Markdown pasted or typed into the box, converted with the button
//           or Ctrl/⌘+Enter
//   webmcp  an AI agent using the page's WebMCP convert_markdown_to_docx tool
// Downloading or copying a result already counted isn't a new conversion.
// Ported from word2md.com's web/scripts/converter/conversion-sources.ts.
export const CONVERSION_SOURCES = ['drop', 'paste', 'webmcp'] as const;

export type ConversionSource = (typeof CONVERSION_SOURCES)[number];

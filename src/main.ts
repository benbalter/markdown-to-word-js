// The npm package's entry: the converter without the browser UI (index.ts).
// Browsers and bundlers load this directly; Node loads node.ts, which supplies
// the DOM APIs the converter needs first.
export { convertMarkdownToWord, type ConversionOptions } from './converter.js';
export { extractTitle, parseMarkdownToHtml } from './markdown-parser.js';
export {
  CHINESE_OFFICIAL_DOC_FONTS,
  FONT_PRESETS,
  type FontPreset,
  type LevelStyle,
  type LineSpacing,
  type ParagraphStyle,
} from './font-presets.js';

// Markdown input for each row of the "What gets converted" table. Universal
// syntax, so it isn't translated; pairs with t.conversionRows (the Word
// result, translated) by index — the two arrays must stay the same length.
// Shared by ConversionTable.astro and the home page's Markdown twin
// (web/agent/markdown.ts). List only what the converter really produces;
// test/converter.test.ts round-trips each of these through a .docx.
export const markdownInputs = [
  '# Heading',
  '**bold** *italic*',
  '~~text~~',
  '- item · 1. item',
  '- [x] task',
  '| a | b |',
  '[text](url)',
  '`code` · ```',
  '> quote',
  '---',
];

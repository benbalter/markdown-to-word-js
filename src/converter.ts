import HTMLtoDOCX from '@turbodocx/html-to-docx';
import { formatCodeBlocks } from './docx-code-blocks.js';
import { applyFontPreset } from './docx-font-preset.js';
import type { FontPreset } from './font-presets.js';
import { parseMarkdownToHtml, extractTitle } from './markdown-parser.js';

interface ConversionOptions {
  filename?: string;
  pageMargins?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  /** Rewrites the document fonts. Omit to keep the default styling. */
  fontPreset?: FontPreset;
}

/**
 * Convert markdown text to a Word document blob using HTML as an intermediary format
 */
export async function convertMarkdownToWord(
  markdown: string,
  options: ConversionOptions = {}
): Promise<Blob> {
  try {
    const html = parseMarkdownToHtml(markdown);

    const documentOptions: HTMLtoDOCX.DocumentOptions = {};

    const title = extractTitle(markdown);
    if (title) {
      documentOptions.title = title;
    }

    if (options.pageMargins) {
      // Convert inches to twips (1 inch = 1440 twips)
      documentOptions.margins = {
        top: options.pageMargins.top * 1440,
        right: options.pageMargins.right * 1440,
        bottom: options.pageMargins.bottom * 1440,
        left: options.pageMargins.left * 1440,
      };
    }

    const result = await HTMLtoDOCX(html, null, documentOptions);

    // HTMLtoDOCX returns Blob in browser, Buffer/ArrayBuffer in Node.js
    const generated = result instanceof Blob ? result : new Blob([result]);

    // Code blocks are broken in the generator output itself, so they are fixed
    // whether or not a font preset is requested.
    const wordDocument = await formatCodeBlocks(generated);

    return options.fontPreset ? applyFontPreset(wordDocument, options.fontPreset) : wordDocument;
  } catch (error) {
    console.error('Word document generation error:', error);
    throw new Error('Failed to generate Word document');
  }
}
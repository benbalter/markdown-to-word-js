import HTMLtoDOCX from '@turbodocx/html-to-docx';
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

    // Both patches rewrite the .docx zip with JSZip. html-to-docx bundles its own
    // copy, so ours is a second one; load it only when a patch actually applies.

    // Code blocks are broken in the generator output itself, so they are fixed
    // whether or not a font preset is requested.
    let wordDocument = generated;
    if (html.includes('<pre')) {
      const { formatCodeBlocks } = await import('./docx-code-blocks.js');
      wordDocument = await formatCodeBlocks(wordDocument);
    }

    if (options.fontPreset) {
      const { applyFontPreset } = await import('./docx-font-preset.js');
      wordDocument = await applyFontPreset(wordDocument, options.fontPreset);
    }

    return wordDocument;
  } catch (error) {
    console.error('Word document generation error:', error);
    throw new Error('Failed to generate Word document');
  }
}
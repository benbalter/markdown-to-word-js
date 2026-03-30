import HTMLtoDOCX from '@turbodocx/html-to-docx';
import { parseMarkdownToHtml, extractTitle } from './markdown-parser.js';

interface ConversionOptions {
  filename?: string;
  pageMargins?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
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
    if (result instanceof Blob) {
      return result;
    }
    return new Blob([result]);
  } catch (error) {
    console.error('Word document generation error:', error);
    throw new Error('Failed to generate Word document');
  }
}
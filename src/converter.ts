// Must come first: it sets the global Buffer html-to-docx needs for images.
import './buffer-global.js';
import HTMLtoDOCX from '@turbodocx/html-to-docx';
import { prepareHtmlForDocx } from './docx-html.js';
import type { DocumentStructure } from './docx-structure.js';
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

    const documentOptions: HTMLtoDOCX.DocumentOptions = {
      // The generator's default border size is 0, so tables had no grid lines.
      // A thin light gray rule (size in eighths of a point) matches how
      // GitHub draws tables.
      table: { borderOptions: { size: 4, stroke: 'single', color: 'BFBFBF' } },
    };

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

    const result = await HTMLtoDOCX(prepareHtmlForDocx(html), null, documentOptions);

    // HTMLtoDOCX returns Blob in browser, Buffer/ArrayBuffer in Node.js
    const generated =
      result instanceof Blob ? result : new Blob([result as BlobPart]);

    // The patches rewrite the .docx zip with JSZip. html-to-docx bundles its own
    // copy, so ours is a second one; load it only when a patch actually applies.

    // Code blocks are broken in the generator output itself, so they are fixed
    // whether or not a font preset is requested.
    let wordDocument = generated;
    if (html.includes('<pre')) {
      const codeBlocks = codeBlockTexts(html);
      wordDocument = await patchOrKeep(wordDocument, 'code block', async (document) => {
        const { formatCodeBlocks } = await import('./docx-code-blocks.js');
        return formatCodeBlocks(document, codeBlocks);
      });
    }

    if (html.includes('<hr') || html.includes('<table')) {
      const structure = documentStructure(html);
      wordDocument = await patchOrKeep(wordDocument, 'structure', async (document) => {
        const { patchStructure } = await import('./docx-structure.js');
        return patchStructure(document, structure);
      });
    }

    const { fontPreset } = options;
    if (fontPreset) {
      wordDocument = await patchOrKeep(wordDocument, 'font preset', async (document) => {
        const { applyFontPreset } = await import('./docx-font-preset.js');
        return applyFontPreset(document, fontPreset);
      });
    }

    return wordDocument;
  } catch (error) {
    console.error('Word document generation error:', error);
    throw new Error('Failed to generate Word document', { cause: error });
  }
}

/** The text of each `<pre>` in `html`, in document order. */
function codeBlockTexts(html: string): string[] {
  const dom = new DOMParser().parseFromString(html, 'text/html');
  return Array.from(dom.querySelectorAll('pre'), (pre) => pre.textContent ?? '');
}

/** The rules and table header rows in `html`, for the structure patch. */
function documentStructure(html: string): DocumentStructure {
  const dom = new DOMParser().parseFromString(html, 'text/html');
  return {
    rules: dom.querySelectorAll('hr').length,
    headerRows: Array.from(dom.querySelectorAll('table'), (table) => {
      const firstRow = table.querySelector('tr');
      return Boolean(table.tHead) || Boolean(firstRow && firstRow.querySelector('td') === null);
    }),
  };
}

/**
 * The patches polish a document html-to-docx already produced, so a failure in
 * one (including its chunk failing to load) keeps the unpatched document
 * rather than failing the whole conversion.
 */
async function patchOrKeep(
  wordDocument: Blob,
  name: string,
  patch: (wordDocument: Blob) => Promise<Blob>
): Promise<Blob> {
  try {
    return await patch(wordDocument);
  } catch (error) {
    console.warn(`Skipped the ${name} patch; keeping the unpatched document:`, error);
    return wordDocument;
  }
}
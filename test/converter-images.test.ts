import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import JSZip from 'jszip';
import { convertMarkdownToWord } from '../src/converter';

// A 1×1 PNG.
const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

/**
 * Browsers have no global Buffer, and html-to-docx's browser build needs one
 * to embed images. Node does have one, so it's removed here to test the way
 * the app runs.
 */
describe('images without a global Buffer, as in a browser', () => {
  const globals = globalThis as { Buffer?: unknown };
  const nodeBuffer = globals.Buffer;

  beforeAll(() => {
    delete globals.Buffer;
    vi.resetModules();
  });

  afterAll(() => {
    globals.Buffer = nodeBuffer;
  });

  it('embeds a data: URI image instead of failing the conversion', async () => {
    const { convertMarkdownToWord } = await import('../src/converter');
    const blob = await convertMarkdownToWord(`![pixel](${PIXEL})\n`);

    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const xml = await zip.file('word/document.xml')!.async('string');
    expect(xml).toContain('<w:drawing>');
    expect(
      Object.keys(zip.files).some((name) => /^word\/media\/.+\.png$/.test(name))
    ).toBe(true);
  });
});

describe('image content types', () => {
  // A 1×1 GIF and a 1×1 BMP: formats html-to-docx embeds but doesn't declare.
  const GIF =
    'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  const BMP = `data:image/bmp;base64,${Buffer.from(
    '424d3a0000000000000036000000280000000100000001000000010018000000000004000000130b0000130b00000000000000000000ffffff00',
    'hex'
  ).toString('base64')}`;

  it('declares a content type for every embedded image', async () => {
    const blob = await convertMarkdownToWord(
      `![gif](${GIF}) ![bmp](${BMP}) ![png](${PIXEL})\n`
    );
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const types = await zip.file('[Content_Types].xml')!.async('string');
    const declared = new Set(
      Array.from(types.matchAll(/<Default Extension="([^"]+)"/g), (match) =>
        match[1].toLowerCase()
      )
    );
    const extensions = Object.keys(zip.files)
      .filter((name) => /^word\/media\/.+\.[^.]+$/.test(name))
      .map((name) => name.split('.').pop()!.toLowerCase());

    expect(new Set(extensions)).toEqual(new Set(['gif', 'bmp', 'png']));
    for (const extension of extensions) {
      expect(declared).toContain(extension);
    }
    expect(types).toContain(
      '<Default Extension="gif" ContentType="image/gif"/>'
    );
  });
});

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import JSZip from 'jszip';

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
    expect(Object.keys(zip.files).some((name) => /^word\/media\/.+\.png$/.test(name))).toBe(
      true
    );
  });
});

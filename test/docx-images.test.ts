import { describe, it, expect, vi, afterEach } from 'vitest';
import JSZip from 'jszip';
import { convertMarkdownToWord } from '../src/converter';
import {
  CONCURRENCY,
  MAX_IMAGE_BYTES,
  MAX_IMAGES,
  embedImages,
} from '../src/docx-images';

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

// A 1×1 PNG.
const PIXEL_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const PIXEL = Buffer.from(PIXEL_BASE64, 'base64');

function image(
  body: Uint8Array,
  contentType: string | null = 'image/png'
): Response {
  const headers = contentType ? { 'content-type': contentType } : undefined;
  return new Response(body as BlobPart, { status: 200, headers });
}

interface Converted {
  xml: string;
  paragraphs: string[];
  links: (string | undefined)[][];
  media: string[];
}

async function convert(markdown: string): Promise<Converted> {
  const blob = await convertMarkdownToWord(markdown);
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const xml = await zip.file('word/document.xml')!.async('string');
  const rels = await zip.file('word/_rels/document.xml.rels')!.async('string');
  const dom = new DOMParser().parseFromString(xml, 'application/xml');
  const body = dom.getElementsByTagNameNS(W_NS, 'body')[0];
  const paragraphs = Array.from(body.children)
    .filter((child) => child.localName === 'p')
    .map((p) =>
      Array.from(
        p.getElementsByTagNameNS(W_NS, 't'),
        (t) => t.textContent
      ).join('')
    );
  const links = Array.from(
    dom.getElementsByTagNameNS(W_NS, 'hyperlink'),
    (link) => {
      const id = link.getAttributeNS(
        'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
        'id'
      );
      const target = new RegExp(`Id="${id}"[^>]*Target="([^"]+)"`).exec(
        rels
      )?.[1];
      const text = Array.from(
        link.getElementsByTagNameNS(W_NS, 't'),
        (t) => t.textContent
      ).join('');
      return [text, target];
    }
  );
  const media = Object.keys(zip.files).filter((name) =>
    name.startsWith('word/media/')
  );
  return { xml, paragraphs, links, media };
}

describe('images', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('embeds a web image, fetching it only once however often it appears', async () => {
    const fetch = vi.fn(async () => image(PIXEL));
    vi.stubGlobal('fetch', fetch);

    const { xml, media } = await convert(
      '![a](https://example.com/a.png)\n\n![a again](https://example.com/a.png)\n'
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(xml.match(/<w:drawing>/g)).toHaveLength(2);
    expect(media.length).toBeGreaterThan(0);
  });

  it('keeps the alt text, linked to the image, when the image cannot be fetched', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('Failed to fetch')))
    );

    const { xml, paragraphs, links } = await convert(
      'Before\n\n![A chart of sales](https://example.com/chart.png)\n\nAfter\n'
    );
    expect(xml).not.toContain('<w:drawing>');
    expect(paragraphs).toEqual(['Before', 'A chart of sales', 'After']);
    expect(links).toEqual([
      ['A chart of sales', 'https://example.com/chart.png'],
    ]);
  });

  it('retries a network failure once, but not a 404', async () => {
    const flaky = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(image(PIXEL));
    vi.stubGlobal('fetch', flaky);
    expect(
      await embedImages('<img src="https://example.com/a.png">')
    ).toContain(`src="data:image/png;base64,${PIXEL_BASE64}"`);
    expect(flaky).toHaveBeenCalledTimes(2);

    const missing = vi.fn(
      async () => new Response('Not found', { status: 404 })
    );
    vi.stubGlobal('fetch', missing);
    expect(
      await embedImages('<img alt="gone" src="https://example.com/a.png">')
    ).toBe('<a href="https://example.com/a.png">gone</a>');
    expect(missing).toHaveBeenCalledTimes(1);
  });

  it('reads the type from the file when the server does not name an image type', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => image(PIXEL, 'application/octet-stream'))
    );
    expect(await embedImages('<img src="https://example.com/a">')).toContain(
      'src="data:image/png;base64,'
    );
  });

  it('falls back to the alt text for a page that is not an image', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        image(new TextEncoder().encode('<html></html>'), 'text/html')
      )
    );
    expect(
      await embedImages(
        '<p><img alt="logo" src="https://example.com/logo"></p>'
      )
    ).toBe('<p><a href="https://example.com/logo">logo</a></p>');
  });

  it('uses the URL as the text of an image with no alt text', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('Failed to fetch')))
    );
    expect(await embedImages('<img src="https://example.com/a.png">')).toBe(
      '<a href="https://example.com/a.png">https://example.com/a.png</a>'
    );
  });

  it('keeps the alt text, unlinked, inside a link or for a relative path', async () => {
    const fetch = vi.fn(async () =>
      Promise.reject(new TypeError('Failed to fetch'))
    );
    vi.stubGlobal('fetch', fetch);
    expect(
      await embedImages(
        '<a href="https://ci.example"><img alt="build" src="https://ci.example/b.svg"></a>'
      )
    ).toBe('<a href="https://ci.example">build</a>');
    expect(await embedImages('<img alt="local" src="images/a.png">')).toBe(
      'local'
    );
    // Two attempts for the badge; a relative path is never fetched, since
    // html-to-docx can't embed it either.
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('leaves data: URIs for the generator, without fetching', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const html = `<img src="data:image/png;base64,${PIXEL_BASE64}">`;
    expect(await embedImages(html)).toBe(html);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('only fetches the URLs html-to-docx would', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    // No dot-suffix, which html-to-docx's URL check requires; and a URL that
    // isn't the whole src.
    await embedImages(
      '<img alt="a" src="http://intranet"><img alt="b" src="see http://x.example/a.png">'
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('gives up on an image whose Content-Length is over the limit, unread', async () => {
    const body = new ReadableStream<Uint8Array>({
      pull(): void {
        throw new Error('the body should not be read');
      },
    });
    const fetch = vi.fn(
      async () =>
        new Response(body, {
          headers: {
            'content-type': 'image/png',
            'content-length': String(MAX_IMAGE_BYTES + 1),
          },
        })
    );
    vi.stubGlobal('fetch', fetch);
    expect(
      await embedImages('<img alt="big" src="https://example.com/big.png">')
    ).toBe('<a href="https://example.com/big.png">big</a>');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('stops reading a body that runs past the limit, and does not retry', async () => {
    const chunk = new Uint8Array(1024 * 1024);
    let pulled = 0;
    let cancelled = false;
    const fetch = vi.fn(async () => {
      const body = new ReadableStream<Uint8Array>({
        pull(controller): void {
          pulled++;
          controller.enqueue(chunk);
        },
        cancel(): void {
          cancelled = true;
        },
      });
      return new Response(body, { headers: { 'content-type': 'image/png' } });
    });
    vi.stubGlobal('fetch', fetch);

    expect(
      await embedImages(
        '<img alt="endless" src="https://example.com/endless.png">'
      )
    ).toBe('<a href="https://example.com/endless.png">endless</a>');
    expect(cancelled).toBe(true);
    // Just past the limit (plus the stream's read-ahead), not an endless body.
    expect(pulled * chunk.length).toBeLessThanOrEqual(
      MAX_IMAGE_BYTES + 3 * chunk.length
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it(`fetches at most ${CONCURRENCY} images at once`, async () => {
    let active = 0;
    let peak = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active--;
        return image(PIXEL);
      })
    );
    const html = Array.from(
      { length: 12 },
      (_, i) => `<img src="https://example.com/${i}.png">`
    ).join('');
    const result = await embedImages(html);
    expect(peak).toBe(CONCURRENCY);
    expect(result.match(/src="data:image\/png/g)).toHaveLength(12);
  });

  it(`fetches at most ${MAX_IMAGES} distinct images, keeping the alt text of the rest`, async () => {
    const fetch = vi.fn(async () => image(PIXEL));
    vi.stubGlobal('fetch', fetch);
    const count = MAX_IMAGES + 5;
    const html = Array.from(
      { length: count },
      (_, i) => `<img alt="img ${i}" src="https://example.com/${i}.png">`
    ).join('');
    const result = await embedImages(html);
    expect(fetch).toHaveBeenCalledTimes(MAX_IMAGES);
    expect(result.match(/src="data:/g)).toHaveLength(MAX_IMAGES);
    expect(result).toContain(
      `<a href="https://example.com/${count - 1}.png">img ${count - 1}</a>`
    );
  });
});

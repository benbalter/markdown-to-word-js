import { Buffer } from 'buffer';

/** html-to-docx's own limit for one image. */
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** Per attempt; the second attempt waits twice as long, as html-to-docx's do. */
const TIMEOUT_MS = 5000;
const ATTEMPTS = 2;

/** Leading bytes of the image formats Word embeds, for servers that don't say. */
const SIGNATURES: [string, number[]][] = [
  ['image/png', [0x89, 0x50, 0x4e, 0x47]],
  ['image/jpeg', [0xff, 0xd8, 0xff]],
  ['image/gif', [0x47, 0x49, 0x46, 0x38]],
  ['image/bmp', [0x42, 0x4d]],
];

/**
 * Downloads each web image in `html` and swaps its `src` for a `data:` URI,
 * which html-to-docx embeds without downloading it again. An image that can't
 * be fetched becomes its alt text, linked to its URL, where html-to-docx would
 * drop it without a trace. Other sources it can't embed either, such as a
 * relative path, keep their alt text too.
 *
 * Each URL is fetched once, however many times it appears, and all of them at
 * once.
 */
export async function embedImages(html: string): Promise<string> {
  const dom = new DOMParser().parseFromString(html, 'text/html');
  const images = Array.from(dom.querySelectorAll('img'));
  if (images.length === 0) return html;

  const downloads = new Map<string, Promise<string | null>>();
  await Promise.all(
    images.map(async (image) => {
      const src = image.getAttribute('src')?.trim() ?? '';
      if (src.startsWith('data:')) return;

      let dataUri: string | null = null;
      if (/^https?:\/\//i.test(src)) {
        let download = downloads.get(src);
        if (!download) {
          download = fetchImage(src);
          downloads.set(src, download);
        }
        dataUri = await download;
      }

      if (dataUri) {
        image.setAttribute('src', dataUri);
      } else {
        replaceWithAltText(image, src);
      }
    })
  );

  return dom.body.innerHTML;
}

/** The image at `url` as a `data:` URI, or null if it can't be fetched. */
async function fetchImage(url: string): Promise<string | null> {
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(TIMEOUT_MS * attempt),
      });
      // Not found or forbidden won't change on a retry.
      if (!response.ok) return null;
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) return null;
      const type = imageType(response.headers.get('content-type'), bytes);
      if (!type) return null;
      return `data:${type};base64,${Buffer.from(bytes).toString('base64')}`;
    } catch {
      // Offline, blocked by CORS or the CSP, or timed out: try once more.
    }
  }
  return null;
}

/**
 * The image's media type: the server's, if it says it's an image, or else
 * read from the file's first bytes. Null for anything else (an error page
 * served with 200, say), which html-to-docx would fail to measure and drop.
 */
function imageType(
  contentType: string | null,
  bytes: Uint8Array
): string | null {
  const declared = contentType?.split(';')[0].trim().toLowerCase();
  if (declared?.startsWith('image/')) return declared;
  const match = SIGNATURES.find(([, signature]) =>
    signature.every((byte, index) => bytes[index] === byte)
  );
  return match?.[0] ?? null;
}

/**
 * Puts the image's alt text where it was, as a link to `src` when that's a web
 * URL and the image isn't already inside a link. With no alt text, the URL
 * itself is the text.
 */
function replaceWithAltText(image: HTMLImageElement, src: string): void {
  const document = image.ownerDocument;
  const isWebUrl = /^https?:\/\//i.test(src);
  const text = image.getAttribute('alt')?.trim() || (isWebUrl ? src : '');
  if (!text) {
    image.remove();
    return;
  }
  if (!isWebUrl || image.closest('a')) {
    image.replaceWith(document.createTextNode(text));
    return;
  }
  const link = document.createElement('a');
  link.setAttribute('href', src);
  link.textContent = text;
  image.replaceWith(link);
}

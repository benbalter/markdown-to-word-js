import { Buffer } from 'buffer';

/** html-to-docx's own limit for one image (imageProcessing.maxImageSize). */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/**
 * The most distinct image URLs fetched for one document: html-to-docx keeps
 * at most this many in its image cache (imageProcessing.maxCacheEntries). The
 * rest keep their alt text.
 */
export const MAX_IMAGES = 100;

/**
 * How many downloads run at once. html-to-docx fetched one at a time; a few
 * in parallel is faster without opening a connection per image.
 */
export const CONCURRENCY = 4;

/** Per attempt; the second attempt waits twice as long, as html-to-docx's do. */
const TIMEOUT_MS = 5000;
const ATTEMPTS = 2;

/**
 * The URLs html-to-docx downloads (its `isValidUrl`, without the `g` flag
 * that makes `test()` stateful), anchored so the whole `src` is the URL.
 * Requiring both means this module never fetches what it wouldn't.
 */
const GENERATOR_URL =
  /http(s)?:\/\/(\w+:?\w*@)?(\S+)(:\d+)?((?<=\.)\w+)+(\/([\w#!:.?+=&%@!\-/])*)?/i;
const WEB_URL = /^https?:\/\//i;

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
 * Each URL is fetched once, however many times it appears: at most
 * MAX_IMAGES of them, CONCURRENCY at a time.
 */
export async function embedImages(html: string): Promise<string> {
  const dom = new DOMParser().parseFromString(html, 'text/html');
  const images = Array.from(dom.querySelectorAll('img'));
  if (images.length === 0) return html;

  const urls = new Set<string>();
  for (const image of images) {
    const src = image.getAttribute('src') ?? '';
    if (isFetchable(src) && urls.size < MAX_IMAGES) urls.add(src);
  }

  const queue = Array.from(urls);
  const downloads = new Map<string, string | null>();
  const worker = async (): Promise<void> => {
    for (let url = queue.shift(); url !== undefined; url = queue.shift()) {
      downloads.set(url, await fetchImage(url));
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker)
  );

  for (const image of images) {
    const src = image.getAttribute('src') ?? '';
    if (src.startsWith('data:')) continue;
    const dataUri = downloads.get(src);
    if (dataUri) {
      image.setAttribute('src', dataUri);
    } else {
      replaceWithAltText(image, src);
    }
  }

  return dom.body.innerHTML;
}

function isFetchable(src: string): boolean {
  return WEB_URL.test(src) && GENERATOR_URL.test(src);
}

/** The image at `url` as a `data:` URI, or null if it can't be fetched. */
async function fetchImage(url: string): Promise<string | null> {
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const tooLarge = new AbortController();
    try {
      const response = await fetch(url, {
        signal: AbortSignal.any([
          tooLarge.signal,
          AbortSignal.timeout(TIMEOUT_MS * attempt),
        ]),
      });
      // Not found, forbidden or too large won't change on a retry.
      if (!response.ok) return null;
      if (Number(response.headers.get('content-length')) > MAX_IMAGE_BYTES) {
        tooLarge.abort();
        return null;
      }
      const bytes = await readBody(response, tooLarge);
      if (!bytes || bytes.length === 0) return null;
      const type = imageType(response.headers.get('content-type'), bytes);
      if (!type) return null;
      return `data:${type};base64,${Buffer.from(bytes).toString('base64')}`;
    } catch {
      if (tooLarge.signal.aborted) return null;
      // Offline, blocked by CORS or the CSP, or timed out: try once more.
    }
  }
  return null;
}

/**
 * The response body, read a chunk at a time so a server that sends more than
 * MAX_IMAGE_BYTES (whatever its Content-Length said) is cut off there rather
 * than held in memory. Null if it was too large.
 */
async function readBody(
  response: Response,
  tooLarge: AbortController
): Promise<Uint8Array | null> {
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    return bytes.length > MAX_IMAGE_BYTES ? null : bytes;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (
    let chunk = await reader.read();
    !chunk.done;
    chunk = await reader.read()
  ) {
    total += chunk.value.length;
    if (total > MAX_IMAGE_BYTES) {
      tooLarge.abort();
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(chunk.value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
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
  const isWebUrl = WEB_URL.test(src);
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

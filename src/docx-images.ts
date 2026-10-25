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

/**
 * Leading bytes of the bitmap formats Word embeds. An image is checked
 * against them whatever its declared type: html-to-docx drops a file it can't
 * read (with its alt text), and embeds a format Word can't show, such as
 * HEIC, as a broken picture.
 */
const SIGNATURES: [string, number[]][] = [
  ['image/png', [0x89, 0x50, 0x4e, 0x47]],
  ['image/jpeg', [0xff, 0xd8, 0xff]],
  ['image/gif', [0x47, 0x49, 0x46, 0x38]],
  ['image/bmp', [0x42, 0x4d]],
];

/** The other format Word embeds, recognized by its root element. */
const SVG_TYPE = 'image/svg+xml';

/**
 * An SVG file's start: `<svg`, after at most an XML declaration, comments and
 * a doctype. Anchored, so an HTML page with an inline icon doesn't count.
 */
const SVG_START =
  /^\uFEFF?\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*|<!DOCTYPE[^>]*>\s*)*<svg[\s>]/i;

/** How far into a file to look for SVG_START. */
const SVG_SNIFF_BYTES = 4096;

/** `data:[type][;params][;base64],payload` */
const DATA_URI = /^data:([^,]*?)(;base64)?,(.*)$/is;

const PERCENT = 0x25;

/**
 * Downloads each web image in `html` and swaps its `src` for a `data:` URI,
 * which html-to-docx embeds without downloading it again. An image that can't
 * be fetched becomes its alt text, linked to its URL, where html-to-docx would
 * drop it without a trace. Other sources it can't embed either, such as a
 * relative path, keep their alt text too. So does a `data:` URI that isn't a
 * PNG, JPEG, GIF, BMP or SVG image; one that is gets rewritten as base64 of
 * the type its bytes show, which is the form html-to-docx reads.
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
    const dataUri = /^data:/i.test(src)
      ? checkDataUri(src)
      : downloads.get(src);
    if (dataUri) {
      image.setAttribute('src', dataUri);
    } else {
      replaceWithAltText(image, src);
    }
  }

  return dom.body.innerHTML;
}

/**
 * `src`, a `data:` URI, as base64 of the image type its bytes show, or null
 * if it's malformed, too large, or not an image Word embeds.
 */
function checkDataUri(src: string): string | null {
  const match = DATA_URI.exec(src);
  if (!match) return null;
  const [, type, base64, payload] = match;
  let bytes: Uint8Array;
  try {
    bytes = base64
      ? Buffer.from(payload.replace(/\s+/g, ''), 'base64')
      : percentDecode(payload);
  } catch {
    return null;
  }
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) return null;
  const actual = imageType(type, bytes);
  if (!actual) return null;
  return `data:${actual};base64,${Buffer.from(bytes).toString('base64')}`;
}

/** The bytes of a URL-encoded `data:` payload. Throws on a bad escape. */
function percentDecode(payload: string): Uint8Array {
  // `%` and hex digits are ASCII, so escapes can be read off the UTF-8 bytes.
  const encoded = new TextEncoder().encode(payload);
  const bytes = new Uint8Array(encoded.length);
  let length = 0;
  for (let index = 0; index < encoded.length; index++) {
    if (encoded[index] === PERCENT) {
      const hex = String.fromCharCode(
        ...encoded.subarray(index + 1, index + 3)
      );
      if (!/^[0-9a-f]{2}$/i.test(hex)) throw new Error('Bad escape');
      bytes[length++] = parseInt(hex, 16);
      index += 2;
    } else {
      bytes[length++] = encoded[index];
    }
  }
  return bytes.subarray(0, length);
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
 * The image's media type, read from its first bytes: PNG, JPEG, GIF or BMP,
 * whatever `declared` says, or SVG if it says so (or names no image type)
 * and the file starts like one. Null for anything else, such as an error
 * page served with 200, or HEIC, which html-to-docx would embed but Word
 * can't show.
 */
function imageType(declared: string | null, bytes: Uint8Array): string | null {
  const match = SIGNATURES.find(([, signature]) =>
    signature.every((byte, index) => bytes[index] === byte)
  );
  if (match) return match[0];
  const type = declared?.split(';')[0].trim().toLowerCase() ?? '';
  if (type !== SVG_TYPE && type.startsWith('image/')) return null;
  const head = new TextDecoder().decode(bytes.subarray(0, SVG_SNIFF_BYTES));
  return SVG_START.test(head) ? SVG_TYPE : null;
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

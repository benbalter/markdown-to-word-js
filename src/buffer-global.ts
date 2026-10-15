import { Buffer } from 'buffer';

// html-to-docx embeds images through Node's global Buffer, which browsers
// don't have: remote images were skipped and a data: URI image failed the
// whole conversion. Its README lists the polyfill as required in a browser.
// This is its own module so importing it first sets the global before
// html-to-docx loads.
const globals = globalThis as { Buffer?: unknown };
globals.Buffer ??= Buffer;

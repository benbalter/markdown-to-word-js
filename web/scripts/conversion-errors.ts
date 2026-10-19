// Why a conversion failed, the `error` dimension of the anonymous conversion
// counter, sent only with outcome=error. Shared by the browser (src/index.ts
// classifies each failure into one of these to pick the message the visitor
// sees, and analytics.ts sends it) and the Worker (worker/index.js), which
// bounds the beacon's `e` parameter to this list, so keep it pure data.
// Only conversions that were attempted are counted: input refused before
// converting (a Word file, a file too large or not text, an empty box) isn't,
// so it has no kind here.
//   load         the converter's code couldn't be downloaded
//   too-complex  the engine ran out of stack or memory (very deep nesting or a
//                huge document)
//   conversion   anything else (the generic "something went wrong")
// Ported from word2md.com's web/scripts/converter/conversion-errors.ts.
export const CONVERSION_ERROR_KINDS = [
  'load',
  'too-complex',
  'conversion',
] as const;

export type ConversionErrorKind = (typeof CONVERSION_ERROR_KINDS)[number];

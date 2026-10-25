// Checks for input that isn't Markdown, shared by the page (src/index.ts) and
// the `md2w` CLI (src/cli.ts) so both refuse the same files.

/** Word and other word-processor files: the reverse direction, word2md's job. */
export const WORD_FILE = /\.(docx?|dotx?|odt|rtf)$/i;

/** A file that's mostly binary isn't Markdown. NUL never appears in text. */
export function looksBinary(text: string): boolean {
  return text.slice(0, 8192).includes('\u0000');
}

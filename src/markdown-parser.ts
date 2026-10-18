import DOMPurify from 'dompurify';
import { Marked, type Token } from 'marked';
import markedFootnote from 'marked-footnote';

// Our own instance, not marked's shared default: as an npm package, configuring
// that one would change how the consumer's own copy of marked renders.
// GitHub Flavored Markdown as GitHub renders .md files: tables and task lists,
// and a single newline inside a paragraph is a space, not a line break.
const marked = new Marked({ gfm: true });

// marked's default code renderer keeps the block's trailing newline, which the
// .docx code block patch would turn into a blank last line in Word.
marked.use({
  renderer: {
    code({ text, lang }) {
      const language = lang?.match(/^\S*/)?.[0];
      const className = language
        ? ` class="language-${escapeHtml(language)}"`
        : '';
      return `<pre><code${className}>${escapeHtml(text)}</code></pre>\n`;
    },
  },
});

// GitHub's `[^1]` footnotes: numbered superscript references, and the notes in
// a list after a rule at the end, much as GitHub shows them. prepareHtmlForDocx
// drops the parts that only work on a web page (the in-page links).
marked.use(markedFootnote({ footnoteDivider: true }));

/**
 * extractTitle only lexes, and marked-footnote resets its per-document state
 * while rendering, so lexing with `marked` would number the next document's
 * footnotes wrong or throw. Titles get their own instance without it.
 */
const titleLexer = new Marked({ gfm: true });

/**
 * A `[^label]` footnote reference, which titleLexer leaves as text, or reads
 * as a reference-style link when the note is defined.
 */
const FOOTNOTE_REFERENCE = /\[\^[^\]\s]+\]/g;

/**
 * Parse markdown text and return HTML
 */
export function parseMarkdownToHtml(markdown: string): string {
  try {
    return marked.parse(markdown) as string;
  } catch (error) {
    console.error('Markdown parsing error:', error);
    throw new Error('Failed to parse markdown content', { cause: error });
  }
}

/**
 * Parse markdown into HTML that is safe to put in the page with innerHTML.
 * marked passes raw HTML through, so a shared .md file could otherwise run
 * script (e.g. `<img src=x onerror=...>`). The .docx path doesn't need this,
 * since html-to-docx never executes the HTML.
 */
export function renderPreviewHtml(markdown: string): string {
  return DOMPurify.sanitize(parseMarkdownToHtml(markdown));
}

/**
 * Extract the first H1 heading from markdown content as plain text, without
 * inline markup, since it becomes the Word document's title.
 * Returns null if no H1 heading is found.
 */
export function extractTitle(markdown: string): string | null {
  const tokens = titleLexer.lexer(markdown);
  for (const token of tokens) {
    if (token.type === 'heading' && token.depth === 1) {
      return plainText(token.tokens ?? [])
        .replace(FOOTNOTE_REFERENCE, '')
        .trim();
    }
  }
  return null;
}

/** The text of inline tokens with their markup (emphasis, links, code) removed. */
function plainText(tokens: Token[]): string {
  return tokens
    .map((token) => {
      if (
        token.type === 'link' &&
        token.raw.match(FOOTNOTE_REFERENCE)?.[0] === token.raw
      ) {
        return '';
      }
      if ('tokens' in token && token.tokens) return plainText(token.tokens);
      if (token.type === 'br') return ' ';
      if (token.type === 'html') return '';
      return 'text' in token ? token.text : '';
    })
    .join('');
}

/**
 * Convert a string into a URL/filename-safe slug.
 * Lowercases, replaces whitespace and underscores with hyphens,
 * strips characters that are not word characters (\w), whitespace, or hyphens,
 * and collapses consecutive hyphens. Note that \w includes [a-zA-Z0-9_] and
 * Unicode letters/digits, so accented characters are preserved.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escape text for HTML without needing a DOM, so parsing works outside a browser. */
function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

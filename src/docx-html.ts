/**
 * A monospace face that ships with Windows, so Chinese comments stay aligned.
 * Defined here rather than in the code block patch so the main bundle can use
 * it without loading that patch and JSZip.
 */
export const CODE_FONT = 'Courier New';

/** What Word shows in place of a task list checkbox, which it can't render. */
const CHECKBOX = { checked: '☒', unchecked: '☐' };

/**
 * Stands in for `<hr>`, which the generator drops. The structure patch turns
 * each one into a bordered paragraph; if that patch fails, a centered `* * *`
 * still reads as a section break.
 */
export const RULE_TEXT = '* * *';

/**
 * Stands in for `style` while the HTML is a live DOM. The page's CSP applies
 * to DOMParser documents too, and blocks (and reports) `style` attributes set
 * there. (CSSOM is allowed, but it quotes a font name with a space, which the
 * generator would read as part of the name.) Renamed back to `style` in the
 * serialized tags, where the CSP doesn't reach.
 */
const STYLE_PLACEHOLDER = 'data-docx-style';

/** How far each level of block quote is indented. */
const QUOTE_INDENT_INCHES = 0.5;

/** Block quote children that become indented paragraphs. */
const QUOTE_PARAGRAPHS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

/**
 * Inline elements the generator doesn't know, whose text it drops. Each is
 * replaced by what a browser shows: a span in the code font (for the ones a
 * browser draws in monospace), emphasis, or quotation marks. Other unknown
 * elements are unwrapped (see GENERATOR_ELEMENTS).
 */
const UNKNOWN_INLINE: Record<string, 'code' | 'em' | 'quote'> = {
  kbd: 'code',
  samp: 'code',
  tt: 'code',
  var: 'em',
  cite: 'em',
  dfn: 'em',
  q: 'quote',
};

/**
 * Elements the generator keeps the text of (each checked against it), or
 * that a later step here rewrites (`hr`, `mark`, `input`). Any other element
 * in a paragraph loses its text, so it's replaced by its children: an
 * allowlist, because a list of the ones it drops (`<abbr>`, `<small>`, a
 * custom `<my-element>`, ...) is never complete.
 */
const GENERATOR_ELEMENTS = new Set([
  ...['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'div', 'section', 'pre'],
  ...['ul', 'ol', 'li', 'blockquote', 'hr', 'br', 'img', 'input'],
  ...['table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'colgroup', 'col'],
  ...['a', 'span', 'code', 'strong', 'b', 'em', 'i', 'u', 's', 'del'],
  ...['strike', 'ins', 'sub', 'sup', 'mark', 'caption', 'figcaption'],
  ...['article', 'aside', 'header', 'footer', 'main', 'nav', 'address'],
  ...['hgroup', 'dl', 'dt', 'dd', 'details', 'summary', 'fieldset', 'legend'],
]);

/**
 * Elements whose content isn't prose: code, fallbacks a browser hides, and
 * drawings. The generator drops them, which is right; unwrapping them would
 * put a script, or an SVG's or formula's bare parts, in the document.
 */
const HIDDEN_CONTENT = new Set([
  ...['script', 'style', 'template', 'noscript', 'iframe', 'object'],
  ...['video', 'audio', 'canvas', 'svg', 'math'],
]);

/** `Node.TEXT_NODE`, which Node's globals lack. */
const TEXT_NODE = 3;

/** The highlight browsers give `<mark>`; the generator drops it. */
const MARK_COLOR = '#FFFF00';

/** `Node.ELEMENT_NODE`, which Node's globals lack too. */
const ELEMENT_NODE = 1;

/**
 * Elements that start their own paragraph in a table cell. Anything else is
 * inline, and a run of it is kept together in one paragraph.
 */
const CELL_BLOCKS = new Set([
  ...['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'div', 'pre', 'blockquote'],
  ...['ul', 'ol', 'table', 'hr', 'section'],
]);

/**
 * Adjusts the parser's HTML for html-to-docx, which drops or flattens some of
 * what the browser preview renders:
 *
 * - Task list checkboxes: `<input>` is dropped, so done and pending items read
 *   the same. Each becomes a ☒ or ☐ character.
 * - Inline code: `<code>` keeps the body font. Its text is wrapped in a span
 *   naming the code block font, which the generator does carry over.
 * - Table cells: the generator makes each inline child of a cell its own
 *   paragraph, so `**bold** text` would read as two lines. Each run of
 *   inline content is wrapped in one `<p>`. `<th>` isn't bold, so its
 *   content is wrapped in `<strong>`. Column alignment from GFM's `align`
 *   attribute is ignored, but the same value as a `text-align` style is
 *   honored.
 * - Horizontal rules: `<hr>` is dropped, so it becomes a centered RULE_TEXT
 *   paragraph for the structure patch to draw as a rule.
 * - Block quotes: the generator joins everything in a `<blockquote>` into one
 *   justified paragraph. Its paragraphs and headings are kept apart instead,
 *   left aligned and indented one step per level of nesting.
 * - Elements it doesn't know (`<kbd>`, `<abbr>`, `<q>`, `<my-element>`,
 *   ...): the generator drops their text, so this keeps it. Some are
 *   replaced by a span or `<em>` (see UNKNOWN_INLINE), the rest by their
 *   children; content a browser wouldn't show as text (HIDDEN_CONTENT) is
 *   left for the generator to drop. A placeholder like `<your-name>` that's
 *   never closed isn't markup at all, so it stays as literal text, spelled
 *   as in the source. `<mark>` loses its highlight, so it's set as a
 *   shading.
 * - Footnotes: the reference and back links point into the page, which a
 *   Word reader can't follow, so references keep only their number and the
 *   back links (↩) go. So does the footnotes heading, which the page only
 *   shows to screen readers.
 *
 * Only the HTML bound for the .docx changes; the preview keeps the original.
 */
export function prepareHtmlForDocx(html: string): string {
  const dom = new DOMParser().parseFromString(html, 'text/html');

  for (const input of Array.from(
    dom.querySelectorAll('input[type="checkbox"]')
  )) {
    const box = input.hasAttribute('checked')
      ? CHECKBOX.checked
      : CHECKBOX.unchecked;
    input.replaceWith(dom.createTextNode(box));
  }

  for (const code of Array.from(dom.querySelectorAll('code'))) {
    if (code.closest('pre')) continue;
    const span = dom.createElement('span');
    // A raw attribute, not `style.fontFamily`: see STYLE_PLACEHOLDER.
    span.setAttribute(STYLE_PLACEHOLDER, `font-family: ${CODE_FONT}`);
    span.append(...Array.from(code.childNodes));
    code.append(span);
  }

  for (const cell of Array.from(dom.querySelectorAll('th, td'))) {
    const align = cell.getAttribute('align');
    if (align) {
      (cell as HTMLElement).style.textAlign = align;
      cell.removeAttribute('align');
    }
    if (cell.localName === 'th' && cell.textContent?.trim()) {
      const strong = dom.createElement('strong');
      strong.append(...Array.from(cell.childNodes));
      cell.append(strong);
    }
    wrapInlineRuns(cell);
  }

  for (const quote of Array.from(dom.querySelectorAll('blockquote'))) {
    // Outermost first; each one unwraps its nested quotes as it goes.
    if (quote.isConnected) unwrapQuote(quote, 1);
  }

  const elements = Array.from(dom.body.querySelectorAll('*'));
  const startTags = new SourceStartTags(html, elements);
  for (const element of elements) {
    const name = element.localName;
    if (GENERATOR_ELEMENTS.has(name) || element.closest('pre')) continue;
    if (HIDDEN_CONTENT.has(name) || element.closest('svg, math')) continue;
    const kind = UNKNOWN_INLINE[name];
    if (!kind) {
      const children = Array.from(element.childNodes);
      if (isUnclosedPlaceholder(element, html)) {
        element.replaceWith(startTags.of(element), ...children);
      } else {
        element.replaceWith(...children);
      }
      continue;
    }
    if (kind === 'quote') {
      element.replaceWith('“', ...Array.from(element.childNodes), '”');
      continue;
    }
    const replacement = dom.createElement(kind === 'em' ? 'em' : 'span');
    if (kind === 'code') {
      replacement.setAttribute(STYLE_PLACEHOLDER, `font-family: ${CODE_FONT}`);
    }
    replacement.append(...Array.from(element.childNodes));
    element.replaceWith(replacement);
  }

  for (const mark of Array.from(dom.querySelectorAll('mark'))) {
    const span = dom.createElement('span');
    span.setAttribute(STYLE_PLACEHOLDER, `background-color: ${MARK_COLOR}`);
    span.append(...Array.from(mark.childNodes));
    mark.replaceWith(span);
  }

  for (const reference of Array.from(
    dom.querySelectorAll('a[data-footnote-ref]')
  )) {
    reference.replaceWith(...Array.from(reference.childNodes));
  }
  for (const backReference of Array.from(
    dom.querySelectorAll('a[data-footnote-backref]')
  )) {
    // The space before it, too, so the note doesn't end in one.
    const before = backReference.previousSibling;
    if (before?.nodeType === TEXT_NODE && before.textContent?.endsWith(' ')) {
      before.textContent = before.textContent.slice(0, -1);
    }
    backReference.remove();
  }
  dom.querySelector('section[data-footnotes] > h2')?.remove();

  for (const rule of Array.from(dom.querySelectorAll('hr'))) {
    const paragraph = dom.createElement('p');
    paragraph.setAttribute(STYLE_PLACEHOLDER, 'text-align: center');
    paragraph.textContent = RULE_TEXT;
    rule.replaceWith(paragraph);
  }

  // Only inside tags: text can't contain a raw `<`, so it's never touched.
  return dom.body.innerHTML.replace(/<[^>]+>/g, (tag) =>
    tag.replace(` ${STYLE_PLACEHOLDER}=`, ' style=')
  );
}

/**
 * Wraps each run of `cell`'s inline children (text, links, emphasis, `<br>`)
 * in a `<p>`, which the generator keeps as one paragraph. Whitespace-only runs
 * are left alone, so an empty cell stays empty.
 */
function wrapInlineRuns(cell: Element): void {
  const document = cell.ownerDocument;
  let run: ChildNode[] = [];
  const flush = (before: ChildNode | null): void => {
    const hasContent = run.some(
      (node) =>
        node.nodeType === ELEMENT_NODE ||
        (node.nodeType === TEXT_NODE && node.textContent?.trim())
    );
    if (hasContent) {
      const paragraph = document.createElement('p');
      cell.insertBefore(paragraph, before);
      paragraph.append(...run);
    }
    run = [];
  };
  for (const child of Array.from(cell.childNodes)) {
    const isBlock =
      child.nodeType === ELEMENT_NODE &&
      CELL_BLOCKS.has((child as Element).localName);
    if (isBlock) {
      flush(child);
    } else {
      run.push(child);
    }
  }
  flush(null);
}

/**
 * Replaces `quote` with its children, indenting its paragraphs and headings
 * `depth` steps. Other blocks (lists, code, tables) keep their own layout, and
 * so does a quote in a list item: the generator indents that paragraph for the
 * list already, and a second indent would be invalid or move the bullet.
 */
function unwrapQuote(quote: Element, depth: number): void {
  const inList = quote.closest('li') !== null;
  for (const child of Array.from(quote.children)) {
    if (child.localName === 'blockquote') {
      unwrapQuote(child, depth + 1);
    } else if (QUOTE_PARAGRAPHS.has(child.localName)) {
      const align = 'text-align: left';
      const layout = inList
        ? align
        : `margin-left: ${depth * QUOTE_INDENT_INCHES}in; ${align}`;
      const style = child.getAttribute(STYLE_PLACEHOLDER);
      child.setAttribute(
        STYLE_PLACEHOLDER,
        style ? `${style}; ${layout}` : layout
      );
    }
  }
  quote.replaceWith(...Array.from(quote.childNodes));
}

/**
 * Whether `element` is a made-up tag, like `<your-name>`, that `html` never
 * closes: a placeholder meant to be read, which a browser would hide.
 */
function isUnclosedPlaceholder(element: Element, html: string): boolean {
  const isMadeUp =
    element.localName.includes('-') ||
    Object.prototype.toString.call(element) === '[object HTMLUnknownElement]';
  return isMadeUp && !html.toLowerCase().includes(`</${element.localName}`);
}

/**
 * Each element's start tag as written in the source, so a placeholder shown
 * as text keeps its exact spelling (case, quotes, entities). The DOM only
 * has decoded attribute values, which can't say whether the source wrote
 * `&` or `&amp;`.
 */
class SourceStartTags {
  private readonly ordinals = new Map<Element, number>();
  private readonly counts = new Map<string, number>();
  private readonly tags = new Map<string, string[]>();

  constructor(
    private readonly html: string,
    elements: Element[]
  ) {
    // Document order is source order of start tags, so the nth <x> element
    // is the nth `<x` in the source.
    for (const element of elements) {
      const count = this.counts.get(element.localName) ?? 0;
      this.ordinals.set(element, count);
      this.counts.set(element.localName, count + 1);
    }
  }

  of(element: Element): string {
    const name = element.localName;
    let tags = this.tags.get(name);
    if (!tags) {
      // Quoted values may hold `>`. Each alternative starts with a different
      // character, so this can't backtrack.
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const startTag = new RegExp(
        `<${escaped}(?=[\\s/>])(?:"[^"]*"|'[^']*'|[^'">])*>`,
        'gi'
      );
      tags = this.html.match(startTag) ?? [];
      this.tags.set(name, tags);
    }
    // A mismatch means a `<x` the parser didn't turn into an element (in a
    // comment, say), so the ordinal can't be trusted: rebuild the tag.
    const tag =
      tags.length === this.counts.get(name)
        ? tags[this.ordinals.get(element) ?? -1]
        : undefined;
    return tag ?? rebuiltStartTag(element);
  }
}

/** A start tag for `element` rebuilt from the DOM. */
function rebuiltStartTag(element: Element): string {
  const attributes = Array.from(element.attributes)
    .map(({ name, value }) => (value ? ` ${name}="${value}"` : ` ${name}`))
    .join('');
  return `<${element.localName}${attributes}>`;
}

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
 * replaced by what a browser shows: a span (in the code font, for the ones a
 * browser draws in monospace), emphasis, or quotation marks.
 */
const UNKNOWN_INLINE: Record<string, 'code' | 'em' | 'quote' | 'text'> = {
  kbd: 'code',
  samp: 'code',
  tt: 'code',
  var: 'em',
  cite: 'em',
  dfn: 'em',
  q: 'quote',
  abbr: 'text',
  acronym: 'text',
  bdi: 'text',
  bdo: 'text',
  big: 'text',
  data: 'text',
  font: 'text',
  label: 'text',
  small: 'text',
  time: 'text',
};

/** `Node.TEXT_NODE`, which Node's globals lack. */
const TEXT_NODE = 3;

/** The highlight browsers give `<mark>`; the generator drops it. */
const MARK_COLOR = '#FFFF00';

/**
 * Adjusts the parser's HTML for html-to-docx, which drops or flattens some of
 * what the browser preview renders:
 *
 * - Task list checkboxes: `<input>` is dropped, so done and pending items read
 *   the same. Each becomes a ☒ or ☐ character.
 * - Inline code: `<code>` keeps the body font. Its text is wrapped in a span
 *   naming the code block font, which the generator does carry over.
 * - Table header cells: `<th>` isn't bold, so its content is wrapped in
 *   `<strong>`. Column alignment from GFM's `align` attribute is ignored, but
 *   the same value as a `text-align` style is honored.
 * - Horizontal rules: `<hr>` is dropped, so it becomes a centered RULE_TEXT
 *   paragraph for the structure patch to draw as a rule.
 * - Block quotes: the generator joins everything in a `<blockquote>` into one
 *   justified paragraph. Its paragraphs and headings are kept apart instead,
 *   left aligned and indented one step per level of nesting.
 * - Inline elements it doesn't know (`<kbd>`, `<abbr>`, `<q>`, ...): their
 *   text is dropped, so each is replaced by a span or `<em>` (see
 *   UNKNOWN_INLINE). `<mark>` loses its highlight, so it's set as a shading.
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
  }

  for (const quote of Array.from(dom.querySelectorAll('blockquote'))) {
    // Outermost first; each one unwraps its nested quotes as it goes.
    if (quote.isConnected) unwrapQuote(quote, 1);
  }

  for (const element of Array.from(dom.body.querySelectorAll('*'))) {
    const kind = UNKNOWN_INLINE[element.localName];
    if (!kind || element.closest('pre')) continue;
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

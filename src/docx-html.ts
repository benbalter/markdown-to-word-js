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
 *
 * Only the HTML bound for the .docx changes; the preview keeps the original.
 */
export function prepareHtmlForDocx(html: string): string {
  const dom = new DOMParser().parseFromString(html, 'text/html');

  for (const input of Array.from(dom.querySelectorAll('input[type="checkbox"]'))) {
    const box = input.hasAttribute('checked') ? CHECKBOX.checked : CHECKBOX.unchecked;
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

  for (const rule of Array.from(dom.querySelectorAll('hr'))) {
    const paragraph = dom.createElement('p');
    paragraph.setAttribute(STYLE_PLACEHOLDER, 'text-align: center');
    paragraph.textContent = RULE_TEXT;
    rule.replaceWith(paragraph);
  }

  // Only inside tags: text can't contain a raw `<`, so it's never touched.
  return dom.body.innerHTML.replace(/<[^>]+>/g, (tag) =>
    tag.replace(` ${STYLE_PLACEHOLDER}=`, ' style='),
  );
}

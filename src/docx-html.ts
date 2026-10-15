/**
 * A monospace face that ships with Windows, so Chinese comments stay aligned.
 * Defined here rather than in the code block patch so the main bundle can use
 * it without loading that patch and JSZip.
 */
export const CODE_FONT = 'Courier New';

/** What Word shows in place of a task list checkbox, which it can't render. */
const CHECKBOX = { checked: '☒', unchecked: '☐' };

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
    // Set as a raw attribute: `style.fontFamily` quotes a name with a space,
    // and the generator would take the quote as part of the font name.
    span.setAttribute('style', `font-family: ${CODE_FONT}`);
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

  return dom.body.innerHTML;
}

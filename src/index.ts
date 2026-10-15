// Browser entry for the converter UI (web/components/home/Converter.astro).
// Element ids and data-* attributes are the contract with that component.
// Patterned on word2md.com's src/index.ts (benbalter/word-to-markdown-js), in
// reverse: Markdown in, a .docx out.
import { FONT_PRESETS, isMostlyChinese } from './font-presets.js';

// Markdown is text, so this is generous; it bounds the in-browser render.
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

/** localStorage key for the last chosen style, so regular users pick it once. */
const FONT_PRESET_STORAGE_KEY = 'markdown-to-word:font-preset';

// The converter (html-to-docx, JSZip) is the heavy part of the page, so it's
// loaded on demand: on intent or on the first conversion. Not at idle: it's
// roughly half a megabyte compressed, and many visitors only read the page.
// Each loader memoizes its promise, so a prefetch and a conversion share one.
type ConverterModule = typeof import('./converter.js');
type ParserModule = typeof import('./markdown-parser.js');
let converterModule: Promise<ConverterModule> | undefined;
let parserModule: Promise<ParserModule> | undefined;
const loadConverter = (): Promise<ConverterModule> =>
  (converterModule ??= import('./converter.js'));
const loadParser = (): Promise<ParserModule> =>
  (parserModule ??= import('./markdown-parser.js'));

let lastDocument: Blob | null = null;
let lastFilename = 'document.docx';
let lastPreviewHtml = '';
let lastMarkdown = '';

let downloadLabelDefault = '';
let downloadResetTimer: number | undefined;
let copyLabelDefault = '';
let copyResetTimer: number | undefined;

// Incremented per conversion; a result from a superseded one is discarded.
let activeConversion = 0;

type UIStringKey =
  | 'errorGeneric'
  | 'fileTooLarge'
  | 'notMarkdownFileError'
  | 'docxFileError'
  | 'readError'
  | 'emptyError'
  | 'copyFailed'
  | 'onlyFirstFile'
  | 'conversionAnnouncement'
  | 'converting'
  | 'copied'
  | 'downloaded'
  | 'dismiss';

// Localized UI strings are rendered as data-* attributes on #input, keeping
// this module language-agnostic. Falls back to English when the attribute is
// absent (e.g. in unit tests that mount a bare DOM).
function uiString(key: UIStringKey, fallback: string): string {
  const value = document.getElementById('input')?.dataset[key];
  return value && value.length > 0 ? value : fallback;
}

function byId<T extends HTMLElement = HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

// Speculatively warm the converter chunks so the first conversion resolves
// from cache. Runs at most once, on intent, never on initial paint.
let converterWarmed = false;
function prefetchConverter(): void {
  if (converterWarmed) return;
  converterWarmed = true;
  const ignore = (): void => {};
  loadConverter().catch(ignore);
  loadParser().catch(ignore);
}

function announce(message: string): void {
  const status = byId('sr-status');
  if (status) status.textContent = message;
}

// Restart a one-shot CSS animation keyed to a class (see .is-lit in
// global.css): drop the class, force a reflow, then add it back.
function replayClass(element: Element | null, className: string): void {
  if (!(element instanceof HTMLElement)) return;
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
}

// Flip a confirmable button's label to a transient confirmation, then restore.
function confirmButton(
  buttonId: string,
  labelId: string,
  message: string,
  restore: string,
  timer: number | undefined
): number | undefined {
  const label = byId(labelId);
  if (!label) return timer;
  label.textContent = message;
  announce(message);
  const button = byId(buttonId);
  button?.classList.add('is-confirmed');
  window.clearTimeout(timer);
  return window.setTimeout(() => {
    label.textContent = restore;
    button?.classList.remove('is-confirmed');
  }, 2000);
}

// Show an error alert in whichever region is on screen. `fileName` names the
// file it's about, on its own line above the message.
function showError(message: string, fileName?: string): void {
  let alert = byId('error-alert');
  if (!alert) {
    alert = document.createElement('div');
    alert.id = 'error-alert';
    alert.setAttribute('role', 'alert');
    alert.className =
      'relative mb-4 flex items-start gap-3 rounded-lg border border-danger-rule bg-danger-wash px-4 py-3 text-start text-sm text-danger dark:border-danger-bright/40 dark:bg-danger-bright/10 dark:text-danger-bright';

    const body = document.createElement('div');
    body.className = 'flex-1';
    // <bdi> so a right-to-left filename doesn't reorder the punctuation.
    const fileLine = document.createElement('bdi');
    fileLine.id = 'error-file';
    fileLine.className = 'mb-0.5 block font-mono text-xs font-medium break-all';
    const messageSpan = document.createElement('span');
    messageSpan.id = 'error-message';
    messageSpan.className = 'block';
    body.append(fileLine, messageSpan);

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.setAttribute('aria-label', uiString('dismiss', 'Dismiss'));
    closeButton.className =
      '-m-1 shrink-0 p-1 leading-none text-danger transition-colors hover:text-navy dark:text-danger-bright dark:hover:text-snow';
    closeButton.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';
    const created = alert;
    closeButton.addEventListener('click', () => dismissAlert(created));

    alert.append(body, closeButton);
  }

  const results = byId('results');
  const container =
    results && !results.classList.contains('hidden') ? results : byId('input');
  if (container && alert.parentElement !== container) {
    container.insertBefore(alert, container.firstChild);
  }

  const fileElement = byId('error-file');
  if (fileElement) {
    fileElement.textContent = fileName ?? '';
    fileElement.hidden = !fileName;
  }
  const messageElement = byId('error-message');
  if (messageElement) messageElement.textContent = message;
}

// Remove an alert. If focus was inside it, move focus to the current primary
// control instead of letting it fall back to <body>.
function dismissAlert(alert: HTMLElement): void {
  const hadFocus = alert.contains(document.activeElement);
  alert.remove();
  if (!hadFocus) return;
  const results = byId('results');
  const target =
    results && !results.classList.contains('hidden')
      ? byId('download-button')
      : byId('markdown-input');
  target?.focus();
}

function selectedPreset(): string {
  return byId<HTMLSelectElement>('font-preset')?.value ?? '';
}

// Suggest the Chinese preset when the text is mostly Chinese and no style is
// chosen yet.
function updatePresetHint(): void {
  const text = byId<HTMLTextAreaElement>('markdown-input')?.value ?? '';
  const suggest = selectedPreset() === '' && isMostlyChinese(text);
  byId('font-preset-hint')?.classList.toggle('hidden', !suggest);
}

function updateConvertButton(): void {
  const text = byId<HTMLTextAreaElement>('markdown-input')?.value ?? '';
  const button = byId<HTMLButtonElement>('convert-button');
  if (button) button.disabled = text.trim() === '';
}

function restorePreset(): void {
  const select = byId<HTMLSelectElement>('font-preset');
  if (!select) return;
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(FONT_PRESET_STORAGE_KEY);
  } catch {
    // Storage can be unavailable, e.g. in a private window; keep the default.
  }
  if (saved && saved in FONT_PRESETS) select.value = saved;
}

function rememberPreset(): void {
  try {
    localStorage.setItem(FONT_PRESET_STORAGE_KEY, selectedPreset());
  } catch {
    // Remembering the choice is a convenience; the conversion still uses it.
  }
  updatePresetHint();
}

// A file that's mostly binary isn't Markdown. NUL never appears in text.
function looksBinary(text: string): boolean {
  return text.slice(0, 8192).includes('\u0000');
}

const WORD_FILE = /\.(docx?|dotx?|odt|rtf)$/i;

// Read a chosen or dropped file into the paste box, then convert it, so a
// file is one step, like word2md.com's dropzone.
async function processFile(
  file: File | undefined,
  ignoredFiles = 0
): Promise<void> {
  if (!file) return;
  prefetchConverter();
  const ignoredNote =
    ignoredFiles > 0
      ? uiString(
          'onlyFirstFile',
          'Only the first file was converted. Add the others one at a time.'
        )
      : '';
  const withNote = (message: string): string =>
    ignoredNote ? `${message} ${ignoredNote}` : message;

  if (WORD_FILE.test(file.name)) {
    showError(
      withNote(
        uiString(
          'docxFileError',
          'This is already a Word document. To turn it into Markdown, use word2md.com.'
        )
      ),
      file.name
    );
    return;
  }
  if (file.size > MAX_FILE_SIZE) {
    showError(
      withNote(
        uiString(
          'fileTooLarge',
          'This file is too large to convert in your browser. Please try a Markdown file smaller than 5 MB.'
        )
      ),
      file.name
    );
    return;
  }

  let text: string;
  try {
    text = await file.text();
  } catch {
    showError(
      withNote(
        uiString(
          'readError',
          "That file couldn't be read. Please try choosing it again."
        )
      ),
      file.name
    );
    return;
  }
  if (looksBinary(text)) {
    showError(
      withNote(
        uiString(
          'notMarkdownFileError',
          "This doesn't look like a Markdown or text file, so it can't be converted. Choose a .md file instead."
        )
      ),
      file.name
    );
    return;
  }

  const textarea = byId<HTMLTextAreaElement>('markdown-input');
  if (textarea) textarea.value = text;
  updateConvertButton();
  updatePresetHint();
  await convert(file.name.replace(/\.[^/.]+$/, '') || 'document', ignoredNote);
}

function processFiles(files: ArrayLike<File> | null | undefined): void {
  if (!files || files.length === 0) return;
  void processFile(files[0], files.length - 1);
}

// Convert the paste box's Markdown. `sourceName` (an uploaded file's base
// name) names the download when the Markdown has no H1.
async function convert(sourceName?: string, note = ''): Promise<void> {
  const markdown = byId<HTMLTextAreaElement>('markdown-input')?.value ?? '';
  if (markdown.trim() === '') {
    showError(
      uiString('emptyError', 'Paste some Markdown or choose a .md file first.')
    );
    return;
  }

  const token = ++activeConversion;
  const inputRegion = byId('input');
  const dropzone = byId('dropzone');
  const convertButton = byId<HTMLButtonElement>('convert-button');
  const endBusy = (): void => {
    inputRegion?.removeAttribute('aria-busy');
    dropzone?.classList.remove('is-converting');
    if (convertButton) convertButton.disabled = false;
  };

  byId('error-alert')?.remove();
  inputRegion?.setAttribute('aria-busy', 'true');
  dropzone?.classList.add('is-converting');
  if (convertButton) convertButton.disabled = true;
  announce(uiString('converting', 'Converting…'));

  try {
    const [{ convertMarkdownToWord }, parser] = await Promise.all([
      loadConverter(),
      loadParser(),
    ]);
    const preset = FONT_PRESETS[selectedPreset()];
    const blob = await convertMarkdownToWord(markdown, { fontPreset: preset });
    if (token !== activeConversion) return;
    endBusy();

    const title = parser.extractTitle(markdown);
    const slug = title ? parser.slugify(title) : '';
    lastFilename = `${slug || sourceName || 'document'}.docx`;
    lastDocument = blob;
    lastMarkdown = markdown;
    // Sanitized: a shared .md file can carry raw HTML with script in it.
    lastPreviewHtml = parser.renderPreviewHtml(markdown);

    showResults(markdown, lastPreviewHtml);
    if (note) showError(note);
  } catch {
    // The converter logs the underlying error; the visitor gets the alert.
    if (token !== activeConversion) return;
    endBusy();
    announce('');
    showError(
      uiString(
        'errorGeneric',
        'Something went wrong while converting your Markdown. Please try again.'
      )
    );
  }
}

function showResults(markdown: string, previewHtml: string): void {
  // textContent, not innerText: the <pre> keeps the newlines.
  const source = byId('source');
  if (source) source.textContent = markdown;
  const rendered = byId('rendered');
  if (rendered) {
    rendered.innerHTML = previewHtml;
    // Links in the preview open in a new tab so the result isn't lost.
    for (const link of rendered.querySelectorAll('a[href]')) {
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
    }
    // GFM task-list checkboxes come out unlabelled; name each one after its
    // item so a screen reader says what's checked, not just "checkbox".
    for (const box of rendered.querySelectorAll<HTMLInputElement>(
      'li > input[type="checkbox"]'
    )) {
      const label = taskItemText(box);
      if (label) box.setAttribute('aria-label', label);
    }
  }
  const filename = byId('filename');
  if (filename) filename.textContent = lastFilename;

  byId('input')?.classList.add('hidden');
  const results = byId('results');
  results?.classList.remove('hidden');
  // The page is now about this result: hide How It Works, the promo card, the
  // table, and the FAQ. The results pane carries its own quiet pitch.
  byId('pre-result')?.classList.add('hidden');

  announce(
    uiString(
      'conversionAnnouncement',
      'Conversion complete. Your Word document is ready to download.'
    )
  );
  // Scroll first, then focus without scrolling so the two don't fight. Both
  // are optional-chained because jsdom implements neither.
  const reduceMotion = window.matchMedia?.(
    '(prefers-reduced-motion: reduce)'
  )?.matches;
  results?.scrollIntoView?.({
    behavior: reduceMotion ? 'auto' : 'smooth',
    block: 'start',
  });
  byId('download-button')?.focus({ preventScroll: true });
  replayClass(document.querySelector('#results .md-panel'), 'is-lit');
  replayClass(filename, 'is-lit');
}

// The text of a task-list item, up to any nested list.
function taskItemText(checkbox: Element): string {
  let text = '';
  for (
    let node = checkbox.nextSibling;
    node &&
    !(node instanceof HTMLUListElement || node instanceof HTMLOListElement);
    node = node.nextSibling
  ) {
    text += node.textContent ?? '';
  }
  return text.replace(/\s+/g, ' ').trim();
}

// Save a Blob via a temporary object URL and a synthetic <a download> click.
function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoking synchronously can cancel the download in some browsers.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadDocument(): void {
  if (!lastDocument) return;
  saveBlob(lastDocument, lastFilename);
  downloadResetTimer = confirmButton(
    'download-button',
    'download-label',
    uiString('downloaded', 'Downloaded'),
    downloadLabelDefault,
    downloadResetTimer
  );
}

// Copy the preview as rich text (HTML, with the Markdown as the plain-text
// fallback), which pastes into Word or Google Docs with its formatting. The
// write starts synchronously inside the click handler so browsers that require
// transient user activation, notably Safari, still honor it.
function copyFormatted(): void {
  if (!lastPreviewHtml) return;
  const copyFailed = (): void => {
    showError(
      uiString(
        'copyFailed',
        "Couldn't copy automatically. Select the preview and copy it with Ctrl+C (⌘C on a Mac)."
      )
    );
  };
  if (
    typeof navigator.clipboard?.write !== 'function' ||
    typeof ClipboardItem === 'undefined'
  ) {
    copyFailed();
    return;
  }
  const item = new ClipboardItem({
    'text/html': new Blob([lastPreviewHtml], { type: 'text/html' }),
    'text/plain': new Blob([lastMarkdown], { type: 'text/plain' }),
  });
  navigator.clipboard.write([item]).then(() => {
    copyResetTimer = confirmButton(
      'copy-button',
      'copy-label',
      uiString('copied', 'Copied!'),
      copyLabelDefault,
      copyResetTimer
    );
    // Light up the preview: that's what's on the clipboard now.
    replayClass(document.querySelector('#results .md-panel'), 'is-lit');
  }, copyFailed);
}

// Back to an empty input for the next document, without reloading the page.
function resetConverter(): void {
  activeConversion++;
  const fileInput = byId<HTMLInputElement>('file');
  if (fileInput) fileInput.value = '';
  const textarea = byId<HTMLTextAreaElement>('markdown-input');
  if (textarea) textarea.value = '';
  const rendered = byId('rendered');
  if (rendered) rendered.innerHTML = '';
  lastDocument = null;
  lastPreviewHtml = '';
  lastMarkdown = '';
  lastFilename = 'document.docx';

  byId('error-alert')?.remove();
  byId('results')?.classList.add('hidden');
  byId('input')?.classList.remove('hidden');
  byId('pre-result')?.classList.remove('hidden');
  announce('');
  updateConvertButton();
  updatePresetHint();
  textarea?.focus();
}

function initDragAndDrop(dropzone: HTMLElement): void {
  // A drop anywhere on the page converts, not just on the dropzone: a
  // near-miss, or a second document dropped onto the results. Cancelling the
  // default also stops the browser opening the file and discarding the page.
  window.addEventListener('dragover', (event: DragEvent) => {
    event.preventDefault();
  });
  window.addEventListener('drop', (event: DragEvent) => {
    event.preventDefault();
    if (dropzone.contains(event.target as Node)) return;
    processFiles(event.dataTransfer?.files);
  });

  const activate = (event: DragEvent): void => {
    event.preventDefault();
    dropzone.classList.add('is-dragover');
  };
  dropzone.addEventListener('dragenter', activate);
  dropzone.addEventListener('dragover', activate);
  dropzone.addEventListener('dragleave', (event: DragEvent) => {
    if (!dropzone.contains(event.relatedTarget as Node)) {
      dropzone.classList.remove('is-dragover');
    }
  });
  dropzone.addEventListener('drop', (event: DragEvent) => {
    event.preventDefault();
    dropzone.classList.remove('is-dragover');
    processFiles(event.dataTransfer?.files);
  });
}

function init(): void {
  restorePreset();

  byId<HTMLInputElement>('file')?.addEventListener(
    'change',
    function (this: HTMLInputElement) {
      const file = this.files?.[0];
      // Clear the input so picking the same file again still fires "change".
      this.value = '';
      void processFile(file);
    }
  );

  const textarea = byId<HTMLTextAreaElement>('markdown-input');
  textarea?.addEventListener('input', () => {
    updateConvertButton();
    updatePresetHint();
  });
  // Ctrl/Cmd+Enter converts from the keyboard.
  textarea?.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void convert();
    }
  });
  // Typing or pasting signals an imminent conversion.
  textarea?.addEventListener('focus', prefetchConverter, { once: true });
  updateConvertButton();
  updatePresetHint();

  byId('font-preset')?.addEventListener('change', rememberPreset);
  byId('convert-button')?.addEventListener('click', () => void convert());

  const dropzone = byId('dropzone');
  if (dropzone) {
    initDragAndDrop(dropzone);
    for (const evt of ['pointerenter', 'focusin', 'dragenter']) {
      dropzone.addEventListener(evt, prefetchConverter, {
        once: true,
        passive: true,
      });
    }
  }

  // The output panels are focusable (tabindex) so a click focuses them; scope
  // Ctrl/Cmd+A to the focused panel instead of selecting the whole page.
  for (const panel of document.querySelectorAll<HTMLElement>(
    '[data-select-all]'
  )) {
    panel.addEventListener('keydown', (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() !== 'a' ||
        !(event.ctrlKey || event.metaKey) ||
        event.altKey ||
        event.shiftKey
      ) {
        return;
      }
      event.preventDefault();
      window.getSelection()?.selectAllChildren(panel);
    });
  }

  downloadLabelDefault = byId('download-label')?.textContent ?? '';
  byId('download-button')?.addEventListener('click', downloadDocument);
  copyLabelDefault = byId('copy-label')?.textContent ?? '';
  byId('copy-button')?.addEventListener('click', copyFormatted);
  byId('convert-another')?.addEventListener('click', resetConverter);
}

// Astro bundles this as a module script, which runs after parsing, but the
// unit tests import it before dispatching DOMContentLoaded themselves.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the converter and parser modules before importing. src/index.ts loads
// both with import(), which vi.mock also intercepts.
vi.mock('../src/converter.js', () => ({
  convertMarkdownToWord: vi.fn(),
}));

vi.mock('../src/markdown-parser.js', () => ({
  renderPreviewHtml: vi.fn(),
  extractTitle: vi.fn(),
  slugify: vi.fn(),
}));

import {
  CHINESE_OFFICIAL_DOC_FONTS,
  isMostlyChinese,
} from '../src/font-presets.js';

// vi.resetModules() (per test, so src/index.ts initializes fresh) can hand the
// app a new instance of a mocked module, so each test configures and asserts
// on the instances the app will import, resolved in beforeEach.
type ConverterModule = typeof import('../src/converter.js');
type ParserModule = typeof import('../src/markdown-parser.js');
let mockedConvert: ReturnType<
  typeof vi.mocked<ConverterModule['convertMarkdownToWord']>
>;
let mockedParseHtml: ReturnType<
  typeof vi.mocked<ParserModule['renderPreviewHtml']>
>;
let mockedExtractTitle: ReturnType<
  typeof vi.mocked<ParserModule['extractTitle']>
>;
let mockedSlugify: ReturnType<typeof vi.mocked<ParserModule['slugify']>>;

// The ids and data-* attributes that web/components/home/Converter.astro
// renders, trimmed to what src/index.ts reads.
function setupDOM(): void {
  document.body.innerHTML = `
    <div id="sr-status"></div>
    <div id="input">
      <label id="dropzone" for="file">
        <input type="file" id="file">
      </label>
      <textarea id="markdown-input"></textarea>
      <div id="font-preset-field" class="hidden" data-collapsed>
        <select id="font-preset">
          <option value="">Default</option>
          <option value="chinese-official">Chinese official document</option>
        </select>
      </div>
      <button id="convert-button" disabled>Convert</button>
      <p id="font-preset-hint" class="hidden"></p>
    </div>
    <div id="results" class="hidden">
      <bdi id="filename"></bdi>
      <button id="download-button"><span id="download-label">Download .docx</span></button>
      <button id="copy-button"><span id="copy-label">Copy formatted text</span></button>
      <button id="convert-another">Convert another</button>
      <pre><code id="source"></code></pre>
      <div class="md-panel"><div id="rendered"></div></div>
    </div>
    <div id="pre-result"></div>
  `;
}

const $ = <T extends HTMLElement = HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

const isHidden = (id: string): boolean => $(id).classList.contains('hidden');

async function initApp(): Promise<void> {
  await import('../src/index.js');
}

function typeMarkdown(markdown: string): void {
  const textarea = $<HTMLTextAreaElement>('markdown-input');
  textarea.value = markdown;
  textarea.dispatchEvent(new Event('input'));
}

async function convert(markdown: string): Promise<void> {
  typeMarkdown(markdown);
  $('convert-button').click();
  await vi.waitFor(() => {
    expect(isHidden('results')).toBe(false);
  });
}

// Drops on the dropzone don't bubble: every test re-imports src/index.ts, and
// earlier instances' window-level drop listeners would otherwise handle them
// too. (In the browser the module loads once.)
function dropFiles(target: EventTarget, files: File[]): void {
  const event = new Event('drop', {
    bubbles: target === document.body,
    cancelable: true,
  });
  Object.defineProperty(event, 'dataTransfer', { value: { files } });
  target.dispatchEvent(event);
}

describe('converter UI', () => {
  beforeEach(async () => {
    setupDOM();
    vi.resetModules();
    vi.clearAllMocks();
    localStorage.clear();
    const converter = await import('../src/converter.js');
    const parser = await import('../src/markdown-parser.js');
    mockedConvert = vi.mocked(converter.convertMarkdownToWord);
    mockedParseHtml = vi.mocked(parser.renderPreviewHtml);
    mockedExtractTitle = vi.mocked(parser.extractTitle);
    mockedSlugify = vi.mocked(parser.slugify);
    mockedConvert.mockResolvedValue(
      new Blob(['test'], { type: 'application/octet-stream' })
    );
    mockedParseHtml.mockReturnValue('<p>preview</p>');
    mockedExtractTitle.mockReturnValue(null);
    mockedSlugify.mockReturnValue('');
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('input', () => {
    it('disables Convert until there is Markdown', async () => {
      await initApp();
      expect($<HTMLButtonElement>('convert-button').disabled).toBe(true);
      typeMarkdown('# Hello');
      expect($<HTMLButtonElement>('convert-button').disabled).toBe(false);
      typeMarkdown('   ');
      expect($<HTMLButtonElement>('convert-button').disabled).toBe(true);
    });

    it('converts on Ctrl/Cmd+Enter in the paste box', async () => {
      await initApp();
      typeMarkdown('# Hello');
      $('markdown-input').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', metaKey: true })
      );
      await vi.waitFor(() => {
        expect(mockedConvert).toHaveBeenCalledWith('# Hello', {
          fontPreset: undefined,
        });
      });
    });
  });

  describe('convert', () => {
    it('shows the source, preview, and filename, then hides the pre-result sections', async () => {
      mockedExtractTitle.mockReturnValue('My Doc');
      mockedSlugify.mockReturnValue('my-doc');
      await initApp();
      await convert('# My Doc\n\nHello');

      expect($('source').textContent).toBe('# My Doc\n\nHello');
      expect($('rendered').innerHTML).toBe('<p>preview</p>');
      expect($('filename').textContent).toBe('my-doc.docx');
      expect(isHidden('input')).toBe(true);
      expect(isHidden('pre-result')).toBe(true);
      expect(document.activeElement?.id).toBe('download-button');
      expect($('sr-status').textContent).toMatch(/ready/i);
    });

    it('names task-list checkboxes after their item, not its nested list', async () => {
      mockedParseHtml.mockReturnValue(
        '<ul><li><input checked="" disabled="" type="checkbox"> Ship <strong>it</strong>' +
          '<ul><li><input disabled="" type="checkbox"> Nested</li></ul></li></ul>'
      );
      await initApp();
      await convert('- [x] Ship **it**\n  - [ ] Nested');

      const boxes = $('rendered').querySelectorAll('input[type="checkbox"]');
      expect(boxes[0].getAttribute('aria-label')).toBe('Ship it');
      expect(boxes[1].getAttribute('aria-label')).toBe('Nested');
    });

    it('falls back to document.docx without an H1', async () => {
      await initApp();
      await convert('Just text');
      expect(mockedSlugify).not.toHaveBeenCalled();
      expect($('filename').textContent).toBe('document.docx');
    });

    it('opens preview links in a new tab', async () => {
      mockedParseHtml.mockReturnValue(
        '<p><a href="https://example.com">x</a></p>'
      );
      await initApp();
      await convert('[x](https://example.com)');
      const link = $('rendered').querySelector('a')!;
      expect(link.target).toBe('_blank');
      expect(link.rel).toBe('noopener noreferrer');
    });

    it('keeps in-page links, such as footnotes, in the preview tab', async () => {
      mockedParseHtml.mockReturnValue(
        '<p>x<sup><a id="footnote-ref-1" href="#footnote-1">1</a></sup></p>'
      );
      await initApp();
      await convert('x[^1]\n\n[^1]: y');
      const link = $('rendered').querySelector('a')!;
      expect(link.hasAttribute('target')).toBe(false);
    });

    it('shows a dismissible error when conversion fails', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      mockedConvert.mockRejectedValue(new Error('boom'));
      await initApp();
      typeMarkdown('# Broken');
      $('convert-button').click();

      await vi.waitFor(() => {
        expect($('error-alert')).not.toBeNull();
      });
      expect($('error-message').textContent).toMatch(/went wrong/);
      expect(isHidden('results')).toBe(true);
      expect($<HTMLButtonElement>('convert-button').disabled).toBe(false);

      // The close button works (#89: it used to rely on Bootstrap's JS).
      $('error-alert').querySelector('button')!.click();
      expect($('error-alert')).toBeNull();
    });

    it('clears a previous error on the next conversion', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      mockedConvert.mockRejectedValueOnce(new Error('boom'));
      await initApp();
      typeMarkdown('# Try');
      $('convert-button').click();
      await vi.waitFor(() => {
        expect($('error-alert')).not.toBeNull();
      });

      await convert('# Try again');
      expect($('error-alert')).toBeNull();
    });
  });

  describe('style', () => {
    it('passes the Chinese font preset when it is chosen', async () => {
      await initApp();
      const select = $<HTMLSelectElement>('font-preset');
      select.value = 'chinese-official';
      select.dispatchEvent(new Event('change'));
      await convert('# 通知');

      expect(mockedConvert).toHaveBeenCalledWith('# 通知', {
        fontPreset: CHINESE_OFFICIAL_DOC_FONTS,
      });
    });

    it('remembers the chosen style for the next visit', async () => {
      await initApp();
      const select = $<HTMLSelectElement>('font-preset');
      select.value = 'chinese-official';
      select.dispatchEvent(new Event('change'));

      setupDOM();
      vi.resetModules();
      await initApp();

      expect($<HTMLSelectElement>('font-preset').value).toBe(
        'chinese-official'
      );
    });

    it('ignores a remembered style that no longer exists', async () => {
      localStorage.setItem('markdown-to-word:font-preset', 'retired-preset');
      await initApp();
      expect($<HTMLSelectElement>('font-preset').value).toBe('');
    });

    it('suggests the Chinese preset for Chinese text until a style is chosen', async () => {
      await initApp();
      typeMarkdown(
        '# 关于开展年度工作检查的通知\n\n各单位：现将有关事项通知如下。'
      );
      expect(isHidden('font-preset-hint')).toBe(false);

      const select = $<HTMLSelectElement>('font-preset');
      select.value = 'chinese-official';
      select.dispatchEvent(new Event('change'));
      expect(isHidden('font-preset-hint')).toBe(true);
    });

    it('does not suggest the Chinese preset for English text', async () => {
      await initApp();
      typeMarkdown('# Quarterly report\n\nAll teams met their goals.');
      expect(isHidden('font-preset-hint')).toBe(true);
    });

    it('keeps a collapsed Style menu hidden for English text', async () => {
      await initApp();
      typeMarkdown('# Quarterly report\n\nAll teams met their goals.');
      expect(isHidden('font-preset-field')).toBe(true);
    });

    it('reveals a collapsed Style menu for Chinese text and keeps it', async () => {
      await initApp();
      typeMarkdown(
        '# 关于开展年度工作检查的通知\n\n各单位：现将有关事项通知如下。'
      );
      expect(isHidden('font-preset-field')).toBe(false);

      // Clearing the text doesn't snatch the menu away mid-edit.
      typeMarkdown('');
      expect(isHidden('font-preset-field')).toBe(false);
    });

    it('reveals a collapsed Style menu when a preset was remembered', async () => {
      localStorage.setItem('markdown-to-word:font-preset', 'chinese-official');
      await initApp();
      expect(isHidden('font-preset-field')).toBe(false);
    });
  });

  describe('isMostlyChinese', () => {
    it('counts Chinese prose with some English and digits', () => {
      expect(
        isMostlyChinese('# 年度报告\n\n2026 年 Q3 的收入增长了，详见附件 A。')
      ).toBe(true);
    });

    it('does not count English with a few Chinese words', () => {
      expect(
        isMostlyChinese(
          'The 公文 preset sets 仿宋 for body text and 黑体 for headings.'
        )
      ).toBe(false);
    });

    it('does not count Japanese, which also uses Han characters', () => {
      expect(
        isMostlyChinese('本日の会議では、来年度の予算について議論しました。')
      ).toBe(false);
    });

    it('needs more than a handful of characters', () => {
      expect(isMostlyChinese('通知')).toBe(false);
    });
  });

  describe('files', () => {
    it('reads a chosen file into the paste box and converts it, named after the file', async () => {
      await initApp();
      const input = $<HTMLInputElement>('file');
      const file = new File(['Some notes'], 'notes.md', {
        type: 'text/markdown',
      });
      Object.defineProperty(input, 'files', {
        value: [file],
        configurable: true,
      });
      input.dispatchEvent(new Event('change'));

      await vi.waitFor(() => {
        expect(isHidden('results')).toBe(false);
      });
      expect(mockedConvert).toHaveBeenCalledWith('Some notes', {
        fontPreset: undefined,
      });
      expect($('filename').textContent).toBe('notes.docx');
    });

    it('converts a file dropped anywhere on the page', async () => {
      await initApp();
      dropFiles(document.body, [new File(['# Dropped'], 'dropped.md')]);
      await vi.waitFor(() => {
        expect(mockedConvert).toHaveBeenCalledWith('# Dropped', {
          fontPreset: undefined,
        });
      });
    });

    it('converts only the first of several files, and says so', async () => {
      await initApp();
      dropFiles($('dropzone'), [
        new File(['# One'], 'one.md'),
        new File(['# Two'], 'two.md'),
      ]);
      await vi.waitFor(() => {
        expect(isHidden('results')).toBe(false);
      });
      expect(mockedConvert).toHaveBeenCalledTimes(1);
      expect($('error-message').textContent).toMatch(/Only the first file/);
    });

    it('points Word files to word2md.com instead of converting them', async () => {
      await initApp();
      dropFiles($('dropzone'), [new File(['PK'], 'report.docx')]);
      await vi.waitFor(() => {
        expect($('error-alert')).not.toBeNull();
      });
      expect($('error-message').textContent).toMatch(/word2md\.com/);
      expect($('error-file').textContent).toBe('report.docx');
      expect(mockedConvert).not.toHaveBeenCalled();
    });

    it('rejects binary files', async () => {
      await initApp();
      dropFiles($('dropzone'), [new File(['\u0000\u0001\u0002'], 'image.png')]);
      await vi.waitFor(() => {
        expect($('error-alert')).not.toBeNull();
      });
      expect($('error-message').textContent).toMatch(/Markdown or text file/);
      expect(mockedConvert).not.toHaveBeenCalled();
    });

    it('rejects files over the size limit without reading them', async () => {
      await initApp();
      const big = new File(['x'], 'big.md');
      Object.defineProperty(big, 'size', { value: 6 * 1024 * 1024 });
      dropFiles($('dropzone'), [big]);
      await vi.waitFor(() => {
        expect($('error-alert')).not.toBeNull();
      });
      expect($('error-message').textContent).toMatch(/too large/);
    });
  });

  describe('results', () => {
    it('downloads the .docx under its filename and confirms it', async () => {
      const createObjectURL = vi.fn().mockReturnValue('blob:test');
      globalThis.URL.createObjectURL = createObjectURL;
      globalThis.URL.revokeObjectURL = vi.fn();
      const click = vi
        .spyOn(HTMLAnchorElement.prototype, 'click')
        .mockImplementation(() => {});

      await initApp();
      await convert('Hello');
      $('download-button').click();

      expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
      const anchor = click.mock.contexts[0] as HTMLAnchorElement;
      expect(anchor.download).toBe('document.docx');
      expect($('download-label').textContent).toBe('Downloaded');
    });

    it('copies the preview as rich text with the Markdown as plain text', async () => {
      const write = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        value: { write },
        configurable: true,
      });
      class FakeClipboardItem {
        constructor(public items: Record<string, Blob>) {}
      }
      vi.stubGlobal('ClipboardItem', FakeClipboardItem);

      await initApp();
      await convert('**Hi**');
      $('copy-button').click();

      await vi.waitFor(() => {
        expect($('copy-label').textContent).toBe('Copied!');
      });
      const [item] = write.mock.calls[0][0] as FakeClipboardItem[];
      expect(await item.items['text/html'].text()).toBe('<p>preview</p>');
      expect(await item.items['text/plain'].text()).toBe('**Hi**');
      vi.unstubAllGlobals();
    });

    it('says so when the clipboard is unavailable', async () => {
      Object.defineProperty(navigator, 'clipboard', {
        value: undefined,
        configurable: true,
      });
      await initApp();
      await convert('Hi');
      $('copy-button').click();
      expect($('error-message').textContent).toMatch(/Couldn't copy/);
    });

    it('resets to an empty input for the next document', async () => {
      await initApp();
      await convert('# Done');
      $('convert-another').click();

      expect(isHidden('results')).toBe(true);
      expect(isHidden('input')).toBe(false);
      expect(isHidden('pre-result')).toBe(false);
      expect($<HTMLTextAreaElement>('markdown-input').value).toBe('');
      expect($('rendered').innerHTML).toBe('');
      expect($<HTMLButtonElement>('convert-button').disabled).toBe(true);
      expect(document.activeElement?.id).toBe('markdown-input');
    });
  });
});

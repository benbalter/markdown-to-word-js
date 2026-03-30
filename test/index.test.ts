import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the converter and parser modules before importing
vi.mock('../src/converter.js', () => ({
  convertMarkdownToWord: vi.fn(),
}));

vi.mock('../src/markdown-parser.js', () => ({
  parseMarkdownToHtml: vi.fn(),
  extractTitle: vi.fn(),
  slugify: vi.fn(),
}));

// Mock bootstrap CSS import to avoid errors
vi.mock('bootstrap/dist/css/bootstrap.min.css', () => ({}));

import { convertMarkdownToWord } from '../src/converter.js';
import { parseMarkdownToHtml, extractTitle, slugify } from '../src/markdown-parser.js';

const mockedConvert = vi.mocked(convertMarkdownToWord);
const mockedParseHtml = vi.mocked(parseMarkdownToHtml);
const mockedExtractTitle = vi.mocked(extractTitle);
const mockedSlugify = vi.mocked(slugify);

function setupDOM(): void {
  document.body.innerHTML = `
    <div id="input">
      <input type="file" id="file">
      <textarea id="markdown-input"></textarea>
      <button id="convert-button" disabled>Convert</button>
    </div>
    <div id="results" class="d-none">
      <div id="original-markdown"><code></code></div>
      <div id="markdown-preview"></div>
      <button id="download-button">Download</button>
      <button id="new-conversion-button">New</button>
    </div>
    <div id="loading" class="d-none"></div>
    <div id="error-alert" class="d-none">
      <span id="error-message"></span>
    </div>
  `;
}

/**
 * Dynamically imports the index module to register the DOMContentLoaded listener,
 * then dispatches the event to instantiate the app. Dynamic import is used because
 * vi.resetModules() is called in beforeEach to ensure fresh module state per test.
 */
async function initApp(): Promise<void> {
  await import('../src/index.js');
  document.dispatchEvent(new Event('DOMContentLoaded'));
  await vi.waitFor(() => {
    expect(document.getElementById('convert-button')).not.toBeNull();
  });
}

describe('MarkdownToWordApp', () => {
  beforeEach(() => {
    setupDOM();
    vi.resetModules();
    vi.clearAllMocks();
    mockedConvert.mockResolvedValue(new Blob(['test'], { type: 'application/octet-stream' }));
    mockedParseHtml.mockReturnValue('<p>preview</p>');
    mockedExtractTitle.mockReturnValue(null);
    mockedSlugify.mockReturnValue('');
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('Initialization', () => {
    it('creates app without errors when DOM elements exist', async () => {
      await expect(initApp()).resolves.not.toThrow();
    });
  });

  describe('handleTextInputChange', () => {
    it('convert button is disabled when textarea is empty', async () => {
      await initApp();
      const textarea = document.getElementById('markdown-input') as HTMLTextAreaElement;
      const convertBtn = document.getElementById('convert-button') as HTMLButtonElement;

      textarea.value = '';
      textarea.dispatchEvent(new Event('input'));
      expect(convertBtn.disabled).toBe(true);
    });

    it('convert button is enabled when textarea has content', async () => {
      await initApp();
      const textarea = document.getElementById('markdown-input') as HTMLTextAreaElement;
      const convertBtn = document.getElementById('convert-button') as HTMLButtonElement;

      textarea.value = '# Hello';
      textarea.dispatchEvent(new Event('input'));
      expect(convertBtn.disabled).toBe(false);
    });
  });

  describe('handleConvert', () => {
    it('shows error when no text is entered', async () => {
      await initApp();
      const convertBtn = document.getElementById('convert-button') as HTMLButtonElement;
      const errorAlert = document.getElementById('error-alert') as HTMLElement;

      // Enable the button so click fires (normally disabled when textarea is empty)
      convertBtn.disabled = false;
      convertBtn.click();

      await vi.waitFor(() => {
        expect(errorAlert.classList.contains('d-none')).toBe(false);
      });
    });

    it('calls converter and shows results on success', async () => {
      await initApp();
      const textarea = document.getElementById('markdown-input') as HTMLTextAreaElement;
      const convertBtn = document.getElementById('convert-button') as HTMLButtonElement;
      const resultsSection = document.getElementById('results') as HTMLElement;

      textarea.value = '# Hello World';
      textarea.dispatchEvent(new Event('input'));
      convertBtn.click();

      // Wait for the async conversion to complete
      await vi.waitFor(() => {
        expect(resultsSection.classList.contains('d-none')).toBe(false);
      });

      expect(mockedConvert).toHaveBeenCalledWith('# Hello World');
      expect(mockedParseHtml).toHaveBeenCalledWith('# Hello World');
    });
  });

  describe('handleDownload', () => {
    it('shows error when no document is available', async () => {
      await initApp();
      const downloadBtn = document.getElementById('download-button') as HTMLButtonElement;
      const errorAlert = document.getElementById('error-alert') as HTMLElement;

      downloadBtn.click();
      expect(errorAlert.classList.contains('d-none')).toBe(false);
    });

    it('creates download link when document exists', async () => {
      await initApp();
      const textarea = document.getElementById('markdown-input') as HTMLTextAreaElement;
      const convertBtn = document.getElementById('convert-button') as HTMLButtonElement;
      const downloadBtn = document.getElementById('download-button') as HTMLButtonElement;

      // First convert to generate a document
      textarea.value = '# Test';
      textarea.dispatchEvent(new Event('input'));
      convertBtn.click();

      await vi.waitFor(() => {
        expect(document.getElementById('results')!.classList.contains('d-none')).toBe(false);
      });

      // Mock URL.createObjectURL and revokeObjectURL
      const mockUrl = 'blob:http://localhost/test';
      const createObjectURLSpy = vi.fn().mockReturnValue(mockUrl);
      const revokeObjectURLSpy = vi.fn();
      globalThis.URL.createObjectURL = createObjectURLSpy;
      globalThis.URL.revokeObjectURL = revokeObjectURLSpy;

      // Mock the click on the download anchor
      const clickSpy = vi.fn();
      const origCreateElement = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        const el = origCreateElement(tag);
        if (tag === 'a') {
          el.click = clickSpy;
        }
        return el;
      });

      downloadBtn.click();

      expect(createObjectURLSpy).toHaveBeenCalled();
      expect(clickSpy).toHaveBeenCalled();
      expect(revokeObjectURLSpy).toHaveBeenCalledWith(mockUrl);
    });
  });

  describe('handleNewConversion', () => {
    it('resets form state', async () => {
      await initApp();
      const textarea = document.getElementById('markdown-input') as HTMLTextAreaElement;
      const convertBtn = document.getElementById('convert-button') as HTMLButtonElement;
      const newConversionBtn = document.getElementById('new-conversion-button') as HTMLButtonElement;
      const inputSection = document.getElementById('input') as HTMLElement;
      const resultsSection = document.getElementById('results') as HTMLElement;

      // First do a conversion
      textarea.value = '# Test';
      textarea.dispatchEvent(new Event('input'));
      convertBtn.click();

      await vi.waitFor(() => {
        expect(resultsSection.classList.contains('d-none')).toBe(false);
      });

      // Click new conversion
      newConversionBtn.click();

      expect(textarea.value).toBe('');
      expect(inputSection.classList.contains('d-none')).toBe(false);
      expect(resultsSection.classList.contains('d-none')).toBe(true);
    });
  });

  describe('showError / hideError', () => {
    it('error alert becomes visible when error is shown', async () => {
      await initApp();
      const convertBtn = document.getElementById('convert-button') as HTMLButtonElement;
      const errorAlert = document.getElementById('error-alert') as HTMLElement;

      // Enable button so click fires (normally disabled when textarea is empty)
      convertBtn.disabled = false;
      convertBtn.click();

      await vi.waitFor(() => {
        expect(errorAlert.classList.contains('d-none')).toBe(false);
      });
      const errorMessage = document.getElementById('error-message') as HTMLElement;
      expect(errorMessage.textContent).toBeTruthy();
    });

    it('error alert is hidden after new conversion', async () => {
      await initApp();
      const convertBtn = document.getElementById('convert-button') as HTMLButtonElement;
      const newConversionBtn = document.getElementById('new-conversion-button') as HTMLButtonElement;
      const errorAlert = document.getElementById('error-alert') as HTMLElement;

      // Enable button so click fires, then show error
      convertBtn.disabled = false;
      convertBtn.click();
      await vi.waitFor(() => {
        expect(errorAlert.classList.contains('d-none')).toBe(false);
      });

      // Hide error via new conversion
      newConversionBtn.click();
      expect(errorAlert.classList.contains('d-none')).toBe(true);
    });
  });

  describe('showLoading / hideLoading', () => {
    it('loading section visibility toggles during conversion', async () => {
      await initApp();
      const textarea = document.getElementById('markdown-input') as HTMLTextAreaElement;
      const convertBtn = document.getElementById('convert-button') as HTMLButtonElement;
      const loadingSection = document.getElementById('loading') as HTMLElement;

      let resolveConvert: (blob: Blob) => void = () => {};
      mockedConvert.mockImplementation(() => {
        return new Promise<Blob>((resolve) => {
          resolveConvert = resolve;
        });
      });

      textarea.value = '# Loading test';
      textarea.dispatchEvent(new Event('input'));
      convertBtn.click();

      // Loading should be visible while converting
      await vi.waitFor(() => {
        expect(loadingSection.classList.contains('d-none')).toBe(false);
      });

      // Resolve the conversion
      resolveConvert(new Blob(['test']));

      // Loading should be hidden after conversion completes
      await vi.waitFor(() => {
        expect(loadingSection.classList.contains('d-none')).toBe(true);
      });
    });
  });

  describe('handleFileUpload', () => {
    it('reads file and populates textarea', async () => {
      await initApp();
      const fileInput = document.getElementById('file') as HTMLInputElement;
      const textarea = document.getElementById('markdown-input') as HTMLTextAreaElement;
      const convertBtn = document.getElementById('convert-button') as HTMLButtonElement;

      const fileContent = '# From File';
      const file = new File([fileContent], 'test.md', { type: 'text/markdown' });

      // Set file on the input
      Object.defineProperty(fileInput, 'files', {
        value: [file],
        writable: true,
      });

      fileInput.dispatchEvent(new Event('change'));

      // Wait for FileReader to complete
      await vi.waitFor(() => {
        expect(textarea.value).toBe(fileContent);
      });

      expect(convertBtn.disabled).toBe(false);
    });
  });

  describe('Drag and drop setup', () => {
    it('drag/drop event handlers are registered on the drop zone', async () => {
      await initApp();
      const fileInput = document.getElementById('file') as HTMLInputElement;
      const dropZone = fileInput.parentElement!;

      // Verify dragover is handled (default prevented)
      const dragOverEvent = new Event('dragover', { bubbles: true, cancelable: true });
      dropZone.dispatchEvent(dragOverEvent);
      expect(dragOverEvent.defaultPrevented).toBe(true);

      // Verify dragenter is handled
      const dragEnterEvent = new Event('dragenter', { bubbles: true, cancelable: true });
      dropZone.dispatchEvent(dragEnterEvent);
      expect(dragEnterEvent.defaultPrevented).toBe(true);
    });
  });

  describe('Filename from H1 title', () => {
    it('uses slugified H1 title as download filename', async () => {
      await initApp();
      const textarea = document.getElementById('markdown-input') as HTMLTextAreaElement;
      const convertBtn = document.getElementById('convert-button') as HTMLButtonElement;

      mockedExtractTitle.mockReturnValue('My Document Title');
      mockedSlugify.mockReturnValue('my-document-title');

      textarea.value = '# My Document Title\n\nContent';
      textarea.dispatchEvent(new Event('input'));
      convertBtn.click();

      await vi.waitFor(() => {
        expect(document.getElementById('results')!.classList.contains('d-none')).toBe(false);
      });

      expect(mockedExtractTitle).toHaveBeenCalledWith('# My Document Title\n\nContent');
      expect(mockedSlugify).toHaveBeenCalledWith('My Document Title');
    });

    it('does not call slugify when no H1 exists', async () => {
      await initApp();
      const textarea = document.getElementById('markdown-input') as HTMLTextAreaElement;
      const convertBtn = document.getElementById('convert-button') as HTMLButtonElement;

      mockedExtractTitle.mockReturnValue(null);

      textarea.value = 'No heading content';
      textarea.dispatchEvent(new Event('input'));
      convertBtn.click();

      await vi.waitFor(() => {
        expect(document.getElementById('results')!.classList.contains('d-none')).toBe(false);
      });

      expect(mockedExtractTitle).toHaveBeenCalledWith('No heading content');
      expect(mockedSlugify).not.toHaveBeenCalled();
    });
  });
});

import { convertMarkdownToWord } from './converter.js';
import { parseMarkdownToHtml } from './markdown-parser.js';
import 'bootstrap/dist/css/bootstrap.min.css';

class MarkdownToWordApp {
  private fileInput!: HTMLInputElement;
  private textInput!: HTMLTextAreaElement;
  private convertButton!: HTMLButtonElement;
  private downloadButton!: HTMLButtonElement;
  private newConversionButton!: HTMLButtonElement;
  private inputSection!: HTMLElement;
  private resultsSection!: HTMLElement;
  private loadingSection!: HTMLElement;
  private errorAlert!: HTMLElement;
  private originalMarkdown!: HTMLElement;
  private markdownPreview!: HTMLElement;
  
  private currentWordDoc: Blob | null = null;
  private currentFilename: string = 'document.docx';

  constructor() {
    this.initializeElements();
    this.attachEventListeners();
  }

  private initializeElements(): void {
    this.fileInput = document.getElementById('file') as HTMLInputElement;
    this.textInput = document.getElementById('markdown-input') as HTMLTextAreaElement;
    this.convertButton = document.getElementById('convert-button') as HTMLButtonElement;
    this.downloadButton = document.getElementById('download-button') as HTMLButtonElement;
    this.newConversionButton = document.getElementById('new-conversion-button') as HTMLButtonElement;
    this.inputSection = document.getElementById('input') as HTMLElement;
    this.resultsSection = document.getElementById('results') as HTMLElement;
    this.loadingSection = document.getElementById('loading') as HTMLElement;
    this.errorAlert = document.getElementById('error-alert') as HTMLElement;
    this.originalMarkdown = document.getElementById('original-markdown') as HTMLElement;
    this.markdownPreview = document.getElementById('markdown-preview') as HTMLElement;
  }

  private attachEventListeners(): void {
    // File upload
    this.fileInput.addEventListener('change', this.handleFileUpload.bind(this));
    
    // Convert button
    this.convertButton.addEventListener('click', this.handleConvert.bind(this));
    
    // Download button
    this.downloadButton.addEventListener('click', this.handleDownload.bind(this));
    
    // New conversion button
    this.newConversionButton.addEventListener('click', this.handleNewConversion.bind(this));
    
    // Real-time preview for text input
    this.textInput.addEventListener('input', this.handleTextInputChange.bind(this));
    
    // Drag and drop for file input
    this.setupDragAndDrop();
  }

  private setupDragAndDrop(): void {
    const dropZone = this.fileInput.parentElement;
    if (!dropZone) return;

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
      dropZone.addEventListener(eventName, this.preventDefaults, false);
    });

    ['dragenter', 'dragover'].forEach(eventName => {
      dropZone.addEventListener(eventName, () => dropZone.classList.add('drag-over'), false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropZone.addEventListener(eventName, () => dropZone.classList.remove('drag-over'), false);
    });

    dropZone.addEventListener('drop', this.handleDrop.bind(this), false);
  }

  private preventDefaults(e: Event): void {
    e.preventDefault();
    e.stopPropagation();
  }

  private handleDrop(e: DragEvent): void {
    const dt = e.dataTransfer;
    const files = dt?.files;
    
    if (files && files.length > 0) {
      this.fileInput.files = files;
      this.handleFileUpload();
    }
  }

  private async handleFileUpload(): Promise<void> {
    const file = this.fileInput.files?.[0];
    if (!file) return;

    try {
      const text = await this.readFileAsText(file);
      this.textInput.value = text;
      this.currentFilename = file.name.replace(/\.[^/.]+$/, '.docx');
      this.handleTextInputChange();
    } catch {
      this.showError('Failed to read the selected file. Please try again.');
    }
  }

  private readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }

  private handleTextInputChange(): void {
    const markdown = this.textInput.value.trim();
    
    if (markdown) {
      this.convertButton.disabled = false;
      // Optional: Show live preview if needed
      // this.updatePreview(markdown);
    } else {
      this.convertButton.disabled = true;
    }
  }

  private async handleConvert(): Promise<void> {
    const markdown = this.textInput.value.trim();
    
    if (!markdown) {
      this.showError('Please enter some markdown text or upload a file.');
      return;
    }

    this.showLoading();
    this.hideError();

    try {
      // Generate Word document
      const wordDoc = await convertMarkdownToWord(markdown);
      this.currentWordDoc = wordDoc;
      
      // Generate HTML preview
      const htmlPreview = parseMarkdownToHtml(markdown);
      
      // Show results
      this.showResults(markdown, htmlPreview);
      
    } catch (error) {
      console.error('Conversion error:', error);
      this.showError('Failed to convert markdown to Word. Please check your markdown syntax and try again.');
    } finally {
      this.hideLoading();
    }
  }

  private handleDownload(): void {
    if (!this.currentWordDoc) {
      this.showError('No document available for download. Please convert your markdown first.');
      return;
    }

    // Create download link
    const url = URL.createObjectURL(this.currentWordDoc);
    const a = document.createElement('a');
    a.href = url;
    a.download = this.currentFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  private handleNewConversion(): void {
    // Reset form
    this.fileInput.value = '';
    this.textInput.value = '';
    this.currentWordDoc = null;
    this.currentFilename = 'document.docx';
    
    // Show input section, hide results
    this.inputSection.classList.remove('d-none');
    this.resultsSection.classList.add('d-none');
    this.hideError();
    
    // Focus on text input
    this.textInput.focus();
  }

  private showResults(markdown: string, htmlPreview: string): void {
    // Update display elements
    this.originalMarkdown.querySelector('code')!.textContent = markdown;
    this.markdownPreview.innerHTML = htmlPreview;
    
    // Show results section, hide input section
    this.inputSection.classList.add('d-none');
    this.resultsSection.classList.remove('d-none');
  }

  private showLoading(): void {
    this.loadingSection.classList.remove('d-none');
    this.convertButton.disabled = true;
  }

  private hideLoading(): void {
    this.loadingSection.classList.add('d-none');
    this.convertButton.disabled = false;
  }

  private showError(message: string): void {
    const errorMessage = document.getElementById('error-message') as HTMLElement;
    errorMessage.textContent = message;
    this.errorAlert.classList.remove('d-none');
  }

  private hideError(): void {
    this.errorAlert.classList.add('d-none');
  }
}

// Initialize the app when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new MarkdownToWordApp();

  // Listen for OS color scheme changes and update Bootstrap theme
  if (typeof window.matchMedia === 'function') {
    window
      .matchMedia('(prefers-color-scheme: dark)')
      .addEventListener('change', (e) => {
        document.documentElement.setAttribute(
          'data-bs-theme',
          e.matches ? 'dark' : 'light',
        );
      });
  }
});
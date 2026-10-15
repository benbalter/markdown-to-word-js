// Shape of the user-facing string set. Every locale module implements this
// interface, so adding a key to `en` forces every other locale to supply it —
// the type checker is the completeness guard for translations.

interface FaqEntry {
  q: string;
  a: string;
}

interface Step {
  /** Short title, e.g. "Drop". */
  t: string;
  /** One-line description. */
  d: string;
}

export interface UIStrings {
  // Hero
  eyebrow: string;
  /** Plain-language tagline under the wordmark. `.docx` is wrapped in <code>. */
  tagline: string;
  /**
   * Lineage line under the hero: the tool dates to the markdown_to_word Ruby
   * gem (2015). The "2015" year is a literal, not translated.
   */
  trustBadge: string;

  // Visual flow (alt text for the .md → .docx glyph row)
  flowFromAlt: string;
  flowToAlt: string;

  // Converter input
  dropzoneTitle: string;
  /**
   * Dropzone title on touch screens, where there's nothing to drag. Also the
   * file input's accessible name on every device.
   */
  dropzoneTitleTouch: string;
  dropzoneBrowsePrefix: string; // "or "
  dropzoneBrowseLink: string; // "click to choose a file"
  /** Line inside the dropzone: size limit + "never uploaded" reassurance. */
  dropzoneNote: string;
  /** Divider between the dropzone and the paste box. */
  orFile: string;
  pastePlaceholder: string;
  /** Label for the document style (font preset) menu. */
  styleLabel: string;
  styleDefault: string;
  /** The 公文 preset. Keep "公文" literal so Chinese readers recognize it. */
  styleChineseOfficial: string;
  /** Shown when the text is mostly Chinese and no style is chosen. */
  styleChineseHint: string;
  convertButton: string;
  convertSectionAria: string;

  // Results
  convertedLabel: string;
  downloadButton: string;
  /** Transient confirmation shown on the download button after a download. */
  downloadedButton: string;
  /** Copies the rendered document as rich text, for pasting into Word or Google Docs. */
  copyButton: string;
  /** Transient confirmation shown on the copy button after a successful copy. */
  copiedButton: string;
  /** Resets the converter to accept another document. */
  convertAnother: string;
  panelMarkdown: string;
  panelPreview: string;

  // How it works — exactly three steps are expected (paired with the step icons
  // in HowItWorks.astro by index).
  steps: Step[];

  // "What gets converted" reference table. The Markdown column is universal
  // syntax, kept literal in ConversionTable.astro and paired with these rows
  // (the Word result) by index, so both arrays must stay the same length.
  conversionHeading: string;
  conversionColInput: string;
  conversionColOutput: string;
  conversionRows: string[];

  // "Going the other way?" cross-link to word2md.com
  reverseHeading: string;
  reverseBody: string;
  reverseCta: string;

  // FAQ
  faqHeading: string;
  faqs: FaqEntry[];

  // Footer
  footer: {
    feedback: string;
    source: string;
    /** Footer link to the sibling converter, word2md.com. */
    wordToMarkdown: string;
    donate: string;
    terms: string;
    privacy: string;
    /** Accessible name for the footer's language-switcher <nav>. */
    languagesLabel: string;
    /** Accessible name for the footer's site-links <nav>. */
    linksLabel: string;
  };
  footerTagline: string;

  // <head> / SEO
  metaTitle: string;
  metaDescription: string;
  schemaDescription: string;
  schemaFeatureList: string[];

  // Converter runtime (injected into the DOM as data-* and read by src/index.ts)
  errorGeneric: string;
  /** Shown when a chosen file exceeds the in-browser size limit. */
  fileTooLargeError: string;
  /** A file that isn't text at all (e.g. a .docx or a PDF). */
  notMarkdownFileError: string;
  /** A Word file was dropped here; point to word2md.com, which goes that way. */
  docxFileError: string;
  /** The browser couldn't read the chosen file. */
  readError: string;
  /** Convert was pressed with nothing to convert. */
  emptyError: string;
  /** Shown when the copy button can't write to the clipboard. */
  copyFailed: string;
  /** Noted with the result when several files are dropped at once. */
  onlyFirstFile: string;
  /** Announced to assistive tech (aria-live) when a conversion succeeds. */
  conversionAnnouncement: string;
  /** Announced to assistive tech while a conversion is in progress. */
  convertingStatus: string;
  dismiss: string;
  /**
   * "Also available in <this language>", shown IN this language on the English
   * root when the Worker suggests this locale (see LanguageSuggestion.astro).
   */
  suggestLanguage: string;

  // Open & Async promo. `label`/`body`/`cta` are the standalone card
  // (Promo.astro); `resultsLead`/`resultsCta` are the lighter, contextual
  // pitch shown in the post-conversion results pane (Converter.astro). The
  // book title "Open & Async" stays literal. `body` contains a literal
  // <strong> wrapping the title and is rendered with set:html.
  promo: {
    label: string;
    body: string;
    cta: string;
    coverAlt: string;
    resultsLead: string;
    resultsCta: string;
  };
}

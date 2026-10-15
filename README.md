# Markdown to Word

[![CI](https://github.com/benbalter/markdown-to-word-js/actions/workflows/ci.yml/badge.svg)](https://github.com/benbalter/markdown-to-word-js/actions/workflows/ci.yml)

Convert GitHub Flavored Markdown to a formatted Word (`.docx`) document, entirely in your browser, at **[md2word.app](https://md2word.app)**. Nothing is uploaded.

It's the mirror image of [word2md.com](https://word2md.com) ([word-to-markdown-js](https://github.com/benbalter/word-to-markdown-js)), which goes the other way, and the successor to [markdown_to_word](https://github.com/benbalter/markdown_to_word), the original Ruby gem and web demo, first published in 2015 and now archived.

## Usage

1. Go to [md2word.app](https://md2word.app).
2. Drop a `.md` file anywhere on the page, choose one, or paste Markdown. AI chat responses (ChatGPT, Claude, and others) are Markdown, so they paste in as-is.
3. A dropped file converts right away. For pasted text, click **Convert to Word**, or press Ctrl/⌘+Enter.
4. Click **Download .docx**, or **Copy formatted text** to paste straight into Word or Google Docs with the formatting intact.

The document is named after its first heading, which also becomes its title.

## What converts

| Markdown                                    | In Word                                                                                               |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `#` to `######` headings                    | Heading 1–6 styles                                                                                    |
| `**bold**`, `*italic*`, `~~strikethrough~~` | The same formatting                                                                                   |
| Bulleted and numbered lists, nested         | Word lists                                                                                            |
| `- [x]` task lists                          | ☒ (done) and ☐ (to do) items, since Word can't show checkboxes from HTML                              |
| Tables                                      | Thin borders, a bold header row that repeats on each page, and the column alignment from the Markdown |
| `[links](https://example.com)`              | Clickable hyperlinks                                                                                  |
| `` `inline code` `` and fenced code blocks  | Monospace; code blocks keep their line breaks                                                         |
| `> block quotes`                            | Indented paragraphs                                                                                   |
| `---` horizontal rules                      | A line across the page                                                                                |
| `![images](https://example.com/a.png)`      | Embedded, when the browser can fetch them (see [Limitations](#limitations))                           |

As on GitHub, a single newline inside a paragraph is joined into the same line, so hard-wrapped files convert to normal paragraphs. End a line with two spaces or a backslash to force a line break.

## Optional Font Presets

Conversions use Word's standard styling by default. Choosing **Chinese official document (公文)** from the **Style** menu rewrites the generated document so each level gets an East Asian face and a 公文 size alongside Times New Roman:

| Level       | Font size   | Chinese characters | Latin letters and digits |
| ----------- | ----------- | ------------------ | ------------------------ |
| Body        | 三号 (16pt) | 仿宋               | Times New Roman          |
| Heading 1   | 二号 (22pt) | 方正小标宋简体     | Times New Roman          |
| Heading 2   | 三号 (16pt) | 黑体               | Times New Roman          |
| Heading 3   | 三号 (16pt) | 楷体               | Times New Roman          |
| Heading 4-6 | 三号 (16pt) | 仿宋 (bold)        | Times New Roman          |

The app remembers your choice in this browser, and suggests the preset when the text you paste is mostly Chinese.

Word resolves a typeface per character class, so English words and numbers inside a Chinese sentence stay in Times New Roman. The fonts must be installed on the machine that opens the document.

Every level also drops to 段前段后 0 行. The preset also pins 单倍行距 (`w:lineRule="auto"`) on the body and heading styles rather than relying on the converter default of 最小值 12 磅.

The preset covers fonts, sizes and spacing only. It doesn't yet set A4 paper, the GB/T 9704-2012 margins or the 22-line page, so documents are 公文-styled rather than compliant; see [#106](https://github.com/benbalter/markdown-to-word-js/issues/106).

Programmatically:

```ts
import { convertMarkdownToWord, CHINESE_OFFICIAL_DOC_FONTS } from 'markdown-to-word';

const blob = await convertMarkdownToWord(markdown, {
  fontPreset: CHINESE_OFFICIAL_DOC_FONTS,
});
```

## Privacy

Conversion happens entirely in your browser: your Markdown and the Word document never leave your device. Images your Markdown links to load from the sites that host them, like on any web page. md2word.app uses cookie-free Cloudflare Web Analytics; a local or self-hosted copy has no analytics. Raw HTML in the preview is sanitized, so a shared file can't run script. See the [privacy policy](https://md2word.app/privacy/).

## Limitations

- Images are embedded only when the browser can fetch them: `data:` URIs, and web URLs whose server allows cross-origin requests (most image hosts and CDNs do). Other images, images under 1 KB (html-to-docx's minimum), and local file paths are left out.
- Complex raw HTML inside Markdown may not convert cleanly, and advanced Word features (comments, tracked changes, page layout) aren't produced.
- Very large documents can be slow, since everything runs in the browser. Files are limited to 5 MB.
- The site works in current versions of Chrome, Edge, Firefox, and Safari. The end-to-end tests run in Chrome.

## Use it from code

The converter is also on npm as [`markdown-to-word`](https://www.npmjs.com/package/markdown-to-word), for Node 22.12+ and for browsers through a bundler (Vite, webpack, esbuild):

```bash
npm install markdown-to-word
```

`convertMarkdownToWord` returns the `.docx` as a `Blob`:

```ts
import { writeFile } from 'node:fs/promises';
import { convertMarkdownToWord } from 'markdown-to-word';

const blob = await convertMarkdownToWord('# Hello\n\nFrom **Markdown**.', {
  pageMargins: { top: 1, right: 1, bottom: 1, left: 1 }, // inches
});
await writeFile('hello.docx', Buffer.from(await blob.arrayBuffer()));
```

In a browser, hand the `Blob` to a download link with `URL.createObjectURL(blob)`.

The converter needs the DOM's `DOMParser` and `XMLSerializer`. Browsers have them; in Node, the package fills them in from [jsdom](https://github.com/jsdom/jsdom) when they're missing, so there's nothing to set up.

The package also exports `parseMarkdownToHtml`, `extractTitle`, the `FONT_PRESETS` (see [Optional Font Presets](#optional-font-presets)), and their TypeScript types.

## Development

Requires Node.js 22.12 or later (`.nvmrc` pins the version CI uses).

```bash
git clone https://github.com/benbalter/markdown-to-word-js.git
cd markdown-to-word-js
npm install
npm run dev        # http://localhost:4321
npm run build      # static site in dist/
npm test           # unit tests; npm run test:e2e for Playwright
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the project layout and checks.

- **Site:** [Astro](https://astro.build) with [Tailwind CSS](https://tailwindcss.com), sharing word2md.com's design system.
- **Conversion:** [marked](https://marked.js.org/) turns Markdown into HTML, [@turbodocx/html-to-docx](https://github.com/TurboDocx/html-to-docx) builds the `.docx`, and JSZip patches fix up code blocks, rules, table headers, and font presets.
- **Translations:** the UI is ready for more languages; see [web/i18n/README.md](web/i18n/README.md).
- **Hosting:** Cloudflare Workers Static Assets. A push to `main` builds, runs the tests, and deploys; see [docs/cloudflare.md](docs/cloudflare.md).

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md), and [open an issue](https://github.com/benbalter/markdown-to-word-js/issues) for bugs and feature requests.

## License

MIT. See [LICENSE](LICENSE).

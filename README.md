# Markdown to Word Converter

Convert GitHub Flavored Markdown to Word documents directly in your browser at **[md2word.app](https://md2word.app)**. No uploads required: everything happens client-side.

It's the mirror image of [word2md.com](https://word2md.com) ([word-to-markdown-js](https://github.com/benbalter/word-to-markdown-js)), which goes the other way.

## Features

- **GitHub Flavored Markdown Support**: Tables, task lists, strikethrough, and more
- **Client-Side Processing**: No data sent to servers - complete privacy
- **Drag & Drop**: Drop a `.md` file anywhere on the page, choose one, or paste Markdown
- **Preview**: See the rendered document next to its Markdown after converting
- **Copy Formatted Text**: Paste the result straight into Word or Google Docs, formatting included
- **Optional Chinese Font Preset**: Opt-in 公文 fonts (仿宋 / 方正小标宋 / 黑体 / 楷体) with Times New Roman for Latin text

## Supported Markdown Features

- ✅ Headers (H1-H6)
- ✅ Text formatting (bold, italic, strikethrough)
- ✅ Links and images
- ✅ Lists (ordered and unordered)
- ✅ Task lists with checkboxes
- ✅ Tables with headers
- ✅ Code blocks and inline code
- ✅ Blockquotes
- ✅ Horizontal rules
- ✅ Line breaks and paragraphs

## Optional Font Presets

Conversions use Word's standard styling by default. Choosing **Chinese official document (公文)** from the **Style** menu rewrites the generated document so each level gets an East Asian face and a 公文 size alongside Times New Roman:

| Level | Font size | Chinese characters | Latin letters and digits |
| --- | --- | --- | --- |
| Body | 三号 (16pt) | 仿宋 | Times New Roman |
| Heading 1 | 二号 (22pt) | 方正小标宋简体 | Times New Roman |
| Heading 2 | 三号 (16pt) | 黑体 | Times New Roman |
| Heading 3 | 三号 (16pt) | 楷体 | Times New Roman |
| Heading 4-6 | 三号 (16pt) | 仿宋 (bold) | Times New Roman |

The app remembers your choice in this browser, and suggests the preset when the text you paste is mostly Chinese.

Word resolves a typeface per character class, so English words and numbers inside a Chinese sentence stay in Times New Roman. The fonts must be installed on the machine that opens the document.

Every level also drops to 段前段后 0 行. The preset also pins 单倍行距 (`w:lineRule="auto"`) on the body and heading styles rather than relying on the converter default of 最小值 12 磅.

The preset covers fonts, sizes and spacing only. It doesn't yet set A4 paper, the GB/T 9704-2012 margins or the 22-line page, so documents are 公文-styled rather than compliant; see [#106](https://github.com/benbalter/markdown-to-word-js/issues/106).

Programmatically:

```ts
import { convertMarkdownToWord } from './src/converter.js';
import { CHINESE_OFFICIAL_DOC_FONTS } from './src/font-presets.js';

const blob = await convertMarkdownToWord(markdown, {
  fontPreset: CHINESE_OFFICIAL_DOC_FONTS,
});
```

## Usage

1. **Visit the app**: Go to [md2word.app](https://md2word.app)
2. **Add your content**: Drop or choose a `.md` file, or paste your Markdown
3. **Convert**: A dropped file converts right away; for pasted text, click "Convert to Word" (or press Ctrl/⌘+Enter)
4. **Download**: Click "Download .docx", or "Copy formatted text" to paste into Word or Google Docs

## Development

Requires Node.js 22.12 or later (`.nvmrc` pins the version CI uses).

```bash
git clone https://github.com/benbalter/markdown-to-word-js.git
cd markdown-to-word-js
npm install
npm run dev        # http://localhost:4321
npm run build      # static site in dist/
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the project layout and checks.

## Technology Stack

- **Site**: [Astro](https://astro.build) (static output) with [Tailwind CSS](https://tailwindcss.com), hosted on Cloudflare Workers Static Assets ([docs/cloudflare.md](docs/cloudflare.md))
- **Language**: TypeScript
- **Markdown Parser**: [marked](https://marked.js.org/) with GFM support
- **Word Generation**: [@turbodocx/html-to-docx](https://github.com/TurboDocx/html-to-docx), with JSZip patches for code blocks and font presets
- **Tests**: Vitest (unit, including .docx round-trips through mammoth) and Playwright (end to end)

## Browser Compatibility

- Chrome 80+
- Firefox 75+
- Safari 13+
- Edge 80+

## Privacy & Security

This tool runs entirely in your browser. No markdown content or generated documents are sent to any server. All processing happens locally on your device.

## Limitations

- Large documents may impact browser performance
- Complex HTML within markdown may not convert perfectly
- Some advanced Word features are not supported
- Images are embedded when the browser can fetch them: `data:` URIs, and web URLs whose server allows cross-origin requests (most image hosts and CDNs do). Other images, and local file paths, are left out
- Fenced code blocks are monospace with real line breaks, and inline code is monospace too
- Word can't show checkboxes from HTML, so task list items start with ☒ (done) or ☐ (to do)
- Tables get thin borders, a bold header row that repeats on each page, and the column alignment from the Markdown
- Horizontal rules become a line across the page
- As on GitHub, a single newline inside a paragraph is joined into the same line, so hard-wrapped files convert to normal paragraphs. End a line with two spaces or a backslash to force a line break
- Raw HTML in the preview is sanitized, so scripts and event handlers in a shared file don't run

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT License - see [LICENSE](LICENSE) for details.

## Related Projects

- [Word to Markdown](https://word2md.com) ([source](https://github.com/benbalter/word-to-markdown-js)) - Convert Word documents to Markdown (the reverse of this tool)

## Support

- 🐛 [Report Issues](https://github.com/benbalter/markdown-to-word-js/issues)
- 💡 [Request Features](https://github.com/benbalter/markdown-to-word-js/issues)
- 💬 [Discussions](https://github.com/benbalter/markdown-to-word-js/discussions)
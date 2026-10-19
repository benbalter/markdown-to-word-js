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

| Markdown                                          | In Word                                                                                                                  |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `#` to `######` headings                          | Heading 1–6 styles                                                                                                       |
| `**bold**`, `*italic*`, `~~strikethrough~~`       | The same formatting                                                                                                      |
| Bulleted and numbered lists, nested               | Word lists                                                                                                               |
| `- [x]` task lists                                | ☒ (done) and ☐ (to do) items, since Word can't show checkboxes from HTML                                                 |
| Tables                                            | Thin borders, a bold header row that repeats on each page, and the column alignment from the Markdown                    |
| `[links](https://example.com)`                    | Clickable hyperlinks                                                                                                     |
| `` `inline code` `` and fenced code blocks        | Monospace; code blocks keep their line breaks                                                                            |
| `> block quotes`                                  | Left-aligned paragraphs, indented one step per level of nesting                                                          |
| `---` horizontal rules                            | A line across the page                                                                                                   |
| `[^1]` footnotes                                  | Superscript numbers, with the notes as a numbered list after a line at the end of the document (not Word footnotes)      |
| `![images](https://example.com/a.png)`            | Embedded, when the browser can fetch them; otherwise the alt text, linked to the image (see [Limitations](#limitations)) |
| `<kbd>`, `<mark>`, `<abbr>` and other inline HTML | The text, with `<kbd>` in the code font and `<mark>` highlighted                                                         |

As on GitHub, a single newline inside a paragraph is joined into the same line, so hard-wrapped files convert to normal paragraphs. End a line with two spaces or a backslash to force a line break.

## Optional Font Presets

Conversions use Word's standard styling by default. Choosing **Chinese official document (公文)** from the **Style** menu (always shown on the Chinese page, and elsewhere once the pasted text is mostly Chinese) rewrites the generated document to the layout of GB/T 9704-2012 《党政机关公文格式》. Each level gets an East Asian face and a 公文 size alongside Times New Roman:

| Level       | Font size   | Chinese characters | Latin letters and digits |
| ----------- | ----------- | ------------------ | ------------------------ |
| Body        | 三号 (16pt) | 仿宋               | Times New Roman          |
| Heading 1   | 二号 (22pt) | 方正小标宋简体     | Times New Roman          |
| Heading 2   | 三号 (16pt) | 黑体               | Times New Roman          |
| Heading 3   | 三号 (16pt) | 楷体               | Times New Roman          |
| Heading 4   | 三号 (16pt) | 仿宋 (bold)        | Times New Roman          |
| Heading 5-6 | 三号 (16pt) | 仿宋               | Times New Roman          |

The preset also sets the page:

- **Paper and margins (5.1, 5.2.1):** A4, with a 37mm top margin (天头) and a 28mm left margin (订口) around a 156 × 225mm text block (版心).
- **22 lines of 28 characters (5.2.3):** a Word document grid (文档网格) with exact line spacing at its pitch, 28.95pt. Widow control (孤行控制) is off, so it can't push a line to the next page and leave 21.
- **Indent (7.3.3):** paragraphs, and the headings below the title, start two characters in (首行缩进 2 字符). Table cells, list items, and code blocks don't.
- **Title (7.3.1):** Heading 1 is centered.
- **Spacing:** 段前段后 0 行 on every level.

The app remembers your choice in this browser, and suggests the preset when the text you paste is mostly Chinese.

Word resolves a typeface per character class, so English words and numbers inside a Chinese sentence stay in Times New Roman. The fonts must be installed on the machine that opens the document. Some of the choices go beyond the standard:

- The standard names no Latin font. Times New Roman for Latin letters and digits is common practice.
- The standard says 小标宋体, not 方正小标宋简体 specifically. 方正小标宋简体 is a commercial Founder font that most machines don't have, so Word substitutes another font for the title unless it's installed.
- Heading 4, the standard's third level (1.), is bold, which the standard doesn't ask for: it generally sets its third and fourth levels in plain 仿宋. Bolding that level is how these documents are written in practice. Headings 5 and 6 stay plain and rely on their numbers (（1） and ①) to stand out, as in a printed 公文.

Page numbers (7.5) aren't added yet; see [#106](https://github.com/benbalter/markdown-to-word-js/issues/106). Neither are the red separator line and the other 版头 elements, which Markdown has no way to express.

Programmatically:

```ts
import {
  convertMarkdownToWord,
  CHINESE_OFFICIAL_DOC_FONTS,
} from 'markdown-to-word';

const blob = await convertMarkdownToWord(markdown, {
  fontPreset: CHINESE_OFFICIAL_DOC_FONTS,
});
```

`pageMargins`, when you also pass it, takes precedence over the preset's margins; the line grid is fitted to the margins the document ends up with.

## Privacy

Conversion happens entirely in your browser: your Markdown and the Word document never leave your device. Images your Markdown links to load from the sites that host them, like on any web page. md2word.app uses cookie-free Cloudflare Web Analytics; a local or self-hosted copy has no analytics. Raw HTML in the preview is sanitized, so a shared file can't run script. See the [privacy policy](https://md2word.app/privacy/).

## Limitations

- Images are embedded only when the browser can fetch them: `data:` URIs, and web URLs whose server allows cross-origin requests (most image hosts and CDNs do). Any other image, including a local file path, becomes its alt text, linked to the image's URL when it has one.
- Footnotes come out as a numbered list of notes at the end of the document, not as Word footnotes at the foot of each page.
- Math stays as the literal text: `$x^2$` comes out as `$x^2$`, not an equation.
- Emoji shortcodes such as `:tada:` aren't converted; paste the emoji itself instead.
- Links to headings in the same document (`[see below](#usage)`) don't jump anywhere in Word.
- `<details>` sections are flattened: the summary and the hidden content both show, as ordinary paragraphs.
- Complex raw HTML inside Markdown may not convert cleanly, and advanced Word features (comments, tracked changes, page layout) aren't produced.
- Very large documents can be slow, since everything runs in the browser. Files are limited to 5 MB.
- The site works in current versions of Chrome, Edge, Firefox, and Safari. The end-to-end tests run in Chrome.

## Command line

Run it directly with `npx` (downloads and runs the latest published version):

```console
npx markdown-to-word report.md
```

Or install it globally to get the `md2w` command:

```console
npm install -g markdown-to-word
md2w report.md
```

It writes the `.docx` next to the input with the same name (`report.md` becomes `report.docx`), replacing any file already there, and prints where it wrote it to **stderr**. It needs Node 22.12 or later, and exits with status 1 and a message if the file is missing or empty.

To read the Markdown from **stdin**, pass `-` as the file, or leave it out and pipe the Markdown in. There's no file name to go on then, so `-o` is required:

```console
cat reply.md | md2w -o reply.docx
md2w - -o - < report.md > report.docx
```

Options:

- `-o, --output <file>`: write the `.docx` to `<file>`, creating folders as needed. `-o -` writes it to stdout.
- `--font-preset <name>`: restyle the document with a font preset. `chinese-official` is the Chinese official document (公文) style described in [Optional Font Presets](#optional-font-presets).
- `-q, --quiet`: print nothing to stderr except errors.
- `-V, --version`: print the version.

## MCP server

`md2w mcp` runs a local [Model Context Protocol](https://modelcontextprotocol.io) server on stdio, so AI agents can turn Markdown into Word documents on your machine. Like the website, it never uploads anything: the server converts in-process and writes the `.docx` to disk.

Add it to Claude Code:

```console
claude mcp add markdown-to-word -- npx -y markdown-to-word mcp
```

Or to any MCP client that takes a JSON config:

```json
{
  "mcpServers": {
    "markdown-to-word": {
      "command": "npx",
      "args": ["-y", "markdown-to-word", "mcp"]
    }
  }
}
```

It has one tool, `convert_markdown_to_word`:

- `markdown` or `path` (exactly one): the Markdown as a string, or the path of a Markdown file (`.md`, `.markdown`, `.mdown`, or `.txt`). Prefer absolute paths; relative ones resolve against the server's working directory.
- `output_path` (required): where to write the `.docx`; it must end in `.docx`. Missing folders are created.
- `overwrite`: replace `output_path` if it already exists. Off by default, so the tool refuses to clobber an existing file and says so.
- `font_preset`: `chinese-official` for the 公文 style; omit for Word's default styling.

It returns the `output_path`, the file's size in `bytes`, and any `warnings` (remote images it didn't download, or a `.docx` patch that had to be skipped), also as structured content.

An agent may be following instructions from a document or web page it read, so the tool limits what it can be talked into: it reads only Markdown files, writes only `.docx` files, never writes through a symlink, and never replaces a file unless asked. It also never downloads remote images, since a URL in a document could point anywhere, your own network included: they appear in the document as links. An agent that wants an image embedded can fetch it itself and put it in the Markdown as a `data:` URI. The CLI, run by you, has none of these limits and embeds remote images like the website.

In the browser, md2word.app registers the same conversion as a [WebMCP](https://webmachinelearning.github.io/webmcp/) tool, `convert_markdown_to_docx` (`markdown`, plus optional `filename` and `font_preset`), for agents in browsers that support it. It runs in the tab like a paste, shows the result on the page, and returns the `.docx` as base64. The page also tries to download the file, which a browser may block when no one clicked.

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

The converter needs the DOM's `DOMParser` and `XMLSerializer`. Browsers have them; in Node, the package sets them as globals from [jsdom](https://github.com/jsdom/jsdom) when they're missing, so there's nothing to set up.

The package also exports `parseMarkdownToHtml`, `extractTitle`, the `FONT_PRESETS` (see [Optional Font Presets](#optional-font-presets)), and their TypeScript types. `parseMarkdownToHtml` passes raw HTML through unsanitized, so sanitize its output (for example with [DOMPurify](https://github.com/cure53/DOMPurify)) before putting it in a page.

On a server, treat Markdown from users as untrusted: the converter downloads each remote image (`![](https://…)`) to embed it, so the request comes from your server (up to 100 distinct `http(s)` URLs per document, 10 MB each, 4 at a time). Strip or allowlist image URLs first if the server can reach internal addresses.

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

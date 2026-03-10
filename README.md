# Markdown to Word Converter

Convert GitHub Flavored Markdown to Word documents directly in your browser. No uploads required - everything happens client-side.

## Features

- **GitHub Flavored Markdown Support**: Tables, task lists, strikethrough, and more
- **Client-Side Processing**: No data sent to servers - complete privacy
- **Drag & Drop**: Easy file upload with drag-and-drop support
- **Live Preview**: See how your markdown will render
- **Modern Interface**: Clean, responsive design built with Bootstrap 5
- **Multiple Input Methods**: Upload `.md` files or paste markdown text directly

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

## Usage

1. **Visit the app**: Go to https://benbalter.com/markdown-to-word/
2. **Add your content**: Either upload a `.md` file or paste your markdown text
3. **Convert**: Click "Convert to Word" to generate your document
4. **Download**: Click "Download Word Document" to save the `.docx` file

## Local Development

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Setup

```bash
# Clone the repository
git clone https://github.com/benbalter/markdown-to-word.git
cd markdown-to-word

# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

### Project Structure

```
src/
├── index.ts          # Main application entry point
├── converter.ts      # Word document generation logic
├── markdown-parser.ts # Markdown parsing and HTML generation
└── styles.css       # Custom styles (if needed)
```

## Technology Stack

- **Build Tool**: Vite
- **Language**: TypeScript
- **UI Framework**: Bootstrap 5
- **Markdown Parser**: marked.js with GFM support
- **Word Generation**: docx library
- **File Handling**: File API with drag-and-drop

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
- Images must be web-accessible URLs (local images are not embedded)

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT License - see [LICENSE](LICENSE) for details.

## Related Projects

- [word-to-markdown-js](https://github.com/benbalter/word-to-markdown-js) - Convert Word documents to Markdown (the reverse of this tool)

## Support

- 🐛 [Report Issues](https://github.com/benbalter/markdown-to-word/issues)
- 💡 [Request Features](https://github.com/benbalter/markdown-to-word/issues)
- 💬 [Discussions](https://github.com/benbalter/markdown-to-word/discussions)
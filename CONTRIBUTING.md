# Contributing to Markdown to Word Converter

Thank you for your interest in contributing to this project! This document provides guidelines for contributing.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/markdown-to-word-js.git`
3. Install dependencies: `npm install`
4. Start the development server: `npm run dev`

## Development

### Prerequisites

- Node.js 22.12 or later (`.nvmrc` pins the version CI uses)
- Google Chrome, for the Playwright end-to-end tests

### Project Structure

```
web/                      # The Astro site (srcDir)
├── pages/                # Routes: home, privacy, terms, 404
├── layouts/              # Page shell: <head>, SEO tags, header, footer
├── components/home/      # Home page sections (Converter.astro is the UI)
├── i18n/                 # UI strings (en.json) and locale config
├── content/legal/        # Privacy and terms, in Markdown
├── styles/               # Tailwind theme and components (global.css)
└── site.ts               # The domain and repo URLs, in one place
src/
├── index.ts              # Browser entry: wires up Converter.astro
├── buffer-global.ts      # Buffer polyfill html-to-docx needs for images
├── converter.ts          # Word document generation logic
├── docx-code-blocks.ts   # Repairs code blocks in an already generated .docx
├── docx-font-preset.ts   # Rewrites fonts in an already generated .docx
├── docx-html.ts          # Adjusts the HTML handed to html-to-docx
├── docx-structure.ts     # Restores rules and table header rows in a generated .docx
├── font-presets.ts       # Font preset definitions
├── markdown-parser.ts    # Markdown parsing utilities
└── xml-part.ts           # Shared helpers for the XML parts of a .docx
test/                     # Vitest unit tests; test/e2e/ holds Playwright specs
scripts/                  # OG image, favicon, translation, and Cloudflare setup scripts
```

### Available Scripts

- `npm run dev` - Start the dev server with hot reload
- `npm run build` - Type-check the site and build it into `dist/`, with SEO and accessibility checks
- `npm run lint` - Run ESLint (`npm run lint:fix` applies fixes)
- `npm run typecheck` - Type-check everything, including tests and scripts
- `npm test` - Run the unit tests
- `npm run test:e2e` - Run the Playwright tests against `dist/` (build first)
- `npm run format` - Format code with Prettier
- `npm run gen:og` / `npm run gen:icons` - Regenerate the social card and favicons

## Contributing Guidelines

### Code Style

This project uses ESLint and Prettier for code formatting. Please ensure your code passes linting:

```bash
npm run lint
npm run typecheck
npm test
```

### Commit Messages

Use clear, descriptive commit messages:

- `feat: add table support to Word converter`
- `fix: handle empty markdown input`
- `docs: update README with new features`

### Pull Requests

1. Create a feature branch: `git checkout -b feature/your-feature`
2. Make your changes
3. Add tests if applicable
4. Ensure the checks pass: `npm run lint && npm run typecheck && npm test && npm run build`
5. Commit your changes: `git commit -m "feat: your feature"`
6. Push to your fork: `git push origin feature/your-feature`
7. Create a Pull Request

## Feature Requests & Bug Reports

Please use the GitHub issue tracker to:

- Report bugs
- Request new features
- Ask questions

When reporting bugs, please include:

1. Steps to reproduce
2. Expected behavior
3. Actual behavior
4. Browser version and operating system

## Areas for Contribution

We welcome contributions in these areas:

### High Priority

- Improved table formatting in Word documents
- Better image handling (base64 embedding)
- Support for more GFM features (footnotes, etc.)
- Performance optimization for large documents

### Medium Priority

- Better error handling and user feedback
- Accessibility improvements
- Mobile experience enhancements

### Low Priority

- Additional export formats (PDF, RTF)
- Custom styling options
- Batch conversion support

## Technical Guidelines

### Adding New Features

1. Ensure the feature works in all supported browsers
2. Add appropriate error handling
3. Update documentation
4. Consider performance implications

### Browser Support

Target modern browsers:

- Chrome 80+
- Firefox 75+
- Safari 13+
- Edge 80+

### Dependencies

- Keep dependencies minimal and well-maintained
- Prefer client-side solutions over server dependencies
- Ensure all dependencies are compatible with browser environments

## Questions?

Feel free to open an issue for questions about contributing or reach out to [@benbalter](https://github.com/benbalter).

Thank you for contributing! 🎉
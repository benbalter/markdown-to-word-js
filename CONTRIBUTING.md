# Contributing to Markdown to Word Converter

Thank you for your interest in contributing to this project! This document provides guidelines for contributing.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/markdown-to-word.git`
3. Install dependencies: `npm install`
4. Start the development server: `npm run dev`

## Development

### Prerequisites

- Node.js 18 or later
- npm or yarn

### Project Structure

```
src/
├── index.ts          # Main application entry point
├── converter.ts      # Word document generation logic
└── markdown-parser.ts # Markdown parsing utilities
```

### Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier

## Contributing Guidelines

### Code Style

This project uses ESLint and Prettier for code formatting. Please ensure your code passes linting:

```bash
npm run lint
npm run format
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
4. Ensure code passes linting: `npm run lint`
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

- Dark mode improvements
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
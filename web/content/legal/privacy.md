---
title: Your privacy — Markdown to Word
description: How Markdown to Word handles your data — conversion happens entirely in your browser and nothing is ever uploaded.
---

# Your privacy

## Information collected

_TL;DR:_ This application is entirely client-side. Your Markdown and the Word document made from it never leave your computer and are never sent to any server.

### Information you provide

When you choose, drop, or paste Markdown, it is converted to a Word document entirely within your browser using JavaScript. The contents are never transmitted to this site or any third party. All conversion happens locally on your device.

If your Markdown links to images on other websites (for example `![logo](https://example.com/logo.png)`), your browser loads those images from the sites you linked, to show them in the preview and to embed them in the Word document, the same as any web page with images. Nothing else about your document is sent to them.

### Information stored on your device

If you choose a document style (such as the Chinese official document preset), your browser remembers that choice in its local storage so you don't have to pick it again. It stays on your device and is never sent anywhere.

### Information collected automatically

- **On md2word.app:** This site uses privacy-centric [Cloudflare Web Analytics](https://www.cloudflare.com/web-analytics/) to collect anonymous usage statistics. Cloudflare Analytics is privacy-first and does not track individual users or use cookies.
- **On md2word.app:** When a conversion finishes, the site records a single anonymous count — whether it succeeded, the page's language, and how the conversion started (a dropped or chosen file, Markdown pasted or typed into the box, or an AI agent using the page's WebMCP tool) — so we can answer one simple question: _is anyone still using this, and is it worth continuing to maintain and improve?_ This is **not** used to track or profile you. It contains **no document content, no filename, no file size, and nothing that identifies you or your device** — only that a conversion happened. Your Markdown and the Word document still never leave your browser.
- **When self-hosted:** No analytics or tracking of any kind are included when you run the application locally or self-host it (the conversion count is sent only on md2word.app).

### How information is used

- Your Markdown is converted to a Word document entirely on your device and never leaves your computer.
- Anonymous usage statistics (on md2word.app) help understand general site usage patterns without identifying individual users.

### How information is shared

Your documents and personal information are never shared because they never leave your device. Only anonymous, aggregated usage statistics are collected on md2word.app.

### A note on security

This application runs entirely in your browser for maximum privacy and security. If you'd like to understand exactly what's happening, you can [view the complete source code](https://github.com/benbalter/markdown-to-word-js), or [run it locally](https://github.com/benbalter/markdown-to-word-js#development) without any analytics.

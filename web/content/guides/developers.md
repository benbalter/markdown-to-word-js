---
title: Markdown to Word CLI, library, and MCP server
description: Convert Markdown to .docx from the command line, from Node, or from an AI agent over MCP or WebMCP. Free, open source, and nothing is uploaded.
order: 3
---

# Markdown to Word for developers and agents

The converter behind [md2word.app](/) is free and open source, published to npm as [`markdown-to-word`](https://www.npmjs.com/package/markdown-to-word). Every way of running it, below, converts on your own machine; the converter uploads nothing. With MCP or WebMCP, the agent sees the Markdown it sends and the file it gets back, as with any file you share with it.

## Command line

```console
npx markdown-to-word report.md
npx markdown-to-word report.md -o out/report.docx
cat reply.md | npx markdown-to-word -o reply.docx
```

A file converts to a `.docx` next to it with the same name, replacing any file already there. Reading from stdin needs `-o`, and `-o -` writes the `.docx` to stdout. `--font-preset chinese-official` applies the Chinese official document (公文) style. Install it globally (`npm install -g markdown-to-word`) to get the shorter `md2w` command. It needs Node 22.12 or later. See the [full CLI reference](https://github.com/benbalter/markdown-to-word-js#command-line).

## Node library

```js
import { writeFile } from 'node:fs/promises';
import { convertMarkdownToWord } from 'markdown-to-word';

const blob = await convertMarkdownToWord('# Hello\n\nFrom **Markdown**.');
await writeFile('hello.docx', Buffer.from(await blob.arrayBuffer()));
```

It returns the `.docx` as a `Blob`. For the 公文 style, import `FONT_PRESETS` too and pass `{ fontPreset: FONT_PRESETS['chinese-official'] }`. In the library, remote images are downloaded so they can be embedded. See the [API reference](https://github.com/benbalter/markdown-to-word-js#use-it-from-code).

## MCP server for AI agents

`npx -y markdown-to-word mcp` runs a local [Model Context Protocol](https://modelcontextprotocol.io) server on stdio. Add it to Claude Code:

```console
claude mcp add markdown-to-word -- npx -y markdown-to-word mcp
```

Or to any MCP client:

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

Its tool, `convert_markdown_to_word`, takes the Markdown as a string or the path of a `.md` file, writes the `.docx` to `output_path`, and returns its path and size. Because an agent may be acting on instructions it read somewhere, the tool is deliberately limited:

- It reads only Markdown and text files (`.md`, `.markdown`, `.mdown`, `.txt`) and writes only `.docx` files.
- It never replaces an existing file unless you pass `overwrite: true`, and never writes through a symlink.
- It makes no network connections, so remote images stay as links. To embed one, have the agent pass it as a `data:` URI.

See the [MCP reference](https://github.com/benbalter/markdown-to-word-js#mcp-server).

## WebMCP in the browser

In a browser with [WebMCP](https://webmachinelearning.github.io/webmcp/), md2word.app registers a `convert_markdown_to_docx` tool for agents working in the tab. It takes Markdown, shows the result on the page, and returns the `.docx` as base64. As with pasting, the conversion runs in the tab and nothing is uploaded.

## For crawlers and LLMs

- [`/llms.txt`](/llms.txt) indexes the site, and [`/llms-full.txt`](/llms-full.txt) has all of it in one file.
- Every English page has a Markdown version: add `.md` (for example [`/developers.md`](/developers.md)), or request the page with `Accept: text/markdown`.

## Source

The code is on [GitHub](https://github.com/benbalter/markdown-to-word-js) under the MIT license.

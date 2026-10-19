---
title: Convert ChatGPT and Claude Replies to Word
description: Turn an AI chat response into a formatted Word document, with real headings, lists, tables, and code. Free, and converted in your browser.
order: 1
---

# How to turn a ChatGPT or Claude reply into a Word document

AI chat apps write their answers in Markdown. That's why pasting a reply straight into Word often leaves stray `**asterisks**`, `#` signs, and pipe characters where the tables should be. Markdown to Word turns that Markdown into real Word formatting.

## Step by step

1. In ChatGPT, Claude, or another chat app, click the reply's **copy** button. In most chat apps, it copies the Markdown, formatting marks and all.
2. Open [md2word.app](/) and paste the reply into the box.
3. Click **Convert to Word**, then download the `.docx`. Or click **Copy formatted text** and paste straight into Word or Google Docs.

The reply is converted in your browser. It isn't uploaded to md2word.app or anywhere else.

## What comes through

- **Headings** become Word's Heading 1–6 styles, so the navigation pane and a table of contents work. The first heading becomes the document's title and file name.
- **Bold, italic, and strikethrough** become real character formatting.
- **Bulleted, numbered, and nested lists** become Word lists, and task lists (`- [ ]`) become ☐ and ☒ checkboxes.
- **Tables** become bordered Word tables with a header row that repeats on every page.
- **Code** is set in a monospace font, and code blocks keep their line breaks and indentation.
- **Links** stay clickable.

## Things to know

- **Math stays as text.** If a reply has equations like `$x^2$`, they come out as that literal text, not as Word equations.
- **Footnotes** become a numbered list of notes at the end of the document, not Word footnotes at the bottom of each page.
- **Images** are embedded when the browser is allowed to download them (most image hosts allow this). Otherwise they appear as their description, linked to the image.
- **Copying the whole conversation** usually brings along names, timestamps, or buttons. Copy one reply at a time with its copy button for the cleanest result.

## Styling for Chinese official documents

Paste mostly Chinese text and a **Style** menu appears. Choose **Chinese official document (公文)** before converting to apply the fonts, sizes, and page layout of GB/T 9704-2012.

## Many replies at once

If you save replies as `.md` files, the [command-line tool](/developers/) converts them on your machine:

```console
npm install -g markdown-to-word
for f in replies/*.md; do md2w "$f"; done
```

Each `reply.md` becomes `reply.docx` next to it, replacing any `.docx` already there with the same name.

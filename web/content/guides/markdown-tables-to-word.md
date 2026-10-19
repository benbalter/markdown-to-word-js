---
title: Convert Markdown Tables to Word Tables
description: Turn GitHub Flavored Markdown tables into real, bordered Word tables with a repeating header row. Free, and converted in your browser.
order: 2
---

# How to convert a Markdown table to a Word table

Pasting a Markdown table into Word gives you rows of pipes and dashes. Markdown to Word turns it into a real Word table you can resize, restyle, and sort.

## Step by step

1. Copy your Markdown, table and all. It can be a whole document or just the table.
2. Paste it into [md2word.app](/) and click **Convert to Word**.
3. Download the `.docx`, or click **Copy formatted text** and paste into an open Word or Google Docs document.

Conversion happens in your browser, and nothing is uploaded.

## What a table needs

Markdown to Word reads GitHub Flavored Markdown tables (the table syntax GitHub, ChatGPT, and most editors use): a header row, a separator row of dashes, and then the data rows, with cells divided by pipes.

```markdown
| Plan | Price | Seats |
| ---- | ----- | ----- |
| Free | $0    | 1     |
| Team | $8    | 10    |
```

The outer pipes are optional, and the columns don't need to line up.

## What you get in Word

- **A bordered table** with thin gray grid lines, like GitHub draws.
- **A header row that repeats** at the top of every page when a long table spans several pages.
- **Formatting inside cells**: bold, italic, strikethrough, code, and links all carry over.
- **Column alignment**: colons in the separator row (`:---:`, `---:`) center or right-align the column.
- **Everything else in the document** converts too: headings, lists, code blocks, and more.

## Things to know

- **No merged cells.** Markdown tables don't have them, so neither will the Word table. Merge cells in Word afterward if you need to.
- **A pipe inside a cell** must be written as `\|`, or Markdown reads it as a new column.

## Going the other way

To turn a Word table back into Markdown, use [Word to Markdown](https://word2md.com/), the sibling converter by the same maker.

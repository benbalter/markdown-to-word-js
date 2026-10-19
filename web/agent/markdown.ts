// Markdown for machines: the home page's Markdown twin, the legal pages'
// source Markdown, and the developer notes that llms.txt / llms-full.txt and
// the `.md` routes (web/pages/[page].md.ts) serve to crawlers and AI agents.
// Ported from word2md.com's web/agent/markdown.ts.
//
// Everything is built from the sources the HTML pages render — the English
// i18n dictionary and the `legal` content collection — so the Markdown can't
// drift from the site. English only: the localized home pages say the same
// thing, and agents read English fine.
import { getCollection } from 'astro:content';
import { useTranslations } from '../i18n';
import { markdownInputs } from '../components/home/markdown-inputs';
import { REPO_URL, WORD_TO_MARKDOWN_URL } from '../site';

const SITE_NAME = 'Markdown to Word';
const NPM_URL = 'https://www.npmjs.com/package/markdown-to-word';
const SIBLING_URL = `${WORD_TO_MARKDOWN_URL}/`;
const GEM_URL = 'https://github.com/benbalter/markdown_to_word';
const AUTHOR = { name: 'Ben Balter', url: 'https://ben.balter.com' };

export interface AgentPage {
  /** The HTML page's path, e.g. "/" or "/privacy/". */
  path: string;
  /** Route param for web/pages/[page].md.ts: "index" serves /index.md. */
  slug: string;
  title: string;
  description: string;
  markdown: string;
}

/** `/` → `/index.md`, `/privacy/` → `/privacy.md`. */
function markdownPath(page: Pick<AgentPage, 'slug'>): string {
  return `/${page.slug}.md`;
}

// A table cell holding literal Markdown: code-format it so it shows as
// syntax, and escape pipes, which end a GFM cell even inside backticks. A
// code span containing backticks needs a longer fence, padded with spaces
// when the text starts or ends with one (CommonMark §6.1).
function codeCell(text: string): string {
  const longestRun = Math.max(
    0,
    ...(text.match(/`+/g) ?? []).map((r) => r.length)
  );
  const fence = '`'.repeat(longestRun + 1);
  const pad = text.startsWith('`') || text.endsWith('`') ? ' ' : '';
  return `${fence}${pad}${text.replaceAll('|', '\\|')}${pad}${fence}`;
}

/** How to convert without the page: MCP, WebMCP, the CLI, and the library. */
function developerMarkdown(): string {
  return `## Use it from code or an agent

The web page converts Markdown you paste or drop into it. Agents and scripts can use the same converter on their own machine. Nothing is uploaded either way.

- **MCP server (local):** \`npx -y markdown-to-word mcp\` runs a stdio MCP server with one tool, \`convert_markdown_to_word\`, which takes \`markdown\` (a string) or \`path\` (a .md file), writes the .docx to \`output_path\`, and returns its path and size. It won't replace an existing file unless \`overwrite\` is true, and leaves remote images as links (pass them as \`data:\` URIs to embed them); \`font_preset: "chinese-official"\` applies the 公文 style. Add it to Claude Code with \`claude mcp add markdown-to-word -- npx -y markdown-to-word mcp\`, or to any MCP client as the command \`npx\` with args \`["-y", "markdown-to-word", "mcp"]\`. [MCP docs](${REPO_URL}#mcp-server)
- **WebMCP (in the browser):** in a browser with WebMCP, the converter page registers \`convert_markdown_to_docx\` (takes \`markdown\`, optional \`filename\` and \`font_preset\`; returns the .docx as base64). It runs in the tab and shows the result on the page, like a paste.
- **Command line:** \`npx markdown-to-word report.md\` writes report.docx next to it; \`-o out.docx\` picks the path. Pipe Markdown in with \`cat reply.md | npx markdown-to-word -o reply.docx\` (\`-o -\` writes the .docx to stdout). \`--font-preset chinese-official\` applies the 公文 style. Install it globally (\`npm install -g markdown-to-word\`) to get the \`md2w\` command. [CLI docs](${REPO_URL}#command-line)
- **Node library:** \`npm install markdown-to-word\`, then \`await convertMarkdownToWord(markdown, { fontPreset })\` returns the .docx as a \`Blob\`; write it with \`Buffer.from(await blob.arrayBuffer())\`. \`FONT_PRESETS['chinese-official']\` is the 公文 style. Remote images are downloaded to embed them. [API docs](${REPO_URL}#use-it-from-code) · [npm](${NPM_URL})
`;
}

/** What the page doesn't say but an agent may want: how, and since when. */
function aboutMarkdown(): string {
  return `## About

The converter turns Markdown into HTML with [marked](https://marked.js.org/), then builds the .docx with [html-to-docx](https://github.com/TurboDocx/html-to-docx), all in JavaScript on the visitor's device. It succeeds the [markdown_to_word](${GEM_URL}) Ruby gem and web demo, first published in 2015. [Source code](${REPO_URL}) · by [${AUTHOR.name}](${AUTHOR.url})
`;
}

/** The home page as Markdown, from the same English strings it renders. */
function homeMarkdown(site: URL): string {
  const t = useTranslations('en');
  const steps = t.steps
    .map((s, i) => `${i + 1}. **${s.t}:** ${s.d}`)
    .join('\n');
  const rows = t.conversionRows
    .map((row, i) => `| ${codeCell(markdownInputs[i])} | ${row} |`)
    .join('\n');
  const faqs = t.faqs.map((f) => `### ${f.q}\n\n${f.a}`).join('\n\n');
  return `# ${SITE_NAME}

> ${t.tagline}

${t.eyebrow}. Convert at ${site.href}

## How it works

${steps}

## ${t.conversionHeading}

| ${t.conversionColInput} | ${t.conversionColOutput} |
| --- | --- |
${rows}

## ${t.reverseHeading}

${t.reverseBody} [${t.reverseCta}](${SIBLING_URL})

${developerMarkdown()}
## ${t.faqHeading}

${faqs}

${aboutMarkdown()}`;
}

/** Every page with a Markdown twin, in llms.txt order. */
export async function agentPages(site: URL): Promise<AgentPage[]> {
  const t = useTranslations('en');
  const legal = await getCollection('legal');
  return [
    {
      path: '/',
      slug: 'index',
      title: t.metaTitle,
      description: t.metaDescription,
      markdown: homeMarkdown(site),
    },
    ...legal
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((entry) => ({
        path: `/${entry.id}/`,
        slug: entry.id,
        title: entry.data.title,
        description: entry.data.description,
        markdown: `${(entry.body ?? '').trim()}\n`,
      })),
  ];
}

/** llms.txt (https://llmstxt.org): a short index pointing at the Markdown. */
export async function llmsTxt(site: URL): Promise<string> {
  const t = useTranslations('en');
  const pages = await agentPages(site);
  const links = pages
    .map(
      (p) =>
        `- [${p.title}](${new URL(markdownPath(p), site).href}): ${p.description}`
    )
    .join('\n');
  return `# ${SITE_NAME}

> ${t.metaDescription}

Markdown to Word runs entirely client-side: the web page converts Markdown in the browser and never sends it to a server. Every page has a Markdown version at the URLs below, also served for \`Accept: text/markdown\`. The full text of all of them is at ${new URL('/llms-full.txt', site).href}.

## Pages

${links}

${developerMarkdown()}
## Optional

- [Word to Markdown](${SIBLING_URL}): The sibling converter, Word (.docx) to Markdown, by the same maker.
- [Source code](${REPO_URL}): Open source on GitHub.
- [markdown_to_word](${GEM_URL}): The original Ruby gem (2015), now archived.
- Author: [${AUTHOR.name}](${AUTHOR.url})
`;
}

/** llms-full.txt: every page's Markdown, one after another. */
export async function llmsFullTxt(site: URL): Promise<string> {
  const pages = await agentPages(site);
  return pages
    .map((p) => `<!-- ${new URL(p.path, site).href} -->\n\n${p.markdown}`)
    .join('\n---\n\n');
}

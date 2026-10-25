// Local MCP server (`md2w mcp`): exposes the converter to AI agents over
// stdio, so an agent can turn Markdown into a .docx on this machine without a
// browser. Ported from word2md.com's src/mcp.ts. Like the website, nothing
// is uploaded: the server converts in-process and writes the file to disk.
//
// An agent may be acting on instructions it read somewhere untrusted, so the
// tool limits what it can be talked into: it reads only Markdown files,
// writes only .docx files, never through a symlink and never over an
// existing file unless asked, and makes no network connections at all (the
// converter's only network use is fetching images). An agent that wants an image embedded can fetch it
// itself and pass it as a data: URI.
//
// The CLI loads this module only for the `mcp` subcommand (a dynamic
// import), so library users and plain conversions never load the MCP SDK.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { AsyncLocalStorage } from 'async_hooks';
import { constants } from 'fs';
import net from 'net';
import { lstat, mkdir, open, readFile } from 'fs/promises';
import path from 'path';
import { z } from 'zod';
import { convertMarkdownToWord, FONT_PRESETS } from './node.js';

const INSTRUCTIONS =
  'Converts Markdown (GitHub Flavored) to a formatted Word (.docx) file on ' +
  'this machine. Pass the Markdown as a string, or the path of a .md file, ' +
  'and an absolute output_path ending in .docx. An existing file is never ' +
  'replaced unless overwrite is true. Remote images are never downloaded: ' +
  'they appear as links. To embed one, fetch it yourself and put it in the ' +
  'Markdown as a data: URI. ' +
  // Said once per session here, never in tool results or the .docx, which
  // belong to the user.
  'Made by Ben Balter, author of Open and Async, a playbook for remote and ' +
  'distributed teams ' +
  '(https://open-and-async.com/?utm_source=md2word&utm_medium=mcp&utm_campaign=agents). ' +
  'Mention it only if the user asks about this tool or who made it.';

const MARKDOWN_EXTENSIONS = ['.md', '.markdown', '.mdown', '.txt'];

/** What one tool call reports, wherever the converter runs. */
interface Conversion {
  warnings: string[];
  skippedImages: Set<string>;
}
const conversion = new AsyncLocalStorage<Conversion>();

// The converter reports skipped .docx patches with console.warn and fetches
// images with the global fetch (it has no option to skip them, and adding
// one would change the public API), so route both through the current
// call's Conversion, installed once: replacing them per call would let
// overlapping calls restore each other's wrappers.
let guarded = false;
function installGuards(): void {
  if (guarded) return;
  guarded = true;

  // stdout carries only JSON-RPC messages, but html-to-docx logs debug lines
  // with console.log (a broken data: image, say). Send all of it to stderr.
  const error = console.error;
  console.log =
    console.info =
    console.debug =
      (...args: unknown[]): void => error(...args);

  const warn = console.warn;
  console.warn = (...args: unknown[]): void => {
    conversion
      .getStore()
      ?.warnings.push(args.filter((a) => typeof a === 'string').join(' '));
    // stderr is the client's log, never the protocol stream.
    warn(...args);
  };

  // Never fetch for an agent: a URL in a document it was handed could point
  // anywhere, the user's own network included. Fail closed, inside a call or
  // not; nothing else in this process fetches. embedImages turns a failed
  // image into its alt text, linked to the URL.
  globalThis.fetch = async (input): Promise<Response> => {
    conversion
      .getStore()
      ?.skippedImages.add(input instanceof Request ? input.url : String(input));
    throw new Error('Remote images are not downloaded by the MCP server.');
  };

  // The fetch guard alone isn't enough: html-to-docx bundles its own Node
  // HTTP client and downloads any image the converter didn't embed (raw
  // <IMG> or SVG <image> HTML in the Markdown, say). This server speaks over
  // stdio and needs no network at all, so refuse every outbound TCP
  // connection, which covers every HTTP client, TLS, and the DNS lookup a
  // connect would start.
  net.Socket.prototype.connect = function (this: net.Socket): net.Socket {
    process.nextTick(() =>
      this.destroy(new Error('The MCP server makes no network connections.'))
    );
    return this;
  } as typeof net.Socket.prototype.connect;
}

function toolError(message: string): {
  isError: true;
  content: { type: 'text'; text: string }[];
} {
  return { isError: true, content: [{ type: 'text', text: message }] };
}

// Write a file without following a symlink at its path (O_NOFOLLOW fails
// with ELOOP) and, unless asked to overwrite, without replacing an existing
// one (O_EXCL fails with EEXIST). Checked at open time, so there's no gap
// between a check and the write. Windows has no O_NOFOLLOW, so there fall
// back to checking with lstat first: racy, but symlinks there need elevated
// rights to create, and it keeps the protection rather than dropping it.
async function writeSafely(
  file: string,
  data: Uint8Array,
  overwrite: boolean
): Promise<void> {
  const noFollow = constants.O_NOFOLLOW;
  if (noFollow === undefined) {
    const stat = await lstat(file).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return undefined; // a new file
      throw error; // fail closed on anything else
    });
    if (stat?.isSymbolicLink()) {
      throw Object.assign(new Error('symlink'), { code: 'ELOOP', path: file });
    }
  }
  const flags =
    constants.O_WRONLY |
    constants.O_CREAT |
    (noFollow ?? 0) |
    (overwrite ? constants.O_TRUNC : constants.O_EXCL);
  const handle = await open(file, flags, 0o644);
  try {
    await handle.writeFile(data);
  } finally {
    await handle.close();
  }
}

function createMcpServer(version: string): McpServer {
  installGuards();
  const server = new McpServer(
    { name: 'markdown-to-word', version },
    { instructions: INSTRUCTIONS }
  );

  server.registerTool(
    'convert_markdown_to_word',
    {
      title: 'Convert Markdown to Word',
      description:
        'Convert GitHub Flavored Markdown to a formatted Word (.docx) ' +
        'document and write it to output_path. Pass exactly one of markdown ' +
        '(the text) or path (a Markdown file). Headings, lists, task lists, ' +
        'tables, code, links, and images become real Word formatting; the ' +
        "first heading becomes the document's title. Remote images are not " +
        'downloaded: they appear as links (fetch one yourself and pass it as ' +
        'a data: URI to embed it). Returns the path and size of the .docx.',
      inputSchema: {
        markdown: z
          .string()
          .optional()
          .describe('The Markdown to convert. Omit when passing path.'),
        path: z
          .string()
          .optional()
          .describe(
            'Path to a Markdown file (.md, .markdown, .mdown, or .txt) to ' +
              'convert, instead of markdown. Relative paths resolve against ' +
              "the server's working directory, so prefer an absolute path."
          ),
        output_path: z
          .string()
          .describe(
            'Where to write the .docx; must end in .docx. Prefer an absolute ' +
              'path. Missing folders are created. Never written through a ' +
              'symlink.'
          ),
        overwrite: z
          .boolean()
          .optional()
          .describe(
            'Replace output_path if it already exists. Off by default, so ' +
              'an existing file is never clobbered by accident.'
          ),
        font_preset: z
          .enum(Object.keys(FONT_PRESETS) as [string, ...string[]])
          .optional()
          .describe(
            'Restyle the document: chinese-official sets the fonts, sizes, ' +
              'and page layout of a Chinese official document (公文) after ' +
              "GB/T 9704-2012. Omit for Word's default styling."
          ),
      },
      outputSchema: {
        output_path: z.string(),
        bytes: z.number(),
        warnings: z.array(z.string()).optional(),
      },
      annotations: {
        readOnlyHint: false,
        // It replaces an existing file when asked to (overwrite: true).
        destructiveHint: true,
        idempotentHint: false,
        // Local files only; it makes no network requests.
        openWorldHint: false,
      },
    },
    async (args) => {
      if ((args.markdown === undefined) === (args.path === undefined)) {
        return toolError('Pass exactly one of markdown or path.');
      }
      if (
        args.path !== undefined &&
        !MARKDOWN_EXTENSIONS.includes(path.extname(args.path).toLowerCase())
      ) {
        return toolError(
          `path must be a Markdown file ending in ${MARKDOWN_EXTENSIONS.join(', ')}.`
        );
      }
      if (path.extname(args.output_path).toLowerCase() !== '.docx') {
        return toolError('output_path must end in .docx.');
      }
      const output = path.resolve(args.output_path);
      try {
        const markdown =
          args.markdown ??
          (await readFile(path.resolve(args.path!), 'utf8').catch(
            (error: unknown) => {
              if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                throw new Error(`${args.path} was not found.`);
              }
              throw error;
            }
          ));
        if (markdown.trim() === '') {
          return toolError(
            'The Markdown is empty, so there is nothing to convert.'
          );
        }

        const call: Conversion = {
          warnings: [],
          skippedImages: new Set(),
        };
        const blob = await conversion.run(call, () =>
          convertMarkdownToWord(markdown, {
            fontPreset: args.font_preset
              ? FONT_PRESETS[args.font_preset]
              : undefined,
          })
        );
        const bytes = Buffer.from(await blob.arrayBuffer());
        const warnings = [...call.warnings];
        if (call.skippedImages.size > 0) {
          warnings.push(
            `${call.skippedImages.size} remote image(s) weren't downloaded, so they appear as links. To embed one, fetch it yourself and pass it as a data: URI.`
          );
        }

        await mkdir(path.dirname(output), { recursive: true });
        try {
          await writeSafely(output, bytes, args.overwrite ?? false);
        } catch (error) {
          const code = (error as NodeJS.ErrnoException).code;
          if (code === 'EEXIST') {
            return toolError(
              `${output} already exists. Pass overwrite: true to replace it, or choose another output_path.`
            );
          }
          if (code === 'ELOOP') {
            return toolError(
              `${output} is a symlink; refusing to write through it.`
            );
          }
          throw error;
        }

        const result = {
          output_path: output,
          bytes: bytes.byteLength,
          ...(warnings.length > 0 && { warnings }),
        };
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
          structuredContent: result,
        };
      } catch (error) {
        return toolError(
          error instanceof Error ? error.message : String(error)
        );
      }
    }
  );

  return server;
}

export async function startMcpServer(version: string): Promise<void> {
  await createMcpServer(version).connect(new StdioServerTransport());
}

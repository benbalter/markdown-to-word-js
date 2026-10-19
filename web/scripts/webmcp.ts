// WebMCP tools: let an AI agent in the visitor's browser use the converter
// directly (https://webmachinelearning.github.io/webmcp/). Ported from
// word2md.com's web/scripts/converter/webmcp.ts. The tool runs in this page,
// through the same conversion as the Convert button, so nothing is uploaded
// any more than it is for a person. Browsers without WebMCP skip this.
//
// The spec moved the entry point from navigator.modelContext to
// document.modelContext, and both still ship, so detect either.

interface ToolResult {
  content: { type: 'text'; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

interface ModelContextTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean };
  execute: (input: Record<string, unknown>) => Promise<ToolResult>;
}

interface ModelContext {
  registerTool(tool: ModelContextTool): unknown;
}

export interface WebMcpConverter {
  /** The font preset names the page offers (FONT_PRESETS' keys). */
  fontPresets: string[];
  /**
   * Convert Markdown and show the result on the page, as the Convert button
   * would. Resolves with the .docx and its file name, or rejects with the
   * error the page shows.
   */
  convert(
    markdown: string,
    options: { filename?: string; fontPreset?: string }
  ): Promise<{ filename: string; blob: Blob }>;
}

function modelContext(): ModelContext | undefined {
  const holder = (target: object): ModelContext | undefined =>
    (target as { modelContext?: ModelContext }).modelContext;
  return holder(document) ?? holder(navigator);
}

function error(message: string): ToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  // In chunks: String.fromCharCode with one argument per byte would overflow
  // the call stack on a large document.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/** Register the tool if the browser supports WebMCP; otherwise do nothing. */
export function registerWebMcpTools(converter: WebMcpConverter): void {
  const context = modelContext();
  if (!context) return;

  const tool: ModelContextTool = {
    name: 'convert_markdown_to_docx',
    description:
      'Convert GitHub Flavored Markdown to a formatted Word (.docx) ' +
      "document, in this browser tab. The Markdown never leaves the user's " +
      'device. The result also appears on the page for the user, and the ' +
      'page tries to download it (the browser may block a download the user ' +
      "didn't start). Returns the file name, its size, and the .docx as " +
      'base64.',
    inputSchema: {
      type: 'object',
      properties: {
        markdown: { type: 'string', description: 'The Markdown to convert.' },
        filename: {
          type: 'string',
          description:
            'File name for the .docx, e.g. "report.docx". Defaults to the ' +
            "first heading's text.",
        },
        font_preset: {
          type: 'string',
          enum: ['default', ...converter.fontPresets],
          description:
            "default is Word's standard styling; chinese-official sets the " +
            'fonts, sizes, and page layout of a Chinese official document ' +
            "(公文). Omit to use the page's Style menu as it is.",
        },
      },
      required: ['markdown'],
    },
    async execute(input) {
      const markdown = typeof input.markdown === 'string' ? input.markdown : '';
      if (markdown.trim() === '') return error('markdown is empty.');
      const preset = input.font_preset;
      if (
        preset !== undefined &&
        preset !== 'default' &&
        !converter.fontPresets.includes(String(preset))
      ) {
        return error(
          `Unknown font_preset ${JSON.stringify(preset)}. Use one of: default, ${converter.fontPresets.join(', ')}.`
        );
      }
      try {
        const { filename, blob } = await converter.convert(markdown, {
          filename:
            typeof input.filename === 'string' && input.filename
              ? input.filename
              : undefined,
          fontPreset:
            preset === undefined
              ? undefined
              : preset === 'default'
                ? ''
                : String(preset),
        });
        const result = {
          filename,
          bytes: blob.size,
          docx_base64: await blobToBase64(blob),
        };
        return {
          content: [
            {
              type: 'text',
              text: `Converted to ${filename} (${blob.size} bytes). The .docx is in structuredContent.docx_base64.`,
            },
          ],
          structuredContent: result,
        };
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    },
  };

  try {
    context.registerTool(tool);
  } catch (e) {
    // e.g. a tool of the same name from another script. The page works
    // without it.
    console.warn(`[md2word] Couldn't register WebMCP tool ${tool.name}`, e);
  }
}

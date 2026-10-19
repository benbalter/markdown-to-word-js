// @vitest-environment node
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'fs';
import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import os from 'os';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import mammoth from 'mammoth';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { cliPath } from './build-cli.ts';

// The local MCP server (`md2w mcp`, src/mcp.ts), driven the way an agent
// would: spawn the built CLI and talk to it over stdio with the SDK's client.
// test/build-cli.ts builds it first when it's stale.

interface TextContent {
  type: 'text';
  text: string;
}

let client: Client;
let tmp: string;
// A local image server, to prove the tool never requests from it.
let imageServer: Server;
let imageRequests = 0;
let imageUrl: string;

beforeAll(async () => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'md2w-mcp-'));
  imageServer = createServer((_req, res) => {
    imageRequests++;
    res.writeHead(200, { 'Content-Type': 'image/png' }).end('fake');
  });
  await new Promise<void>((resolve) =>
    imageServer.listen(0, '127.0.0.1', resolve)
  );
  imageUrl = `http://127.0.0.1:${(imageServer.address() as AddressInfo).port}/a.png`;
  client = new Client({ name: 'test', version: '0.0.0' });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [cliPath, 'mcp'],
      cwd: tmp,
    })
  );
}, 60000);

afterAll(async () => {
  await client?.close();
  imageServer?.close();
  rmSync(tmp, { recursive: true, force: true });
});

function convert(
  args: Record<string, unknown>
): ReturnType<typeof client.callTool> {
  return client.callTool({ name: 'convert_markdown_to_word', arguments: args });
}

function errorText(result: Awaited<ReturnType<typeof convert>>): string {
  expect(result.isError).toBe(true);
  return (result.content as TextContent[])[0].text;
}

describe('md2w mcp', () => {
  it('advertises the conversion tool and how to use it', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(['convert_markdown_to_word']);
    expect(tools[0].inputSchema.required).toEqual(['output_path']);
    expect(tools[0].annotations).toMatchObject({
      destructiveHint: true,
      idempotentHint: false,
    });
    expect(client.getInstructions()).toContain('overwrite');
    // The maker's book is mentioned once, here, as information.
    expect(client.getInstructions()).toContain('open-and-async.com');
  });

  it('converts a Markdown string to a .docx', async () => {
    const output = path.join(tmp, 'nested', 'hello.docx');
    const result = await convert({
      markdown: '# Hello\n\n- [x] done\n',
      output_path: output,
    });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({
      output_path: output,
      bytes: statSync(output).size,
    });
    // ...and never in a result or the document: those are the user's.
    expect(JSON.stringify(result)).not.toMatch(/open.and.async/i);
    const { value } = await mammoth.convertToHtml({
      buffer: readFileSync(output),
    });
    expect(value).toContain('<h1>Hello</h1>');
    expect(value).not.toMatch(/open.and.async/i);
  });

  it('converts a Markdown file with a font preset', async () => {
    const input = path.join(tmp, 'notice.md');
    writeFileSync(input, '# 通知\n\n正文。\n');
    const output = path.join(tmp, 'notice.docx');
    const result = await convert({
      path: input,
      output_path: output,
      font_preset: 'chinese-official',
    });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ output_path: output });
    expect(statSync(output).size).toBeGreaterThan(0);
  });

  it('refuses to replace an existing file unless told to', async () => {
    const output = path.join(tmp, 'keep.docx');
    writeFileSync(output, 'precious');

    const refused = await convert({ markdown: '# New', output_path: output });
    expect(errorText(refused)).toMatch(/already exists.*overwrite: true/);
    expect(readFileSync(output, 'utf8')).toBe('precious');

    const replaced = await convert({
      markdown: '# New',
      output_path: output,
      overwrite: true,
    });
    expect(replaced.isError).toBeFalsy();
    expect(readFileSync(output, 'utf8')).not.toBe('precious');
  });

  it('reports bad input as a tool error, not a crash', async () => {
    const output = path.join(tmp, 'never.docx');
    expect(errorText(await convert({ output_path: output }))).toMatch(
      /exactly one/
    );
    expect(
      errorText(
        await convert({ markdown: '# A', path: 'a.md', output_path: output })
      )
    ).toMatch(/exactly one/);
    expect(
      errorText(
        await convert({
          path: path.join(tmp, 'does-not-exist.md'),
          output_path: output,
        })
      )
    ).toMatch(/not found/);
    expect(
      errorText(await convert({ markdown: ' \n', output_path: output }))
    ).toMatch(/empty/);
  });

  it('reads only Markdown files and writes only .docx files', async () => {
    const output = path.join(tmp, 'never.docx');
    expect(
      errorText(await convert({ path: '/etc/passwd', output_path: output }))
    ).toMatch(/path must be a Markdown file/);
    expect(
      errorText(
        await convert({ markdown: '# A', output_path: path.join(tmp, 'a.sh') })
      )
    ).toMatch(/must end in \.docx/);
  });

  it('never writes through a symlink, even with overwrite', async () => {
    const target = path.join(tmp, 'target.txt');
    writeFileSync(target, 'precious');
    const link = path.join(tmp, 'link.docx');
    symlinkSync(target, link);

    const result = await convert({
      markdown: '# A',
      output_path: link,
      overwrite: true,
    });
    expect(errorText(result)).toMatch(/is a symlink/);
    expect(readFileSync(target, 'utf8')).toBe('precious');
  });

  it("doesn't fetch remote images", async () => {
    const output = path.join(tmp, 'image.docx');
    const result = await convert({
      markdown: `# Pic\n\n![a chart](${imageUrl})\n`,
      output_path: output,
    });
    expect(result.isError).toBeFalsy();
    expect(imageRequests).toBe(0);
    expect(
      (result.structuredContent as { warnings: string[] }).warnings
    ).toEqual([expect.stringMatching(/1 remote image.*data: URI/)]);
    const { value } = await mammoth.convertToHtml({
      buffer: readFileSync(output),
    });
    expect(value).toContain('a chart');
  });

  it.each([
    [
      'raw uppercase HTML',
      (url: string): string => `<IMG SRC="${url}" ALT="raw">`,
    ],
    [
      'an SVG image',
      (url: string): string =>
        `<svg width="10" height="10"><image href="${url}" /></svg>`,
    ],
  ])("doesn't fetch an image in %s either", async (_name, html) => {
    const output = path.join(tmp, `raw-${Math.random()}.docx`);
    const result = await convert({
      markdown: `# Raw\n\n${html(imageUrl)}\n`,
      output_path: output,
    });
    expect(result.isError).toBeFalsy();
    expect(imageRequests).toBe(0);
  });

  it('handles overlapping calls', async () => {
    const results = await Promise.all(
      ['one', 'two', 'three'].map((name) =>
        convert({
          markdown: `# ${name}`,
          output_path: path.join(tmp, 'parallel', `${name}.docx`),
        })
      )
    );
    for (const result of results) expect(result.isError).toBeFalsy();
  });
});

// @vitest-environment node
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'fs';
import { spawn } from 'child_process';
import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import os from 'os';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import mammoth from 'mammoth';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/sdk/types.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { cliPath } from './build-cli.ts';
import { mcpbManifest } from '../scripts/mcpb-manifest.mjs';

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

  // The SDK client skips lines it can't parse, so read the raw stream.
  it('writes only JSON-RPC to stdout, even when the generator logs', async () => {
    const server = spawn(process.execPath, [cliPath, 'mcp'], { cwd: tmp });
    const closed = new Promise((resolve) => server.once('close', resolve));
    let stdout = '';
    server.stdout.on('data', (chunk: Buffer) => (stdout += chunk));
    // Complete (newline-terminated) lines only: a chunk can end mid-message.
    const completeLines = (): string[] =>
      stdout
        .split('\n')
        .slice(0, -1)
        .filter((line) => line !== '');
    const isResponseTo = (line: string, id: number): boolean => {
      try {
        return (JSON.parse(line) as { id?: unknown }).id === id;
      } catch {
        return false;
      }
    };
    const send = (message: object): void => {
      server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
    };
    try {
      send({
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: LATEST_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'raw', version: '0.0.0' },
        },
      });
      send({ method: 'notifications/initialized' });
      // A data: image that won't decode makes html-to-docx console.log a
      // [DEBUG] line.
      send({
        id: 2,
        method: 'tools/call',
        params: {
          name: 'convert_markdown_to_word',
          arguments: {
            markdown:
              '# Hi\n\n<img src="data:image/png;base64,AAAA" alt="x">\n',
            output_path: path.join(tmp, 'broken-image.docx'),
          },
        },
      });
      await expect
        .poll(() => completeLines().some((line) => isResponseTo(line, 2)), {
          timeout: 20000,
        })
        .toBe(true);
      const lines = completeLines();
      expect(lines.length).toBeGreaterThanOrEqual(2);
      for (const line of lines) expect(() => JSON.parse(line)).not.toThrow();
    } finally {
      // Even when the poll times out, so the child can't hold the run open.
      server.kill();
      await closed;
    }
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

// The Claude Desktop bundle's manifest (scripts/mcpb-manifest.mjs).
// pack-mcpb.mjs fills its tools from the server and runs the full
// `mcpb validate`; this keeps the parts it can't catch until release time.
describe('MCPB manifest', () => {
  const root = path.resolve(path.dirname(cliPath), '..');
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));

  it('lists exactly the tools the server advertises', async () => {
    const { tools } = await client.listTools();
    const manifest = mcpbManifest(pkg, tools);
    expect(manifest.tools).toEqual(
      tools.map(({ name, description }) => ({ name, description }))
    );
    expect(manifest.tools.map((t: { name: string }) => t.name)).toEqual([
      'convert_markdown_to_word',
    ]);
  });

  it("has the spec's required fields and starts the mcp subcommand", () => {
    const manifest = mcpbManifest(pkg, []);
    expect(manifest).toMatchObject({
      manifest_version: '0.3',
      name: pkg.name,
      version: pkg.version,
      description: pkg.description,
      author: { name: 'Ben Balter' },
      server: {
        type: 'node',
        entry_point: 'build/cli.js',
        mcp_config: {
          command: 'node',
          args: ['${__dirname}/build/cli.js', 'mcp'],
        },
      },
    });
    // The bundle ships the built CLI the manifest points at.
    expect(pkg.bin.md2w).toBe(manifest.server.entry_point);
    expect(manifest.compatibility.platforms).toEqual(
      expect.arrayContaining(['darwin', 'win32'])
    );
    expect(existsSync(path.join(root, 'public/icon-512.png'))).toBe(true);
  });
});

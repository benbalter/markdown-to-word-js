// @vitest-environment node
import { spawnSync } from 'child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import mammoth from 'mammoth';
import { cliPath } from './build-cli.ts';

// The `md2w` CLI (src/cli.ts), run as a user would: the built file in a
// child process. test/build-cli.ts builds it first when it's stale.

let tmp: string;

function md2w(
  args: string[],
  input?: string
): { status: number | null; stdout: Buffer; stderr: string } {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: tmp,
    input: input ?? '',
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr.toString(),
  };
}

async function docxHtml(bytes: Buffer): Promise<string> {
  return (await mammoth.convertToHtml({ buffer: bytes })).value;
}

beforeAll(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'md2w-cli-'));
  writeFileSync(path.join(tmp, 'notes.md'), '# Notes\n\nSome **bold** text.\n');
});

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('md2w', () => {
  it('writes the .docx next to the input by default', async () => {
    const { status, stderr } = md2w(['notes.md']);
    expect(status).toBe(0);
    expect(stderr).toContain('Wrote notes.docx');
    const html = await docxHtml(readFileSync(path.join(tmp, 'notes.docx')));
    expect(html).toContain('<h1>Notes</h1>');
    expect(html).toContain('<strong>bold</strong>');
  });

  it('writes to -o, creating folders, and stays quiet with -q', () => {
    const { status, stderr } = md2w(['-q', '-o', 'out/a.docx', 'notes.md']);
    expect(status).toBe(0);
    expect(stderr).toBe('');
    expect(existsSync(path.join(tmp, 'out/a.docx'))).toBe(true);
  });

  it('reads stdin and writes the .docx to stdout with -o -', async () => {
    const { status, stdout } = md2w(['-', '-o', '-'], '# From stdin\n');
    expect(status).toBe(0);
    expect(await docxHtml(stdout)).toContain('<h1>From stdin</h1>');
  });

  it("keeps the generator's logging out of a .docx on stdout", () => {
    // A data: image that won't decode makes html-to-docx console.log a
    // [DEBUG] line, and console.error an [ERROR] one.
    const markdown = '# Hi\n\n<img src="data:image/png;base64,AAAA" alt="x">\n';
    const loud = md2w(['-', '-o', '-'], markdown);
    expect(loud.status).toBe(0);
    expect(loud.stdout.subarray(0, 2).toString()).toBe('PK');
    const quiet = md2w(['-q', '-', '-o', '-'], markdown);
    expect(quiet.status).toBe(0);
    expect(quiet.stdout.subarray(0, 2).toString()).toBe('PK');
    expect(quiet.stderr).toBe('');
  });

  it('applies a font preset', () => {
    const { status } = md2w([
      '--font-preset',
      'chinese-official',
      '-o',
      'preset.docx',
      'notes.md',
    ]);
    expect(status).toBe(0);
    expect(existsSync(path.join(tmp, 'preset.docx'))).toBe(true);
  });

  it('asks for -o when reading stdin', () => {
    const { status, stderr } = md2w(['-'], '# Hi\n');
    expect(status).toBe(1);
    expect(stderr).toMatch(/Pass -o/);
  });

  it('says when the input is missing or empty', () => {
    expect(md2w(['missing.md']).stderr).toContain('missing.md was not found.');
    expect(md2w(['-', '-o', 'x.docx'], '  \n').stderr).toContain(
      'Nothing was piped to stdin'
    );
  });

  it('refuses a Word file instead of overwriting it', () => {
    const original = Buffer.from('PK\u0003\u0004 not really a docx');
    writeFileSync(path.join(tmp, 'report.docx'), original);
    const { status, stderr } = md2w(['report.docx']);
    expect(status).toBe(1);
    expect(stderr).toContain('report.docx is already a Word document');
    expect(stderr).toContain('word-to-markdown');
    expect(readFileSync(path.join(tmp, 'report.docx'))).toEqual(original);
  });

  it('quotes a Word file name with spaces in the suggested command', () => {
    writeFileSync(path.join(tmp, "Q3 plan's.docx"), 'PK\u0003\u0004');
    const { stderr } = md2w(["Q3 plan's.docx"]);
    expect(stderr).toContain(
      `npx word-to-markdown 'Q3 plan'\\''s.docx' > 'Q3 plan'\\''s.md'`
    );
  });

  it('refuses to write the .docx over its input', () => {
    const original = '# Odd name\n';
    writeFileSync(path.join(tmp, 'odd.txt'), original);
    const { status, stderr } = md2w(['-o', './odd.txt', 'odd.txt']);
    expect(status).toBe(1);
    expect(stderr).toContain('would overwrite it');
    expect(readFileSync(path.join(tmp, 'odd.txt'), 'utf8')).toBe(original);
  });

  it('refuses binary input', () => {
    writeFileSync(path.join(tmp, 'blob.md'), Buffer.from([0x50, 0x4b, 0, 1]));
    const { status, stderr } = md2w(['-o', 'blob.docx', 'blob.md']);
    expect(status).toBe(1);
    expect(stderr).toContain("doesn't look like a Markdown or text file");
    expect(existsSync(path.join(tmp, 'blob.docx'))).toBe(false);
  });

  it('rejects an unknown font preset', () => {
    const { status, stderr } = md2w(['--font-preset', 'nope', 'notes.md']);
    expect(status).not.toBe(0);
    expect(stderr).toContain('chinese-official');
  });
});

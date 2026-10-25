#!/usr/bin/env node

// The `md2w` command (also installed as `markdown-to-word`): converts a
// Markdown file, or stdin, to a .docx on disk. Patterned on word2md.com's
// `w2m` CLI (benbalter/word-to-markdown-js), in reverse. It loads the Node
// entry, which supplies the DOM APIs the converter needs.

import { Command, Option } from 'commander';
import { createRequire } from 'module';
import { mkdir, readFile, stat, writeFile } from 'fs/promises';
import path from 'path';
import { convertMarkdownToWord, FONT_PRESETS } from './node.js';
import { looksBinary, WORD_FILE } from './input-checks.js';

// Read our own version from package.json. createRequire resolves relative to
// this module, so `../package.json` points at the package root both from the
// TypeScript source (src/) and the compiled CLI (build/) after publish.
const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

/** `notes.md` → `notes.docx`, next to the input. */
function defaultOutputPath(input: string): string {
  const { dir, name } = path.parse(input);
  return path.join(dir, `${name}.docx`);
}

/**
 * Whether `a` and `b` are the same file on disk. Compares inodes, not paths,
 * so a symlink or a different case on a case-insensitive disk still counts.
 * BigInt stats, because some filesystems hand out inode numbers above
 * Number.MAX_SAFE_INTEGER, where two different files could round to the same
 * number.
 */
async function isSameFile(a: string, b: string): Promise<boolean> {
  const [statA, statB] = await Promise.all([
    stat(a, { bigint: true }).catch(() => undefined),
    stat(b, { bigint: true }).catch(() => undefined),
  ]);
  return (
    statA !== undefined &&
    statB !== undefined &&
    statA.dev === statB.dev &&
    statA.ino === statB.ino
  );
}

/**
 * `value` as one shell word, for commands we print for the user to copy.
 * Plain names stay bare so the common case reads cleanly.
 */
function shellQuote(value: string): string {
  return /^[\w@%+=:,./-]+$/.test(value)
    ? value
    : `'${value.replaceAll("'", "'\\''")}'`;
}

// html-to-docx logs as it works: debug lines with console.log, which would
// land in front of a .docx written to stdout, and skipped images or a missing
// sharp with console.warn and console.error. The convert action sends the
// console.log family to stderr, and with -q drops all of it while the
// generator runs; our own errors print afterward. (`md2w mcp` has its own
// guard in src/mcp.ts.)
async function withConsoleSilenced<T>(run: () => Promise<T>): Promise<T> {
  const saved = { ...console };
  const silent = (): void => {};
  console.log = console.info = console.debug = silent;
  console.warn = console.error = silent;
  try {
    return await run();
  } finally {
    Object.assign(console, saved);
  }
}

const EXAMPLES = `
Examples:
  $ md2w report.md                 # writes report.docx
  $ md2w report.md -o out/report.docx
  $ md2w --font-preset chinese-official notice.md
  $ cat reply.md | md2w -o reply.docx
  $ md2w - -o - < report.md > report.docx`;

const program = new Command();
program.name('md2w');
program.description('Convert Markdown to a formatted Word (.docx) document');
program.version(version);
program.addHelpText(
  'after',
  `\nRun "md2w convert --help" for all conversion options.\n${EXAMPLES}`
);
program
  .command('mcp')
  .description(
    'Run a local MCP server on stdio so AI agents can convert Markdown to ' +
      '.docx files on this machine (e.g. claude mcp add markdown-to-word -- ' +
      'npx -y markdown-to-word mcp)'
  )
  .action(async () => {
    // Loaded only here, so conversions never pay for the MCP SDK.
    const { startMcpServer } = await import('./mcp.js');
    await startMcpServer(version);
  });
const convert = program
  .command('convert', { isDefault: true })
  .argument(
    '[file]',
    'The Markdown file to convert. Use - (or omit it and pipe the Markdown ' +
      'in) to read from stdin.'
  )
  .option(
    '-o, --output <file>',
    'Write the .docx to <file> (- means stdout). Defaults to the input ' +
      'file name with .docx; required when reading stdin.'
  )
  .addOption(
    new Option(
      '--font-preset <name>',
      'Restyle the document with a font preset, e.g. chinese-official for ' +
        'a Chinese official document (公文) after GB/T 9704-2012'
    ).choices(Object.keys(FONT_PRESETS))
  )
  .option('-q, --quiet', 'Print nothing to stderr except errors')
  .addHelpText('after', EXAMPLES)
  .action(async (file: string | undefined, options) => {
    const toStderr = console.error.bind(console);
    console.log = console.info = console.debug = toStderr;
    const note = (message: string): void => {
      if (!options.quiet) console.error(message);
    };
    try {
      // An explicit `-`, or no file with something piped in, reads stdin. No
      // file at an interactive terminal would just hang, so ask for one.
      const fromStdin = file === '-' || (!file && !process.stdin.isTTY);
      if (!file && !fromStdin) {
        convert.help({ error: true });
      }
      // A Word file would otherwise be read as garbage text and, with no -o,
      // written back over itself as report.docx.
      if (!fromStdin && WORD_FILE.test(file as string)) {
        throw new Error(
          `${file} is already a Word document. To turn it into Markdown, use word2md.com or its CLI: npx word-to-markdown ${shellQuote(file as string)} > ${shellQuote(`${path.parse(file as string).name}.md`)}`
        );
      }
      if (fromStdin && !options.output) {
        throw new Error(
          'Reading from stdin, so there is no file name to name the .docx after. Pass -o report.docx (or -o - for stdout).'
        );
      }

      const markdown = fromStdin
        ? await readStdin()
        : await readFile(file as string, 'utf8').catch((error: unknown) => {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
              throw new Error(`${file} was not found.`);
            }
            throw error;
          });
      if (markdown.trim() === '') {
        throw new Error(
          fromStdin
            ? 'Nothing was piped to stdin. Pass a Markdown file, or pipe one in: md2w -o report.docx < report.md'
            : `${file} is empty.`
        );
      }
      if (looksBinary(markdown)) {
        throw new Error(
          `${fromStdin ? 'stdin' : file} doesn't look like a Markdown or text file, so it can't be converted.`
        );
      }

      const output: string = options.output ?? defaultOutputPath(file!);
      if (
        output !== '-' &&
        !fromStdin &&
        (await isSameFile(output, file as string))
      ) {
        throw new Error(
          `${output} is the input file, so writing the .docx there would overwrite it. Pass a different -o.`
        );
      }

      const generate = (): Promise<Blob> =>
        convertMarkdownToWord(markdown, {
          fontPreset: options.fontPreset
            ? FONT_PRESETS[options.fontPreset]
            : undefined,
        });
      const blob = options.quiet
        ? await withConsoleSilenced(generate)
        : await generate();
      const bytes = Buffer.from(await blob.arrayBuffer());

      if (output === '-') {
        process.stdout.write(bytes);
      } else {
        await mkdir(path.dirname(output), { recursive: true });
        await writeFile(output, bytes);
        note(`Wrote ${output}`);
      }
    } catch (error) {
      console.error(
        'Error:',
        error instanceof Error ? error.message : String(error)
      );
      process.exit(1);
    }
  });

await program.parseAsync();

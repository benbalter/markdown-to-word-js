import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { convertMarkdownToWord } from '../src/converter';

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures'
);

/** Read a markdown fixture by base name (without .md extension) */
function readFixture(fixtureName: string): string {
  const fixturePath = join(fixturesDir, `${fixtureName}.md`);
  return readFileSync(fixturePath, 'utf-8');
}

/*
 * =====================================================
 * Fixture-based tests for convertMarkdownToWord
 * =====================================================
 */
describe('Fixture tests: convertMarkdownToWord', () => {
  it('produces a non-empty Blob from simple markdown', async () => {
    const output = await convertMarkdownToWord('# Greeting\n\nHello!');
    expect(output).toBeInstanceOf(Blob);
    expect(output.size).toBeGreaterThan(0);
  });

  it('produces a Blob from the headings fixture', async () => {
    const output = await convertMarkdownToWord(readFixture('headings'));
    expect(output).toBeInstanceOf(Blob);
    expect(output.size).toBeGreaterThan(0);
  });

  it('produces a Blob from the text-formatting fixture', async () => {
    const output = await convertMarkdownToWord(
      readFixture('text-formatting')
    );
    expect(output).toBeInstanceOf(Blob);
    expect(output.size).toBeGreaterThan(0);
  });

  it('produces a Blob from the table fixture', async () => {
    const output = await convertMarkdownToWord(readFixture('table'));
    expect(output).toBeInstanceOf(Blob);
    expect(output.size).toBeGreaterThan(0);
  });

  it('produces a Blob from the mixed fixture', async () => {
    const output = await convertMarkdownToWord(readFixture('mixed'));
    expect(output).toBeInstanceOf(Blob);
    expect(output.size).toBeGreaterThan(0);
  });

  it('handles empty markdown without throwing', async () => {
    const output = await convertMarkdownToWord('');
    expect(output).toBeInstanceOf(Blob);
  });

  it('accepts custom page-margin options', async () => {
    const output = await convertMarkdownToWord('# Margins Test', {
      pageMargins: { top: 1.5, right: 1, bottom: 1.5, left: 1 },
    });
    expect(output).toBeInstanceOf(Blob);
    expect(output.size).toBeGreaterThan(0);
  });
});

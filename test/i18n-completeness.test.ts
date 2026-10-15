import { readFileSync, readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import { locales } from '../web/i18n/locales.ts';

// Completeness guard for the translation dictionaries. `astro check` only
// reports diagnostics for .astro files, so it does NOT catch a missing or extra
// key inside the imported JSON. Every locale must structurally match the
// English source (same keys, same array lengths, no blank strings).

const i18nDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../web/i18n'
);

function load(locale: string): unknown {
  return JSON.parse(readFileSync(path.join(i18nDir, `${locale}.json`), 'utf8'));
}

// Flatten to the set of dotted leaf paths (array indices included), so missing
// keys, extra keys, and differing array lengths all surface as a set mismatch.
function leafPaths(value: unknown, prefix = ''): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((v, i) => leafPaths(v, `${prefix}[${i}]`));
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) =>
      leafPaths(v, prefix ? `${prefix}.${k}` : k)
    );
  }
  return [prefix];
}

function leafValues(value: unknown): unknown[] {
  if (Array.isArray(value)) return value.flatMap(leafValues);
  if (value && typeof value === 'object') {
    return Object.values(value).flatMap(leafValues);
  }
  return [value];
}

const localeFiles = readdirSync(i18nDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace(/\.json$/, ''))
  .sort();

const enPaths = leafPaths(load('en')).sort();

describe('i18n dictionary completeness', () => {
  it('has exactly one dictionary per locale in locales.ts', () => {
    expect(localeFiles).toEqual([...locales].sort());
  });

  it.each(localeFiles)(
    '%s has exactly the same keys/structure as en',
    (locale) => {
      const paths = leafPaths(load(locale)).sort();
      const missing = enPaths.filter((p) => !paths.includes(p));
      const extra = paths.filter((p) => !enPaths.includes(p));
      expect({ locale, missing, extra }).toEqual({
        locale,
        missing: [],
        extra: [],
      });
    }
  );

  it.each(localeFiles)('%s has no blank string values', (locale) => {
    const blanks = leafValues(load(locale)).filter(
      (value) => typeof value === 'string' && value.trim() === ''
    );
    expect(blanks).toEqual([]);
  });
});

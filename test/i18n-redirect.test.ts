import { describe, expect, it } from 'vitest';
import {
  pickLocale,
  pickSuggestion,
  SUPPORTED_LOCALES,
} from '../worker/index.js';

// Unit tests for the Accept-Language matching used by the Cloudflare Worker
// edge redirect (worker/index.js). The Worker itself runs on the CF runtime,
// but the locale-selection logic is pure and worth pinning down.

describe('pickLocale', () => {
  it('returns null when English ranks highest (stay on the root)', () => {
    expect(pickLocale('en-US,en;q=0.9')).toBeNull();
    expect(pickLocale('en')).toBeNull();
  });

  it('matches a supported language by its base tag', () => {
    expect(pickLocale('id-ID,id;q=0.9,en;q=0.8')).toBe('id');
    expect(pickLocale('es')).toBe('es');
    expect(pickLocale('es-MX,es;q=0.9')).toBe('es');
    expect(pickLocale('vi-VN')).toBe('vi');
  });

  it('maps regional Portuguese variants to pt', () => {
    expect(pickLocale('pt-BR,pt;q=0.9')).toBe('pt');
    expect(pickLocale('pt-PT')).toBe('pt');
  });

  it('sends Simplified Chinese tags to zh', () => {
    for (const tag of ['zh', 'zh-CN', 'zh-SG', 'zh-Hans', 'zh-Hans-CN']) {
      expect(pickLocale(`${tag},en;q=0.8`)).toBe('zh');
    }
  });

  it('sends Traditional Chinese readers to zh-hant, never Simplified', () => {
    for (const tag of ['zh-TW', 'zh-HK', 'zh-MO', 'zh-Hant', 'zh-Hant-TW']) {
      expect(pickLocale(`${tag},en;q=0.8`)).toBe('zh-hant');
      expect(pickLocale(`${tag},zh;q=0.9`)).toBe('zh-hant');
    }
    // Only the zh prefix counts: a lookalike tag isn't Chinese at all.
    expect(pickLocale('zhx-TW')).toBeNull();
  });

  it('honors q-value priority over list order', () => {
    expect(pickLocale('en;q=0.5,es;q=0.9')).toBe('es');
    expect(pickLocale('es;q=0.3,en;q=0.9')).toBeNull();
  });

  it('treats q=0 as "not acceptable", not as a low preference', () => {
    expect(pickLocale('pt;q=0')).toBeNull();
    expect(pickLocale('pt;q=0, es;q=0.5')).toBe('es');
  });

  it('skips unsupported languages', () => {
    expect(pickLocale('fa,he;q=0.9')).toBeNull();
    expect(pickLocale('el-GR,el;q=0.9')).toBeNull();
    expect(pickLocale('fa,es;q=0.8')).toBe('es');
  });

  it('handles empty / missing / wildcard input', () => {
    expect(pickLocale('')).toBeNull();
    expect(pickLocale(null)).toBeNull();
    expect(pickLocale(undefined)).toBeNull();
    expect(pickLocale('*')).toBeNull();
  });

  it('only lists non-default locales (English stays at the root)', () => {
    expect(SUPPORTED_LOCALES).not.toContain('en');
    expect(SUPPORTED_LOCALES.length).toBeGreaterThan(0);
  });

  it('keeps the "unsupported" fixtures above genuinely unsupported', () => {
    // If one of these languages is ever added, pick different codes for the
    // "skips unsupported languages" case.
    for (const code of ['fa', 'he', 'el']) {
      expect(SUPPORTED_LOCALES).not.toContain(code);
    }
  });
});

describe('pickSuggestion', () => {
  it('suggests a supported language listed after English', () => {
    expect(pickSuggestion('en-US,en;q=0.9,id;q=0.8', undefined)).toBe('id');
    expect(pickSuggestion('en,zh-CN;q=0.7', undefined)).toBe('zh');
    expect(pickSuggestion('en,zh-TW;q=0.7', 'TW')).toBe('zh-hant');
  });

  it("falls back to the visitor's country", () => {
    expect(pickSuggestion('en-US,en;q=0.9', 'ID')).toBe('id');
    expect(pickSuggestion('en-US', 'VN')).toBe('vi');
    expect(pickSuggestion(null, 'ID')).toBe('id');
  });

  it('prefers the Accept-Language signal over the country', () => {
    expect(pickSuggestion('en,vi;q=0.5', 'ID')).toBe('vi');
  });

  it('suggests nothing without a signal', () => {
    expect(pickSuggestion('en-US,en;q=0.9', 'US')).toBeNull();
    expect(pickSuggestion('en-US,en;q=0.9', undefined)).toBeNull();
    expect(pickSuggestion('en,fa;q=0.8', 'IR')).toBeNull();
    expect(pickSuggestion(null, null)).toBeNull();
  });

  it('never suggests a language the browser marks q=0', () => {
    expect(pickSuggestion('en, es;q=0')).toBeNull();
  });

  it('respects a visitor who chose English over a preferred language', () => {
    // A browser that prefers Spanish is redirected on its first visit, so one
    // still on the English root picked English.
    expect(pickSuggestion('es-ES,es;q=0.9,en;q=0.8', 'ES')).toBeNull();
    expect(pickSuggestion('id', 'ID')).toBeNull();
  });
});

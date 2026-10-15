import { readFileSync, readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import { SITE_HOST, SITE_URL } from '../web/site.ts';

// web/site.ts is the single source of truth for the domain. The static files in
// public/ can't import it, so this guards them: every md2word URL must be on the
// configured host, and the sitemap pointer must match. Changing SITE_HOST makes
// this fail until public/ is updated too.

const publicDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../public'
);

const textFiles = readdirSync(publicDir, { recursive: true, encoding: 'utf8' })
  .filter((file) => /\.(txt|xml|json|webmanifest)$|_headers$/.test(file))
  .sort();

describe('public/ URLs match web/site.ts', () => {
  it('finds the static text files', () => {
    expect(textFiles).toContain('robots.txt');
  });

  it.each(textFiles)('%s only links to the configured host', (file) => {
    const text = readFileSync(path.join(publicDir, file), 'utf8');
    const hosts = [...text.matchAll(/https?:\/\/(md2word[^/\s)>"']*)/g)].map(
      (m) => m[1]
    );
    expect(hosts.filter((host) => host !== SITE_HOST)).toEqual([]);
  });

  it('robots.txt points at the sitemap on the site URL', () => {
    const robots = readFileSync(path.join(publicDir, 'robots.txt'), 'utf8');
    expect(robots).toContain(`Sitemap: ${SITE_URL}/sitemap-index.xml`);
  });
});

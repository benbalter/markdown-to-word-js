// Astro integration that writes dist/sw.js after the build, from the
// web/pwa/sw.js template (or web/pwa/sw-kill.js when the kill switch in
// config.ts is on). Ported from word2md.com (benbalter/word-to-markdown-js).
// Hand-rolled rather than @vite-pwa/astro, which doesn't support this Astro
// major, or workbox-build, whose generated worker serves precached HTML
// cache-first and would hide "/" from the Worker's locale redirect.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AstroIntegration } from 'astro';
import { serviceWorkerKillSwitch } from './config.ts';

const here = path.dirname(fileURLToPath(import.meta.url));

export interface ServiceWorkerBuild {
  source: string;
  version: string;
  precache: string[];
  bytes: number;
}

// Every content-hashed script Astro emits under _astro/. Unlike word2md,
// md2word has nothing to leave out: the page script, the converter
// (html-to-docx, the biggest chunk), the parser, and the three .docx patches
// are all a conversion needs. The patches must be precached rather than left
// to the runtime cache, because a patch that fails to load doesn't fail the
// conversion: patchOrKeep quietly returns the unpatched document. The cost is
// that a browser with service workers downloads the converter once after the
// page loads, even if its visitor never converts, which src/index.ts otherwise
// avoids. Fonts are cached at runtime as pages use them; HTML is never
// precached.
export function buildServiceWorker(
  distDir: string,
  { killSwitch = false }: { killSwitch?: boolean } = {}
): ServiceWorkerBuild {
  if (killSwitch) {
    return {
      source: readFileSync(path.join(here, 'sw-kill.js'), 'utf8'),
      version: 'kill',
      precache: [],
      bytes: 0,
    };
  }

  const assetDir = path.join(distDir, '_astro');
  const files = readdirSync(assetDir)
    .filter((name) => name.endsWith('.js'))
    .sort();
  const precache = files.map((name) => `/_astro/${name}`);
  const bytes = files.reduce(
    (sum, name) => sum + statSync(path.join(assetDir, name)).size,
    0
  );

  const template = readFileSync(path.join(here, 'sw.js'), 'utf8');
  // Filenames are content hashes, so the list changes whenever a chunk does;
  // hashing the template too means a change to the worker's own logic also
  // ships as a new version with fresh caches.
  const version = createHash('sha256')
    .update(template)
    .update(precache.join('\n'))
    .digest('hex')
    .slice(0, 12);

  const source = replaceOnce(
    replaceOnce(template, `'__SW_VERSION__'`, `'${version}'`),
    '/* __SW_PRECACHE__ */ []',
    JSON.stringify(precache)
  );
  return { source, version, precache, bytes };
}

function replaceOnce(text: string, token: string, value: string): string {
  const parts = text.split(token);
  if (parts.length !== 2) {
    throw new Error(`Expected ${token} exactly once in the service worker`);
  }
  return parts.join(value);
}

export default function serviceWorker(): AstroIntegration {
  return {
    name: 'md2word-service-worker',
    hooks: {
      'astro:build:done': ({ dir, logger }): void => {
        const distDir = fileURLToPath(dir);
        const build = buildServiceWorker(distDir, {
          killSwitch: serviceWorkerKillSwitch,
        });
        writeFileSync(path.join(distDir, 'sw.js'), build.source);
        logger.info(
          serviceWorkerKillSwitch
            ? 'Wrote sw.js: kill switch (unregisters installed workers)'
            : `Wrote sw.js ${build.version}: precaching ${build.precache.length} files, ${Math.round(build.bytes / 1024)} KB`
        );
      },
    },
  };
}

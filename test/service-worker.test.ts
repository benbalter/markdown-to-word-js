// @vitest-environment node
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';
import { describe, expect, it, vi } from 'vitest';
import { buildServiceWorker } from '../web/pwa/service-worker.ts';
import en from '../web/i18n/en.json';

// The offline service worker (web/pwa/) ships on every push to main, and a bad
// one keeps running on visitors' devices until a fix reaches them. These tests
// pin the rules the e2e suite can't easily see: what's precached, that
// the counter, non-GET, and cross-origin requests are never intercepted, that navigations
// stay network-first, and that /sw.js is never cached as immutable. Ported
// from word2md.com's src/__tests__/service-worker.test.ts.

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://md2word.app';

function fakeDist(files: string[]): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'md2w-sw-'));
  mkdirSync(path.join(dir, '_astro/fonts'), { recursive: true });
  for (const file of files) writeFileSync(path.join(dir, '_astro', file), 'x');
  return dir;
}

const CHUNKS = [
  'Home.astro_astro_type_script_index_0_lang.CsCu2YuR.js',
  'converter.CD0MlafF.js',
  'docx-structure.B0XNnEln.js',
  'markdown-parser.PoLhBFo1.js',
  'fonts/0869440da2f8178e.woff2',
];

describe('buildServiceWorker', () => {
  it('precaches every hashed chunk, the converter and its patches included', () => {
    const { precache, source, version } = buildServiceWorker(fakeDist(CHUNKS));
    expect(precache).toEqual([
      '/_astro/Home.astro_astro_type_script_index_0_lang.CsCu2YuR.js',
      '/_astro/converter.CD0MlafF.js',
      '/_astro/docx-structure.B0XNnEln.js',
      '/_astro/markdown-parser.PoLhBFo1.js',
    ]);
    expect(version).toMatch(/^[0-9a-f]{12}$/);
    expect(source).toContain(`const VERSION = '${version}';`);
    expect(source).toContain(`const PRECACHE = ${JSON.stringify(precache)};`);
    expect(source).not.toContain('__SW_');
  });

  it('changes version when a chunk changes', () => {
    const a = buildServiceWorker(fakeDist(CHUNKS));
    const b = buildServiceWorker(
      fakeDist(CHUNKS.map((f) => f.replace('CD0MlafF', 'Zz9kQ1aB')))
    );
    expect(a.version).not.toBe(b.version);
  });

  it('kill switch ships a worker that unregisters and never answers fetches', () => {
    const { source, precache } = buildServiceWorker(fakeDist(CHUNKS), {
      killSwitch: true,
    });
    expect(precache).toEqual([]);
    expect(source).toContain('registration.unregister()');
    expect(source).toContain('skipWaiting()');
    expect(source).not.toMatch(/addEventListener\(\s*'fetch'/);
  });

  it('kill switch clears the caches the real worker creates', () => {
    const prefix = /const PREFIX = '([^']+)'/.exec(
      readFileSync(path.join(root, 'web/pwa/sw.js'), 'utf8')
    )![1];
    const { source } = buildServiceWorker(fakeDist(CHUNKS), {
      killSwitch: true,
    });
    expect(source).toContain(`key.startsWith('${prefix}')`);
  });
});

// Run the generated worker in a sandbox with fake caches and fetch.
type Listener = (event: unknown) => void;
type CacheKey = string | Request;
interface FakeCache {
  match(req: CacheKey): Promise<Response | undefined>;
  put(req: CacheKey, res: Response): Promise<void>;
  keys(): Promise<Request[]>;
  addAll(urls: string[]): Promise<void>;
}
interface FakeWorker {
  dispatch(
    url: string,
    init?: { method?: string; mode?: string }
  ): Promise<Response | undefined>;
  fetchMock: ReturnType<typeof vi.fn>;
  open(name: string): Promise<FakeCache>;
  stores: Map<string, Map<string, Response>>;
}

function asPage(
  body: string,
  { redirected = false, type = 'text/html; charset=utf-8', status = 200 } = {}
): Response {
  const response = new Response(body, {
    status,
    headers: { 'content-type': type },
  });
  Object.defineProperty(response, 'type', { value: 'basic' });
  Object.defineProperty(response, 'redirected', { value: redirected });
  return response;
}

function loadWorker(fetchImpl: (url: string) => Promise<Response>): FakeWorker {
  const listeners: Record<string, Listener> = {};
  const stores = new Map<string, Map<string, Response>>();
  const key = (req: CacheKey): string =>
    (typeof req === 'string' ? req : req.url).split('?')[0];
  const open = async (name: string): Promise<FakeCache> => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name)!;
    return {
      match: async (req) => store.get(key(req))?.clone(),
      put: async (req, res): Promise<void> => {
        store.set(key(req), res);
      },
      keys: async () => [...store.keys()].map((url) => new Request(url)),
      addAll: async (urls): Promise<void> => {
        for (const url of urls) store.set(`${ORIGIN}${url}`, asPage(url));
      },
    };
  };
  const fetchMock = vi.fn((req: CacheKey) =>
    fetchImpl(typeof req === 'string' ? req : req.url)
  );
  const self = {
    addEventListener: (type: string, fn: Listener): void => {
      listeners[type] = fn;
    },
    location: { origin: ORIGIN },
    registration: {},
    clients: { matchAll: async (): Promise<never[]> => [] },
  };
  const { source } = buildServiceWorker(fakeDist(CHUNKS));
  vm.runInNewContext(source, {
    self,
    caches: { open, keys: async () => [...stores.keys()] },
    fetch: fetchMock,
    URL,
    Request,
    Response,
  });

  async function dispatch(
    url: string,
    init: { method?: string; mode?: string } = {}
  ): Promise<Response | undefined> {
    const request = {
      url,
      method: init.method ?? 'GET',
      mode: init.mode ?? 'cors',
    };
    let responded: Promise<Response> | undefined;
    const waits: Promise<unknown>[] = [];
    listeners.fetch({
      request,
      preloadResponse: Promise.resolve(undefined),
      respondWith: (p: Promise<Response>) => {
        responded = p;
      },
      waitUntil: (p: Promise<unknown>) => waits.push(p),
    });
    const response = responded ? await responded : undefined;
    await Promise.all(waits);
    return response;
  }

  return { dispatch, fetchMock, open, stores };
}

describe('service worker fetch handling', () => {
  const offline = (): Promise<Response> =>
    Promise.reject(new TypeError('Failed to fetch'));

  it('never intercepts the counter, non-GET requests, other origins, or plain files', async () => {
    const { dispatch } = loadWorker(offline);
    // The conversion counter's beacon (a POST), and a stray GET or navigation
    // to it: always left to the network and never cached.
    expect(
      await dispatch(`${ORIGIN}/api/event?o=success&l=en&s=drop`, {
        method: 'POST',
      })
    ).toBeUndefined();
    expect(await dispatch(`${ORIGIN}/api/event`)).toBeUndefined();
    expect(
      await dispatch(`${ORIGIN}/api/event`, { mode: 'navigate' })
    ).toBeUndefined();
    expect(
      await dispatch(`${ORIGIN}/`, { method: 'POST', mode: 'navigate' })
    ).toBeUndefined();
    // A remote image a document links to: never cached, so offline it fails
    // and the converter falls back to its alt text.
    expect(await dispatch('https://images.example/chart.png')).toBeUndefined();
    expect(
      await dispatch('https://static.cloudflareinsights.com/beacon.min.js')
    ).toBeUndefined();
    // Not a navigation and not under /_astro/: left to the network.
    expect(await dispatch(`${ORIGIN}/favicon.svg`)).toBeUndefined();
    expect(await dispatch(`${ORIGIN}/index.md`)).toBeUndefined();
  });

  it('serves navigations from the network and caches only plain HTML pages', async () => {
    const pages: Record<string, Response> = {
      [`${ORIGIN}/`]: asPage('<p>de</p>', { redirected: true }),
      [`${ORIGIN}/de/`]: asPage('<p>de</p>'),
    };
    const { dispatch, fetchMock, open, stores } = loadWorker(
      async (url) => pages[url]
    );
    expect(
      await (await dispatch(`${ORIGIN}/`, { mode: 'navigate' }))!.text()
    ).toBe('<p>de</p>');
    await dispatch(`${ORIGIN}/de/`, { mode: 'navigate' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const pagesCache = [...stores.keys()].find((k) =>
      k.startsWith('md2w-pages-')
    )!;
    const cached = await (await open(pagesCache)).keys();
    // The redirected "/" isn't stored; /de/ is.
    expect(cached.map((r) => r.url)).toEqual([`${ORIGIN}/de/`]);
  });

  it('falls back to the cached page offline, and to a cached home page for "/"', async () => {
    let online = true;
    const { dispatch } = loadWorker(async (url) => {
      if (!online) throw new TypeError('Failed to fetch');
      return asPage(`<p>${url}</p>`);
    });
    await dispatch(`${ORIGIN}/zh-hant/`, { mode: 'navigate' });
    await dispatch(`${ORIGIN}/privacy/`, { mode: 'navigate' });
    online = false;
    expect(
      await (await dispatch(`${ORIGIN}/privacy/`, { mode: 'navigate' }))!.text()
    ).toBe(`<p>${ORIGIN}/privacy/</p>`);
    expect(
      await (await dispatch(`${ORIGIN}/`, { mode: 'navigate' }))!.text()
    ).toBe(`<p>${ORIGIN}/zh-hant/</p>`);
    await expect(
      dispatch(`${ORIGIN}/terms/`, { mode: 'navigate' })
    ).rejects.toThrow('Failed to fetch');
  });

  it('does not cache error pages or Markdown twins', async () => {
    const { dispatch, open, stores } = loadWorker(async (url) =>
      url.endsWith('/nope/')
        ? asPage('<p>404</p>', { status: 404 })
        : asPage('# md2word', { type: 'text/markdown; charset=utf-8' })
    );
    await dispatch(`${ORIGIN}/nope/`, { mode: 'navigate' });
    await dispatch(`${ORIGIN}/privacy/`, { mode: 'navigate' });
    const pagesCache = [...stores.keys()].find((k) =>
      k.startsWith('md2w-pages-')
    );
    const stored = pagesCache ? await (await open(pagesCache)).keys() : [];
    expect(stored).toEqual([]);
  });

  it('serves hashed assets from the cache before the network', async () => {
    const { dispatch, fetchMock } = loadWorker(async (url) =>
      asPage(`fetched ${url}`, { type: 'font/woff2' })
    );
    // A font isn't precached: the first request fills the cache, the second
    // never reaches the network.
    const url = `${ORIGIN}/_astro/fonts/0869440da2f8178e.woff2`;
    expect(await (await dispatch(url))!.text()).toBe(`fetched ${url}`);
    expect(await (await dispatch(url))!.text()).toBe(`fetched ${url}`);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('PWA static files', () => {
  const read = (file: string): string =>
    readFileSync(path.join(root, file), 'utf8');
  const manifest = JSON.parse(read('public/manifest.webmanifest'));

  it('serves /sw.js no-cache, never as an immutable asset', () => {
    const block = read('public/_headers')
      .split(/\n(?=\S)/)
      .find((b) => b.startsWith('/sw.js'));
    expect(block).toMatch(/^\s+Cache-Control: no-cache$/m);
  });

  it('serves /sw.js and the manifest as plain assets, not through the Worker', () => {
    const wrangler = read('wrangler.jsonc');
    const routes = /"run_worker_first":\s*(\[[^\]]*\])/.exec(wrangler)![1];
    expect(routes).not.toContain('/sw.js');
    expect(routes).not.toContain('manifest');
    expect(routes).not.toContain('*');
  });

  it('has a manifest whose icons exist at the declared sizes', () => {
    expect(manifest).toMatchObject({
      id: '/',
      start_url: '/',
      scope: '/',
      display: 'standalone',
    });
    for (const icon of manifest.icons) {
      const png = readFileSync(path.join(root, 'public', icon.src));
      // PNG IHDR: width and height are big-endian at bytes 16 and 20.
      const size = `${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`;
      expect(size).toBe(icon.sizes);
    }
    expect(
      manifest.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')
    ).toBe(true);
  });

  // The manifest is static JSON, so these are copies; keep them in step with
  // their sources.
  it('takes its colors, name, and description from the site', () => {
    const paper = /--color-paper:\s*(#[0-9a-f]{6})/i.exec(
      read('web/styles/global.css')
    )![1];
    expect(manifest.background_color).toBe(paper);
    expect(manifest.theme_color).toBe(paper);
    expect(read('web/layouts/Layout.astro')).toContain(
      `<meta name="theme-color" content="${paper}" media="(prefers-color-scheme: light)" />`
    );
    expect(manifest.description).toBe(en.metaDescription);
    expect(read('public/favicon.svg')).toContain(
      `aria-label="${manifest.name}"`
    );
  });
});

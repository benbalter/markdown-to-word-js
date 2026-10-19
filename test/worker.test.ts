import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';
import worker from '../worker/index.js';

// Tests for the Cloudflare Worker fetch handler (worker/index.js): asset
// passthrough, the root locale redirect, the language suggestion, and
// Markdown negotiation for agents.
// pickLocale's matching logic is covered separately in i18n-redirect.test.ts.
// Request/Response/URL are Node globals here.

interface MockEnv {
  ASSETS: { fetch: Mock };
}

function makeEnv(overrides: Partial<MockEnv> = {}): MockEnv {
  return {
    ASSETS: {
      fetch: vi.fn(async () => new Response('asset', { status: 200 })),
    },
    ...overrides,
  };
}

describe('worker fetch handler', () => {
  describe('asset passthrough', () => {
    it('delegates non-root paths to the ASSETS binding', async () => {
      const env = makeEnv();
      const req = new Request('https://md2word.app/privacy/');
      const res = await worker.fetch(req, env);

      expect(env.ASSETS.fetch).toHaveBeenCalledWith(req);
      expect(res.status).toBe(200);
    });
  });

  describe('Markdown negotiation', () => {
    const MARKDOWN = { headers: { Accept: 'text/markdown, text/html;q=0.9' } };

    function markdownEnv(): MockEnv {
      return makeEnv({
        ASSETS: {
          fetch: vi.fn(async (req: Request) =>
            new URL(req.url).pathname.endsWith('.md')
              ? new Response('# twin', {
                  headers: { 'Content-Type': 'text/markdown' },
                })
              : new Response('<html>', { status: 200 })
          ),
        },
      });
    }

    it("serves the root's Markdown twin to agents, ahead of the locale redirect", async () => {
      const env = markdownEnv();
      const res = await worker.fetch(
        new Request('https://md2word.app/', {
          headers: { ...MARKDOWN.headers, 'Accept-Language': 'de' },
        }),
        env
      );

      expect(res.status).toBe(200);
      expect(await res.text()).toBe('# twin');
      expect(res.headers.get('Vary')).toContain('Accept');
      const fetched = env.ASSETS.fetch.mock.calls[0][0] as Request;
      expect(new URL(fetched.url).pathname).toBe('/index.md');
    });

    it("serves a legal page's twin", async () => {
      const env = markdownEnv();
      const res = await worker.fetch(
        new Request('https://md2word.app/privacy/', MARKDOWN),
        env
      );

      expect(await res.text()).toBe('# twin');
      const fetched = env.ASSETS.fetch.mock.calls[0][0] as Request;
      expect(new URL(fetched.url).pathname).toBe('/privacy.md');
    });

    it('serves browsers HTML that varies on Accept', async () => {
      const env = markdownEnv();
      const res = await worker.fetch(
        new Request('https://md2word.app/privacy/', {
          headers: { Accept: 'text/html,*/*;q=0.8' },
        }),
        env
      );

      expect(await res.text()).toBe('<html>');
      expect(res.headers.get('Vary')).toContain('Accept');
    });

    it('ignores the Accept header on a POST', async () => {
      const env = markdownEnv();
      const res = await worker.fetch(
        new Request('https://md2word.app/privacy/', {
          method: 'POST',
          ...MARKDOWN,
        }),
        env
      );

      expect(await res.text()).toBe('<html>');
    });

    it('falls back to HTML when a page has no twin', async () => {
      const env = makeEnv();
      env.ASSETS.fetch
        .mockImplementationOnce(async () => new Response('nf', { status: 404 }))
        .mockImplementationOnce(async () => new Response('<html>'));
      const res = await worker.fetch(
        new Request('https://md2word.app/privacy/', MARKDOWN),
        env
      );

      expect(await res.text()).toBe('<html>');
    });
  });

  describe('root locale redirect', () => {
    it('302-redirects a first-time non-English visitor', async () => {
      const env = makeEnv();
      const req = new Request('https://md2word.app/', {
        headers: { 'Accept-Language': 'id-ID,id;q=0.9' },
      });
      const res = await worker.fetch(req, env);

      expect(res.status).toBe(302);
      expect(res.headers.get('Location')).toBe('https://md2word.app/id/');
      expect(res.headers.get('Set-Cookie')).toBe(
        'lang=id; Path=/; Max-Age=31536000; SameSite=Lax; Secure'
      );
      expect(res.headers.get('Vary')).toBe('Accept-Language, Cookie, Accept');
      expect(res.headers.get('Cache-Control')).toBe('no-store');
      expect(env.ASSETS.fetch).not.toHaveBeenCalled();
    });

    it('keeps the query string on the redirect', async () => {
      const res = await worker.fetch(
        new Request('https://md2word.app/?utm_source=x', {
          headers: { 'Accept-Language': 'es' },
        }),
        makeEnv()
      );
      expect(res.headers.get('Location')).toBe(
        'https://md2word.app/es/?utm_source=x'
      );
    });

    it('serves the root from assets when a lang cookie is already set', async () => {
      const env = makeEnv();
      const req = new Request('https://md2word.app/', {
        headers: { 'Accept-Language': 'id-ID', Cookie: 'lang=id' },
      });
      const res = await worker.fetch(req, env);

      expect(env.ASSETS.fetch).toHaveBeenCalledWith(req);
      // "/" can also be a redirect or a tagged page, so caches must key on
      // the headers that decide which.
      expect(res.headers.get('Vary')).toBe('Accept-Language, Cookie, Accept');
      expect(await res.text()).toBe('asset');
    });

    it('leaves Vary off other asset paths', async () => {
      const res = await worker.fetch(
        new Request('https://md2word.app/id/', {
          headers: { 'Accept-Language': 'id-ID' },
        }),
        makeEnv()
      );
      expect(res.headers.get('Vary')).toBeNull();
    });
  });

  describe('root language suggestion', () => {
    // HTMLRewriter is a Workers runtime global; stand in a minimal version that
    // applies the `html` element handler's setAttribute to the serialized body.
    beforeAll(() => {
      (globalThis as Record<string, unknown>).HTMLRewriter = class {
        private attrs: [string, string][] = [];
        on(
          _selector: string,
          handler: {
            element(el: { setAttribute(k: string, v: string): void }): void;
          }
        ): this {
          handler.element({ setAttribute: (k, v) => this.attrs.push([k, v]) });
          return this;
        }
        transform(res: Response): {
          headers: Headers;
          status: number;
          body: ReadableStream;
        } {
          const attrs = this.attrs;
          const body = res
            .text()
            .then((html) =>
              html.replace(
                '<html',
                `<html ${attrs.map(([k, v]) => `${k}="${v}"`).join(' ')}`
              )
            );
          return {
            headers: res.headers,
            status: res.status,
            body: new ReadableStream({
              async start(c): Promise<void> {
                c.enqueue(new TextEncoder().encode(await body));
                c.close();
              },
            }),
          };
        }
      };
    });
    afterAll(() => {
      delete (globalThis as Record<string, unknown>).HTMLRewriter;
    });

    function htmlEnv(): MockEnv {
      return makeEnv({
        ASSETS: {
          fetch: vi.fn(
            async () =>
              new Response('<html lang="en"><body></body></html>', {
                status: 200,
                headers: {
                  ETag: '"abc"',
                  'Cache-Control': 'public, max-age=0',
                },
              })
          ),
        },
      });
    }

    function rootRequest(
      headers: Record<string, string>,
      country?: string
    ): Request {
      const req = new Request('https://md2word.app/', { headers });
      if (country) Object.defineProperty(req, 'cf', { value: { country } });
      return req;
    }

    it('tags <html> for an English browser in a mapped country', async () => {
      const env = htmlEnv();
      const res = await worker.fetch(
        rootRequest(
          {
            'Accept-Language': 'en-US,en;q=0.9',
            Cookie: 'lang=en',
            'If-None-Match': '"abc"',
          },
          'ID'
        ),
        env
      );

      expect(await res.text()).toContain('data-suggest-locale="id"');
      // Per-visitor response: never cached, no validators.
      expect(res.headers.get('Cache-Control')).toBe('private, no-store');
      expect(res.headers.get('ETag')).toBeNull();
      // Fetched unconditionally, so a stale untagged copy can't be reused.
      const [assetReq] = env.ASSETS.fetch.mock.calls[0] as [Request];
      expect(assetReq.headers.get('If-None-Match')).toBeNull();
    });

    it('serves the plain asset once the suggestion is turned off', async () => {
      const env = htmlEnv();
      const req = rootRequest(
        { 'Accept-Language': 'en-US', Cookie: 'lang=en; hint=off' },
        'ID'
      );
      const res = await worker.fetch(req, env);

      expect(env.ASSETS.fetch).toHaveBeenCalledWith(req);
      expect(await res.text()).not.toContain('data-suggest-locale');
    });

    it('serves the plain asset when there is nothing to suggest', async () => {
      const env = htmlEnv();
      const req = rootRequest({ 'Accept-Language': 'en-US' }, 'US');
      await worker.fetch(req, env);

      expect(env.ASSETS.fetch).toHaveBeenCalledWith(req);
    });

    it('only honors an exact hint=off cookie', async () => {
      const res = await worker.fetch(
        rootRequest(
          { 'Accept-Language': 'en-US', Cookie: 'lang=en; hint=offer' },
          'ID'
        ),
        htmlEnv()
      );
      expect(await res.text()).toContain('data-suggest-locale="id"');
    });

    it('passes a non-OK asset response through untagged', async () => {
      const env = makeEnv({
        ASSETS: {
          fetch: vi.fn(async () => new Response('gone', { status: 503 })),
        },
      });
      const res = await worker.fetch(
        rootRequest({ 'Accept-Language': 'en-US', Cookie: 'lang=en' }, 'ID'),
        env
      );
      expect(res.status).toBe(503);
      expect(await res.text()).toBe('gone');
    });
  });
});

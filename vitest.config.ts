/// <reference types="vitest/config" />
import { getViteConfig } from 'astro/config';

// Unit tests run against Astro's Vite config (so `define`, aliases, and the
// plugins match the site build) in jsdom. Playwright specs live in test/e2e
// and run separately with `npm run test:e2e`.
export default getViteConfig({
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.ts'],
    exclude: ['test/e2e/**'],
    // Builds build/cli.js for the CLI and MCP tests when it's stale.
    globalSetup: ['test/build-cli.ts'],
    // `npm run test:coverage` (what CI runs). The converter, the browser
    // entry, and the redirect Worker are all exercised in-process, so one
    // global floor covers them. Thresholds sit about two points below the
    // numbers when they were set (93.6% statements, 75.6% branches, 94.6%
    // functions, 94.9% lines): raise them as coverage grows, so they ratchet.
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'worker/**/*.js'],
      // The CLI and MCP server run only in the child processes that
      // test/cli.test.ts and test/mcp.test.ts spawn, which v8 can't see.
      exclude: ['src/cli.ts', 'src/mcp.ts'],
      reporter: ['text', 'html'],
      thresholds: {
        statements: 91,
        branches: 73,
        functions: 92,
        lines: 92,
      },
    },
  },
});

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
  },
});

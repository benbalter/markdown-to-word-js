import { defineConfig, devices } from '@playwright/test';

// End-to-end tests against the built site (dist/), served by `astro preview`.
// Run `npm run build` first; CI does. See https://playwright.dev/docs/test-configuration.
export default defineConfig({
  testDir: './test/e2e',
  fullyParallel: true,
  // Fail the build on CI if test.only was left in the source.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? '50%' : undefined,
  // In CI, `github` also annotates failures inline on the PR.
  reporter: process.env.CI ? [['github'], ['html']] : 'html',
  use: {
    baseURL: 'http://localhost:8080',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    },
  ],
  webServer: {
    // --ignore-lock keeps the server in the foreground: Astro 7 otherwise
    // backgrounds `astro preview` when it detects an AI agent, and Playwright
    // would see the process exit.
    command: 'npm run preview -- --port 8080 --ignore-lock',
    port: 8080,
    reuseExistingServer: !process.env.CI,
    stderr: 'pipe',
    stdout: 'pipe',
  },
});

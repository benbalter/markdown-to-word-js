// ESLint flat config (replaces .eslintrc.json, which ESLint 10 no longer
// reads). Lints the TypeScript sources and the Node scripts; generated output
// and .astro templates are left to `astro check` and Prettier.
import { defineConfig } from 'eslint/config';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default defineConfig(
  // Flat config only auto-ignores node_modules/.git, so dot-dirs like .astro
  // (Astro's generated types) must be listed explicitly.
  {
    ignores: [
      'dist/**',
      'coverage/**',
      '.astro/**',
      '.wrangler/**',
      'playwright-report/**',
      'test-results/**',
      // Worktrees of this repo (other sessions' checkouts).
      '.claude/**',
    ],
  },

  js.configs.recommended,
  tseslint.configs.recommended,

  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'warn',
      'no-console': 'warn',
    },
  },

  // The converter and the browser entry run in the browser.
  {
    files: ['src/**/*.ts', 'web/**/*.ts'],
    languageOptions: { globals: { ...globals.browser } },
  },

  // Tests, configs, and build scripts run in Node.
  {
    files: ['test/**/*.ts', 'scripts/**/*.mjs', '*.ts', '*.mjs'],
    languageOptions: { globals: { ...globals.node } },
  },

  // Keep last: turn off rules that conflict with Prettier formatting.
  prettier
);

/// <reference types="vitest" />
import { defineConfig, Plugin } from 'vite'
import fs from 'fs'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

// Vite plugin to fix @turbodocx/html-to-docx browser build missing default export.
// The package's "browser" field points to an IIFE that assigns to a var but has no
// module export, causing "does not provide an export named 'default'" at runtime.
function fixHtmlToDocxPlugin(): Plugin {
  return {
    name: 'fix-html-to-docx',
    enforce: 'pre',
    resolveId(source) {
      if (source === '@turbodocx/html-to-docx') {
        return source;
      }
    },
    load(id) {
      if (id === '@turbodocx/html-to-docx') {
        const browserBuildPath = require.resolve('@turbodocx/html-to-docx/dist/html-to-docx.browser.js');
        const contents = fs.readFileSync(browserBuildPath, 'utf8');
        return contents + '\nexport default HTMLToDOCX;\n';
      }
    }
  }
}

export default defineConfig({
  base: '/markdown-to-word-js/',
  plugins: [fixHtmlToDocxPlugin()],
  define: {
    global: 'globalThis',
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['@turbodocx/html-to-docx', 'marked', 'file-saver'],
          ui: ['bootstrap', 'clipboard']
        }
      }
    }
  },
  server: {
    port: 3000,
    open: true
  },
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.ts'],
  }
})
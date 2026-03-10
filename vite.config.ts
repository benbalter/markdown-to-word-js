import { defineConfig } from 'vite'

export default defineConfig({
  base: '/markdown-to-word-js/',
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
  }
})
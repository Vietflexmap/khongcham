import { defineConfig } from 'vite';

export default defineConfig({
  root: 'site',
  base: '/khongcham/',
  publicDir: '../public',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
});

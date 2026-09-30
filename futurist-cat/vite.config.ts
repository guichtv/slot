import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

// production = public build (no dev tools, no QA hooks); qa = same game + dev panel, TEST ANIM, __qa hooks.
export default defineConfig(({ mode }) => ({
  base: './',
  define: {
    __DEV_TOOLS__: JSON.stringify(mode !== 'production'),
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_STAMP__: JSON.stringify(new Date().toISOString()),
  },
  server: { port: 5340, strictPort: true, host: '127.0.0.1' },
  preview: { host: '127.0.0.1', strictPort: true },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    sourcemap: mode !== 'production',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      input: { index: 'index.html' },
    },
  },
}));

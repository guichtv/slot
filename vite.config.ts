import { defineConfig } from 'vite';

// Modes :
//  - development (npm run dev)        : outils DEV inclus, port 5301
//  - qa         (npm run build:qa)    : build servie avec hooks QA (horloge virtuelle, scénarios), dist-qa/
//  - production (npm run build)       : build publique, aucun outil DEV, dist/
export default defineConfig(({ mode }) => {
  const devTools = mode !== 'production';
  return {
    base: './',
    define: {
      __DEV_TOOLS__: JSON.stringify(devTools),
      __BUILD_MODE__: JSON.stringify(mode),
    },
    server: {
      port: 5301,
      strictPort: true,
      host: '127.0.0.1',
    },
    preview: {
      port: 5302,
      strictPort: true,
      host: '127.0.0.1',
    },
    build: {
      outDir: mode === 'qa' ? 'dist-qa' : 'dist',
      emptyOutDir: true,
      target: 'es2020',
      assetsInlineLimit: 0,
      sourcemap: false,
      chunkSizeWarningLimit: 1500,
      rollupOptions: {
        output: {
          manualChunks: {
            pixi: ['pixi.js'],
            gsap: ['gsap'],
          },
        },
      },
    },
  };
});

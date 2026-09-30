import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: {
    __DEV_TOOLS__: 'true',
    __APP_VERSION__: '"test"',
    __BUILD_STAMP__: '"test"',
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20000,
  },
});

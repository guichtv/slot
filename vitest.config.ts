import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: {
    __DEV_TOOLS__: 'true',
    __BUILD_MODE__: '"test"',
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});

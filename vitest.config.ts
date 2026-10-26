import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['apps/**/*.test.ts', 'packages/**/*.test.ts'],
    env: { MOCK_EXTERNAL: '1' },
    testTimeout: 10000,
  },
});

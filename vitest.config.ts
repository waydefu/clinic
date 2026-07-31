import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@beauessence/contracts': fileURLToPath(
        new URL('./packages/contracts/src/index.ts', import.meta.url)
      ),
      '@beauessence/domain': fileURLToPath(
        new URL('./packages/domain/src/index.ts', import.meta.url)
      )
    }
  },
  test: {
    include: [
      'apps/*/src/**/*.test.ts',
      'packages/*/src/**/*.test.ts',
      'scripts/**/*.test.mjs'
    ],
    exclude: ['node_modules', 'dist'],
    pool: 'forks',
    maxWorkers: 1
  }
});

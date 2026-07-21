import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/firestore/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // 這些套件共用同一個 Emulator 資料庫，並在 beforeEach 清空 collection。
    // 平行執行會讓它們互相把對方的資料洗掉，因此強制序列。
    fileParallelism: false
  }
});

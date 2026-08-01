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
    // `forks` 保留行程隔離：`apps/api` 的測試會啟動 Nest，共用行程的 `threads`
    // 會讓它們互相看得見對方的模組狀態。實測 threads 只快 2 秒，不值得拿隔離換。
    pool: 'forks',
    // 不再固定為 1。那個值是 2026-07-20 匯入版控時就帶進來的，沒有留下理由，
    // 而它讓整批測試序列化：實測 53.5 秒，放開後 18.3 秒。序列化也正是先前
    // 健康檢查測試撞到逾時的原因——它單獨執行只要 327 毫秒。留白讓 vitest 依
    // CPU 決定，本機與 CI runner 都適用。

    // 這個值不是為了讓某個測試變綠而調的。`apps/api` 的健康檢查測試單獨執行
    // 只需 327 毫秒，卻曾在整批執行時撞到 vitest 預設的 5 秒上限——瓶頸是
    // 序列化 pool 下的 Nest 啟動，不是測試本身變慢。公開鏡像早在發布時就
    // 設了 10 秒，也就是說 5 秒從來不是刻意訂下的預算，只是沒人設過。
    // 兩邊對齊。收集時間偏長是另一個問題，仍在待辦。
    testTimeout: 10_000
  }
});

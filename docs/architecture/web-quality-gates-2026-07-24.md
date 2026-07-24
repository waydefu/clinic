# 前端與供應鏈品質把關（2026-07-24）

**狀態：** Stage 0 內完成，未解除任何決策 gate。

這份文件說明「品質」在這個專案裡是怎麼被**強制**的：哪些由 CI 擋、哪些只能靠
人工、哪些必須等決策核准。文件本身不是把關；把關是 `corepack pnpm verify`、
`.github/workflows/` 與 runbook。

## 1. 把關全景

| 面向 | 把關方式 | 位置 | 阻斷 CI？ |
| --- | --- | --- | --- |
| 結構、UI 邊界、文件連結 | 腳本 | `scripts/check-*.mjs` | 是 |
| 格式與 lint | Prettier、ESLint | `eslint.config.mjs` | 是 |
| 型別與單元測試 | tsc、Vitest | `verify` | 是 |
| Firestore 交易／規則 | Emulator 測試 | `pnpm test:rules` | 是 |
| 端到端流程 | Playwright | `tests/e2e/` | 是 |
| 無障礙（自動可判定） | axe-core | `tests/e2e/accessibility.spec.ts` | 是（serious／critical） |
| 無障礙（螢幕閱讀器、高對比） | 人工 | [人工無障礙測試 runbook](../runbooks/manual-accessibility-test.md) | 否——人工，需留紀錄 |
| 頁面重量 | 靜態預算 | `scripts/check-performance-budget.mjs` | 是 |
| 首屏時間與版面位移 | 瀏覽器實測 | `tests/e2e/performance.spec.ts` | 是 |
| 已提交的密鑰 | 腳本 | `scripts/check-tracked-secrets.mjs` | 是 |
| 相依漏洞 | `pnpm audit` | `check:supply-chain` | 是（high／critical） |
| SBOM 與授權政策 | CycloneDX 產生器 | `scripts/generate-sbom.mjs` | 是 |
| SAST（跨檔案資料流） | CodeQL | `.github/workflows/codeql.yml` | **尚未生效**，見 §4 |

## 2. 效能預算

預算檔是 `apps/web/performance-budget.json`，用的是 **Lighthouse `budget.json`
的格式**（`path`／`resourceSizes`／`resourceCounts`／`timings`，大小單位 KiB），
因此之後真的接上 Lighthouse CI 時可以直接沿用，不必重寫。

它被兩個地方讀取，刻意分工：

- **位元組**（`resourceSizes`／`resourceCounts`）由 `pnpm check:perf` 對
  `apps/web/dist` 靜態計算，走 HTML → CSS／JS → 相對匯入的傳遞閉包，**以 gzip
  後的大小**計——Hosting 對文字資產會壓縮，使用者下載的是壓縮後的量。這一半是
  確定性的：同樣的產物永遠得到同樣的數字，所以適合當硬性 gate。
- **時間**（`timings`）由 `tests/e2e/performance.spec.ts` 在 Chromium 實測 FCP、
  LCP 與 CLS。門檻取 Core Web Vitals 的「良好」界線（1.8s／2.5s／0.1），不是貼著
  本機現值——共用 CI runner 的時間本來就會抖動，貼著現值訂只會製造假紅燈。這個
  測試要抓的是「有人讓首屏慢了一個數量級」。

目前值（2026-07-24，gzip）：患者頁 83.9 KiB／35 個請求，工作臺 110.0 KiB／
38 個請求，404 頁 2.3 KiB。預算大約留 20% 餘裕。

兩個刻意的設計：

- **字型預算是 0 KiB。** roadmap 的公開問題之一是「`Noto Sans TC` 未實際載入，
  需決定載入或移除」。預算訂為 0 表示任何人加字型都會撞到 gate，變成一次刻意的
  決定，而不是悄悄多出幾百 KB。
- **沒有預算的頁面直接失敗。** 新增 HTML 進入點時必須明確替它定預算，不會因為
  「沒設定」而免除檢查。

## 3. SBOM 與授權政策

`pnpm sbom` 產出 `sbom.cdx.json`（**CycloneDX 1.6**，git 忽略、CI 上傳為
artifact），取代先前只有我們自己看得懂的 `dependency-inventory.json`。每個元件
都有 purl，可直接餵給漏洞比對與授權稽核工具。

同一個腳本同時是**授權 gate**：

- 允許清單只收寬鬆授權；強 copyleft（GPL／AGPL）不得進入相依樹，需法務判斷。
- SPDX 運算式是**被解析的**，不是字串比對：`(MIT OR CC0-1.0)` 會通過，
  `MIT AND GPL-3.0-only` 不會，看不懂的字串一律不通過。
- 沒有宣告授權、或宣告了非 SPDX 字串的套件，必須列入 `REVIEWED_EXCEPTIONS`
  並附理由，否則 CI 紅。目前有三筆（`deep-freeze`、`url-template`、
  `valid-url`，皆為 dev-only），每次執行都會印出來，不會靜靜地長期存在。

**已知限制（刻意記錄）**：`pnpm list` 對重複子樹會標 `deduped` 並省略其相依，
因此相依「邊」可能不完整；元件清單則是完整的。漏洞比對與授權稽核靠的是元件與
purl，不受影響。若之後需要完整相依圖，來源要改成鎖檔。

另一個限制：其他作業系統的 optional binary（`@esbuild/*`、`@rollup/*`、
`fsevents`）在本平台不會安裝，也就讀不到 manifest。它們仍列入 SBOM 並標記
`beauessence:resolution: not-installed`，但不納入授權判定——沒安裝也不會出貨。

## 4. SAST

分兩層：

1. **ESLint（已生效）**：`no-eval`／`no-new-func`／`no-script-url`／`no-proto`
   套用到所有檔案，`no-implied-eval` 在 JS 側明示、TS 側由型別感知版本涵蓋。
   擋的是單一檔案裡一眼可辨的動態求值 sink。
2. **CodeQL（設定已審視，尚未生效）**：`.github/workflows/codeql.yml`，
   `javascript-typescript` ＋ `security-extended`。它做的是跨檔案污染追蹤——例如
   「使用者輸入是否在沒有經過 `escapeHtml` 的情況下流進 `innerHTML`」，正是這個
   平台（瀏覽器層大量用樣板字串產生 HTML）最需要的分析。

CodeQL 尚未產生任何結果，前提有二：repository 要推上 GitHub（目前沒有 git
remote，commit 全在本機）；私有 repository 需要 GitHub Advanced Security 授權，
公開 repository 免費。採購或改為公開是技術負責人的決定，與 D-010 同一批。
**上線證據包必須附實際掃描結果，而不只是這個設定檔的存在。**

## 5. 無障礙的分工

axe 只能判定機器可判定的那一部分準則。焦點順序、播報是否聽得懂、高對比下狀態
是否還看得出來，只能人工測——步驟、通過條件與紀錄模板見
[人工無障礙測試 runbook](../runbooks/manual-accessibility-test.md)。

**「axe 全綠」不得作為人工測試的替代品。** 這句話寫在這裡，是因為它是最容易被
省略的一步。

## 6. 尚未做的

| 項目 | 為什麼還沒做 |
| --- | --- |
| Lighthouse CI 完整報告（含 SEO／best-practices 分數） | 需要在 CI 跑完整 Lighthouse；目前以預算檔＋實測指標覆蓋最關鍵的部分，等 runner 政策（D-010）定案再評估 |
| 依賴簽章／來源證明（provenance、sigstore） | 需要 CI 身分與金鑰管理，屬 D-010 |
| 行動裝置螢幕閱讀器實測 | 需要實機，見 runbook §9 |
| 負載／soak／交易競爭測試 | Stage 6 項目，需要 cloud staging（D-010） |

## 相關文件

- [正式化後續實作規劃](../product/production-readiness-delivery-plan-2026-07-23.md) — Web／Quality backlog 與 gate
- [正式環境目標架構](production-target-architecture-2026-07-23.md) — 架構邊界
- [人工無障礙測試 runbook](../runbooks/manual-accessibility-test.md)
- [基礎設施與維運計畫](infrastructure-and-operations-plan-2026-07-24.md) — 環境、備份、監控與部署把關

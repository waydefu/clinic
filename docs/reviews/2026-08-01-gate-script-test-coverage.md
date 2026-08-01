# 階段交接紀錄：把關腳本的測試覆蓋與階段 0 收尾 — 2026-08-01

**狀態：已交付，尚未合併。步驟 0-6 明確未完成。**
本階段對應[全專案執行書](../product/full-project-execution-book-2026-07-31.md)的
**階段 0 步驟 0-6 與 0-7**，是[前一份交接紀錄](2026-08-01-sast-migration-and-audit-governance-delivery.md)
「下一位從這裡開始」的第 1、2 項。

## 1. 一句話

把 `scripts/` 下 9 支阻斷式檢查補上測試（其中 5 支需要先重構成可測的純函式），
並把每一支測試檔本身也納入結構檢查的必要清單；步驟 0-6 因為掃描器不存在而
**停止**，沒有進行任何公開發布。

## 2. 驗收證據

| 關卡 | 結果 |
| --- | --- |
| `verify` | 全綠 |
| 結構檢查 | 200 required files（起點 190） |
| 文件檢查 | 99 files |
| 密鑰檢查 | 375 tracked files |
| 單元測試 | **55 檔 / 820 項通過**（起點 46 檔 / 667 項，本階段 +9 檔 / +153 項） |

各支腳本重構後都以實機執行確認輸出與重構前一致，不只靠測試：
`check-docs-links` 仍回報 99 files、`check-tracked-secrets` 仍回報全部追蹤檔、
`check-structure` 三段輸出不變。

## 3. 覆蓋範圍（步驟 0-7）

| 腳本 | 處理方式 | 測試數 |
| --- | --- | --- |
| `check-tracked-secrets.mjs` | 重構為純函式 ＋ 測試 | 36 |
| `check-structure.mjs` | 重構 ＋ 測試 | 24 |
| `generate-ci-evidence.mjs` | 重構 ＋ 測試 | 16 |
| `check-docs-links.mjs` | 重構 ＋ 測試 | 16 |
| `generate-sbom.mjs` | 測試（已有 export） | 19 |
| `check-design-tokens.mjs` | 測試（已有 export） | 13 |
| `check-performance-budget.mjs` | 測試（已有 export） | 11 |
| `check-branch-protection.mjs` | 重構 ＋ 測試 | 9 |
| `check-public-pages.mjs` | 測試，**僅涵蓋兩支解析器** | 9 |

重構一律遵守同一條界線：**只把判斷邏輯抽成可測的純函式，不改變任何一條規則**。
`check-branch-protection.mjs` 另外把 import 時就會執行的副作用（無 token 即
`process.exit(2)`）移進 `main()`，否則它無法被 import 測試。

### 這些測試在防什麼

不是為了覆蓋率數字，每一支都對準一種「gate 看起來還在、其實已經失效」的情境：

- **假紅燈**：`check-tracked-secrets` 曾在工作區有已刪除檔案時 ENOENT 崩潰，把
  本機刪檔誤報成掃描失敗。測試固定了「跳過並回報數量」的行為。
- **靜默失效**：`check-docs-links` 若讀不到索引宣告就回空清單，雙向比對會變成
  「兩邊都空」而通過。測試要求它必須大聲失敗。
- **誤報安全**：`check-branch-protection` 讀 GitHub 兩種回應形狀（新的
  `checks[].context` 與舊的 `contexts[]`）。只讀一種的話，另一種設定會被讀成
  「什麼都沒設」；403 也必須是「沒查」而不是「查了、沒設定」。
- **把跳過當成通過**：`generate-ci-evidence` 對 `missing`、`skipped`、`cancelled`
  一律判為 failure。被跳過的 job 最危險，因為它不像失敗，但它沒有跑。
- **例外漂移**：`generate-sbom` 的已審視授權例外綁定當初的授權字串與 scope；
  兩者任一改變就必須重新審視，而不是沿用舊例外。
- **規則自我解釋**：`check-performance-budget` 要求每筆預算附 `justification`。
  沒有理由的數字，下一個人只會直接調大它。

## 4. 過程中發現的真缺陷

1. **`check-structure.mjs` 沒有把自己列入必要檔案清單。** 由新測試抓到。
2. **所有 gate 的測試檔都不在必要清單裡。** 測試被刪掉比腳本被刪掉更難察覺——
   gate 還在、還是綠燈，只是不再驗證任何事。已把 11 支測試檔全部登記，必要檔案
   數由 190 增為 200。

兩者都不是本階段引入的，是既有缺口。

## 5. 未完成事項

### 5.1 步驟 0-6 公開鏡像同步：**停在第 1 步，等候 allowlist 決定**

掃描器已依 owner 指示安裝並驗證：

| 工具 | 版本 | 取得方式 |
| --- | --- | --- |
| gitleaks | 8.30.1 | winget `Gitleaks.Gitleaks` |
| trufflehog | 3.96.0 | 官方 release v3.96.0，已比對發布的 SHA-256 checksum |

**私有 repository 的完整歷史掃描結果（2026-08-01）：**

| 掃描 | 結果 |
| --- | --- |
| gitleaks（147 commits、4.16 MB） | 初次 4 筆，全為誤報；加設定後 **0 筆** |
| trufflehog（4591 chunks、4.4 MB） | **0 verified、0 unverified** |

那 4 筆誤報是 `generic-api-key` 規則把契約測試裡的合成冪等鍵
（`payroll-close-key-NNNN`、`schedule_publish_NNNN`）當成 API 金鑰。新增的
`gitleaks.toml` 以**值的樣式**而非路徑做 allowlist——路徑層級的整檔豁免會讓該檔
日後真的混進金鑰時完全不被發現。allowlist 的範圍另以實測確認：植入一個真實形狀的
AWS 憑證後仍被 `aws-access-token` 規則抓到，合成鍵則被正確豁免。

**卡在哪：關卡第 1 步要求「定義檔案層級的 allowlist」，而那是範圍決定，不是技術
判斷。** 自鏡像基準（私有 `0077528`）以來，私有版變動且鏡像存在同名路徑者共 9 個：

| 路徑 | 判斷 |
| --- | --- |
| `pnpm-lock.yaml` | **建議納入**——攜帶本輪的相依安全修補 |
| `pnpm-workspace.yaml` | **建議納入**——同上，含 brace-expansion 逐 major 鎖定 |
| `scripts/check-tracked-secrets.mjs` | **建議納入**——鏡像有同一支腳本，修的是會誤報掃描失敗的崩潰 |
| `.github/workflows/codeql.yml` | **明確不同步刪除**。私有版刪掉它是因為個人私有 repo 無法上傳 code-scanning 結果；**公開 repo 沒有這個限制**，而且關卡第 7 步要求公開 PR 必須通過 `CodeQL`。這是私有與公開合理分歧的一處 |
| `CONTRIBUTING.md` | 需裁決——新增的第 8～10 條有兩條是通用工程規則，第 10 條引用內部治理文件 |
| `README.md` | 需裁決——鏡像的 README 是另行撰寫的去識別化版本 |
| `eslint.config.mjs` | 需裁決——新增的忽略項指向鏡像不存在的 `security/semgrep/` |
| `package.json` | 需裁決——新增 `check:audit-exceptions` 指令，但該腳本不在鏡像內 |
| `vitest.config.ts` | 需裁決——新增的 `scripts/**/*.test.mjs` 只在鏡像也帶入那些測試時才有意義 |

**解除條件**：owner 裁定 allowlist 範圍後，執行關卡第 2～6 步（全新 clone、逐行
審查、公開檢查與建置、兩支掃描器對結果歷史、再 clone 複驗），最後第 7 步的公開
推送仍須逐次取得 owner 同意。本階段**沒有進行任何公開發布**。

### 5.2 兩支腳本尚未覆蓋

| 腳本 | 行數 | 未做的原因 |
| --- | --- | --- |
| `check-web-ui.mjs` | 1070 | 無任何 export，核心邏輯與 DOM 斷言交錯，需要較大幅度的重構才能測 |
| `check-architecture.mjs` | 392 | 無任何 export，需先抽出相依方向判斷的純函式 |

兩者現況都是「能跑、會擋」，缺的是它們自己的回歸保護。

### 5.3 `check-public-pages.mjs` 只覆蓋兩支解析器

`extractPrettyPaths` 與 `extractPublicPageScanRoutes` 已測；
`checkPublicPageConfiguration` 的完整比對邏輯需要建構 inventory、budgets、
firebase 設定等多份 fixture，尚未進行。

### 5.4 沿用前一階段的未處理項

`apps/api/src/health.controller.test.ts` 在高負載批次中的偶發逾時仍未處理。
本階段測試檔增加後，該執行序更長，建議提高優先度。

## 6. 下一位接手者從這裡開始

| 順序 | 待辦 | 卡在哪 |
| --- | --- | --- |
| 1 | 安裝 gitleaks／trufflehog 後執行步驟 0-6 | 需 owner 對公開推送逐次同意 |
| 2 | `check-architecture.mjs` 抽出純函式並補測試 | 純技術工作，無阻塞 |
| 3 | `check-web-ui.mjs` 同上 | 檔案較大，建議先切出核心 review 函式 |
| 4 | `checkPublicPageConfiguration` 的完整 fixture 測試 | 純技術工作 |
| 5 | API 健康檢查測試的不穩定性 | 需決定拆執行序或標記追蹤 |
| 6 | 回收兩份決定清單、召開 C0 | 需業主與各負責人 |

## 7. 本階段記錄的決策

無新決策。本階段執行的是 ENG-04 之後既有的 CONTRIBUTING 第 8 條（阻斷式檢查
視同產品程式碼，須附測試並定義三種工作區情境的行為）。

目前位置不變：**Stage 1**。本階段沒有建立任何雲端資源、沒有開啟任何路由、
沒有接觸任何真實病患資料，也沒有進行任何公開發布。

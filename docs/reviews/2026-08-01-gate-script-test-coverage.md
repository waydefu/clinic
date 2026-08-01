# 階段交接紀錄：把關腳本的測試覆蓋與階段 0 收尾 — 2026-08-01

**狀態：階段 0 步驟 0-6 與 0-7 已交付。0-6 已公開發布並複驗；0-7 有兩支腳本明確未覆蓋。**
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

**關卡第 1～6 步已完成，停在第 7 步等候 owner 同意公開推送。**

判斷依據已抽出寫成可重複執行的
[公開鏡像同步 runbook](../runbooks/public-mirror-sync.md)，避免下次同步又要把
「這個檔案該不該搬」重新推導一遍。

#### 研究結果推翻了原本的假設

原先以為要處理 9 個「私有版變動、鏡像同名」的檔案。實際查證後，其中大多數根本
不是同步問題：

| 原本的假設 | 實際情況 |
| --- | --- |
| 鏡像是私有版的去識別化副本 | 原始碼是，但 `README.md`／`CONTRIBUTING.md`／`SECURITY.md`／`NOTICE.md` 是**獨立撰寫的公開文件**，沒有「同步」這回事 |
| 兩邊共用 `check-tracked-secrets.mjs` | **是兩套不同實作**，偵測器與結構都不同。鏡像那套有**同一個 ENOENT 崩潰缺陷** |
| 需要把相依安全修補搬過去 | **完全不需要**。鏡像的 lockfile 只有 `brace-expansion@5.0.8`，另外三筆 advisory 都來自鏡像沒有的 `firebase-tools`；實測兩道 audit 皆為 `No known vulnerabilities found` |

因此實際 delta 縮小為四項：修掉鏡像自己那支腳本的崩潰、補上它的測試、讓測試被
執行的設定、以及把由此得出的規則寫進公開端的 CONTRIBUTING。

#### 各步驟結果

| 步驟 | 結果 |
| --- | --- |
| 1 定義 allowlist | 4 個路徑，依 runbook §3 分類 |
| 2 全新 clone 套用 delta | `sync/gate-script-hardening`，未觸碰私有 Git 物件 |
| 3 逐行審查 | 通過。過程中揪出兩次問題，見下 |
| 4 公開端 verify 與雙 audit | 15 檔 / **178 項測試**通過（發布時為 14 檔 / 164 項）；兩道 audit 皆無漏洞 |
| 5 gitleaks／trufflehog／public-safety | gitleaks 0 筆；trufflehog 93 chunks、0 verified／0 unverified；public-safety 73 檔通過 |
| 6 另一個乾淨目錄複驗 | commit `b77abf4`、tree `e3b5272` 與候選完全一致；只有一個分支、零 tag；掃描與檢查全部重跑通過 |
| 7 公開推送 | **已完成**。[PR #2](https://github.com/waydefu/appointment-platform-public/pull/2)，六項檢查全過（`Public verification`、`CodeQL`、Dependency audit、Dependency review、Quality and public-safety gates），squash merge 為 `f71643d`；分支依設定自動刪除 |
| 8 記錄範圍或控制變更 | 無重大範圍或控制變更。未新增檔案類別、未調整任何 GitHub 保護設定、未變更 allowlist 邊界。公開端仍為 73 個追蹤檔、單一 `main` 分支 |

#### 合併後複驗

| 項目 | 結果 |
| --- | --- |
| 全新 clone HEAD | `f71643d`，3 個 commit，僅 `origin/main` |
| 追蹤檔 | 73 |
| gitleaks | 0 筆 |
| trufflehog | 93 chunks，0 verified／0 unverified |
| public-safety | 73 檔通過 |
| 公開端 verify | 15 檔 / 178 項測試通過 |
| commit 身分 | `wayde.fu <123912239+waydefu@users.noreply.github.com>`，符合 noreply 要求 |

#### 第 3～5 步實際擋下的兩件事

新增的測試檔第一版含有真實形狀的合成憑證（AWS access key、JWT、帶帳密的 URL、
`password = "…"` 指派）。它們是測試資料，但**掃描器無法從外部分辨「合成」**：

1. **gitleaks 抓到 3 筆**（AWS ×2、JWT）；
2. 修掉後**公開端自己的 `check:secrets` 又抓到 2 筆**（credential-in-url、
   credential-assignment）——公開端的偵測器比 gitleaks 更嚴。

處置是把每一個 fixture 拆成片段組合，執行期才組回原值——這正是鏡像原本那支腳本
用來避免掃到自己的手法。**沒有**把測試檔加進豁免清單：那會讓日後真的混進金鑰時
完全不會被發現。

其中 `credential-in-url` 需要多一輪才修好：只把使用者名稱做字串內插不夠，因為
`${'user'}` 不含偵測器排除的任何字元，原始文字讀起來仍是一個完整的憑證 URL；必須
把 `//` 拆開才行。這一點已寫進測試檔的註解，否則下一個人「順手整理」就會把它接回去。

**解除條件**：第 7 步的公開推送需 owner 逐次同意。候選版本目前只存在於本機隔離
目錄，**未推送、未發布**。

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

### 5.4 API 健康檢查測試的偶發逾時：已處理，但理由與先前的判斷相反

前一份紀錄寫的是「**不應以調高 timeout 掩蓋**」。查證公開鏡像後這個判斷需要修正：
鏡像在 2026-07-29 發布時就已經設了 `testTimeout: 10_000`，而私有端**從來沒有設過**
這個值，一直沿用 vitest 的 5 秒預設。也就是說 5 秒不是刻意訂下的預算，只是沒人設過。

加上該測試單獨執行只需 327 毫秒，撞到上限的是序列化 pool 下的 Nest 啟動時間而非
測試本身變慢，因此對齊鏡像的 10 秒是修正落差，不是放寬標準。已設定並在
`vitest.config.ts` 註明理由，避免日後被當成「為了讓測試變綠而調的數字」。

**仍未處理**：收集時間偏長（本階段全批執行約 28 秒收集），那是獨立問題。

## 6. 下一位接手者從這裡開始

| 順序 | 待辦 | 卡在哪 |
| --- | --- | --- |
| 1 | `check-architecture.mjs` 抽出純函式並補測試 | 純技術工作，無阻塞 |
| 2 | `check-web-ui.mjs` 同上 | 1070 行，建議先切出核心 review 函式 |
| 3 | `checkPublicPageConfiguration` 的完整 fixture 測試 | 純技術工作 |
| 4 | 單元測試的收集時間（全批約 28 秒） | 與 `maxWorkers: 1` 的序列化取捨有關，需先量測再決定 |
| 5 | 回收兩份決定清單、召開 C0 | **需業主與各負責人**，這是目前唯一擋住整個專案往前走的事 |

**階段 0 至此結束。** 剩下的 1～4 項是可隨時進行的技術補強，不阻擋任何階段；
第 5 項才是關鍵路徑。

## 7. 本階段記錄的決策

無新決策。本階段執行的是 ENG-04 之後既有的 CONTRIBUTING 第 8 條（阻斷式檢查
視同產品程式碼，須附測試並定義三種工作區情境的行為）。

目前位置不變：**Stage 1**。本階段沒有建立任何雲端資源、沒有開啟任何路由、
沒有接觸任何真實病患資料，也沒有進行任何雲端部署；唯一的公開發布是 §5.1
記錄的受控公開鏡像同步。

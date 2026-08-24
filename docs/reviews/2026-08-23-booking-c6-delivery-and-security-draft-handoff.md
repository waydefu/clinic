# Booking C6 交付與資安草稿交接紀錄 — 2026-08-23

## 一句話

把 PR #24 從一個「證據已經對不上分支」的狀態收尾並合併：稽核出 C4 之後的八個
runtime commit、重新凍結候選、在過程中撞出並修好一個手機版真實缺陷、重新部署與
驗證、然後把原本全空的 21 項技術／資安清單做成草稿並更正一筆錯誤的核准歸屬。

## 交付的修訂版本

| 項目 | 值 |
| --- | --- |
| 分支 | `agent/booking-final-c4-vendor-handoff`（已合併）、`agent/cal-pilot-001-planning`（未開 PR） |
| PR | [#24](https://github.com/waydefu/clinic/pull/24) — **MERGED** `2026-08-23T10:01:10Z` |
| Merge commit | `dab4da70a8d183dd0ed15b9a2f0ff1963c93768d` |
| 起始 HEAD | `a9c525695c2920f82b5b5ead2def576ed8bbd927` |
| 最終 PR HEAD | `766617f6b880c6ce3e26b9868bf7d442f3aeaaa1` |
| 本次新增 commit | `ec6df85`（C5 授權）、`3a01e07`（**exact C6**）、`e168db7`（C6 授權）、`766617f`（C6 文件） |
| 規劃分支 commit | `b54be6e` |

候選演進，三個都保留在 ancestry 內，未改寫：

```text
b3bc477  C4  歷史候選
a9c5256  C5  已部署，後因手機缺陷被駁回
3a01e07  C6  exact deployed candidate
766617f      docs-only final HEAD
dab4da7      merge commit
```

## 稽核範圍與明確未覆蓋面

**讀到的：** 本 repository 的完整文件集與 `apps/`、`packages/`、`scripts/`、
`tests/`；GitHub PR/check-runs API；Firebase Hosting channel 清單與 staging
`live` channel 的 HTTP 標頭。

**未覆蓋：** 沒有任何 cloud backend、Firestore、Identity Platform 或 production
環境存在，因此**不可能**稽核它們。沒有存取 Google Calendar、憑證或真實資料。
Google Cloud 計費未查（尚無資源、無帳單）。本次是 repository 與 Hosting preview
層級的稽核，**不是 production 稽核**。

## 每道關卡的結果

**exact C6 `3a01e07` 同 commit CI** — [`32620288428`](https://github.com/waydefu/clinic/actions/runs/32620288428)：**11/11 PASS**

| 關卡 | 結果 | 實際數字／說明 |
| --- | --- | --- |
| 結構、文件、格式、lint、型別與單元測試 | PASS | structure 220 檔、docs 148 檔、**1057 tests / 64 test files** |
| Firestore Emulator | PASS | 交易、冪等、outbox、預設拒絕 |
| e2e-mobile | PASS | **含本次新增的成功狀態迴歸測試** |
| e2e-appointments / auth-rbac / patient-portal / ui / accessibility | PASS | 六組 E2E，含 WebKit |
| Tracked secrets、dependency audit 與 inventory | PASS | 549 tracked files |
| sast（Semgrep CE） | PASS | 0 findings |
| Verification evidence | PASS | 彙總五項必要 job |
| clinic freeze | PASS | **30/30 位元相同** |
| performance budget | PASS | 5 個進入點，gzip 傳輸量 |
| `verify:preview` | PASS | **474/474**，evidence commit `3a01e07` |

**最終 PR HEAD `766617f` CI**：11/11 PASS。與 `3a01e07` 的差異經
`git diff --name-only` 證明**全部落在 `docs/`，零 runtime 路徑**。

**規劃分支 `b54be6e`（docs-only）**：`check:docs` PASS（150 檔）、
`check:structure` PASS（220 檔、17 張 C6 圖）、Prettier PASS。
`test:unit`／E2E **NOT_RUN** — 該 commit 只改 `docs/`，未觸及程式或 gate 腳本；
需要完整結果時由 PR CI 執行，授權者為 repository 一般 PR 流程。

## 交付 artifact

| 路徑 | SHA-256 / 數量 |
| --- | --- |
| `docs/reviews/assets/ui-visual-c6-2026-08-23/manifest.json` | `21c617f9971ebe1811ab14d94d9dc915fcb965ebf6d6bc71def54b3eb8ab741a` |
| 同目錄 PNG | **17 張**，合計 1,670,364 bytes；每張的 route/role/viewport/state/console 計數與 SHA-256 綁在 manifest 內 |

Hosting preview：release `1787463112831000` / version `7476ea2e8cd6419b`
（`FINALIZED`），到期 `2026-08-30T05:31:16.323719674Z`。

## 發現並修好的缺陷

**手機版成功結果頁失去頁首與取消入口（已修）**

`showBookingResult()` 從未重設 `data-booking-flow-step`，成功畫面沿用了
`showStep(3)` 留下的 `"3"`。手機版「第二、三步只留當下操作」的 CSS 規則因此連結果頁
一起命中，`.patient-header` 連同「查詢／取消預約」、導覽與主題控制在 375px 全部消失。
患者剛訂完就找不到取消入口，只能重新整理。桌機不受影響——這正是所有桌機場景都通過的
原因。

**量化證據，不是推論：**

- 視覺擷取對 `#booking-management-open` 在 375×812 重試 **1539 次、逾 13 分鐘**後逾時，
  錯誤為 `element is not visible`；
- **負向對照**：移除修正後標記讀到 `"3"` 且新測試失敗，還原後通過。刻意損壞的版本
  **未進版控**；
- 同一組 17 場景在 C6 上 **1.4 分鐘**跑完。

修正為 `showBookingResult()` 設獨立的 `result` 標記，**唯一 runtime 變更，含註解 5 行**。
迴歸測試補在 `tests/e2e/mobile-layout.spec.ts`——原有的手機斷言全部停在步驟三，看不到
這個狀態，**這就是它能出貨的原因**。

**擷取工具選擇器歧義（已修，非 runtime 缺陷）**

第三步刻意重用了已核可的 `.booking-cancel-contact` class，導致該選擇器命中兩個元素、
觸發 Playwright strict mode。收斂為 `:not(.patient-contact-options)`，未改動出貨程式。

**歷史上被 gate 擋下的凍結檔違規（無需處理）**

`b1a1104` 修改了凍結檔 `apps/web/public/clinic-booking.css`，CI 當場轉紅，
`8cbc4d7` 還原。閘門有效運作，現行 HEAD 為 30/30 綠。

## 未處理事項

**這是本紀錄最重要的一段。**

1. **staging 專案的 `live` channel 有一筆無到期日的 release**
   （`1787409828279000`，`2026-08-22T14:43:48Z`，expiry `never`），超出 AGENTS.md
   安全邊界 8 的 preview authority。它是 staging、synthetic、`noindex`、無真實資料，
   依業主指示**未觸碰**，僅做唯讀調查。**待業主另行授權後清理。**
2. **`c139073` 完全沒有 check run**，從未被獨立驗證。分支 tip 是綠的，但那個 commit
   本身沒有證據。
3. **`google-calendar.ts:47` 仍請求最寬的 `auth/calendar` scope**，且**沒有任何測試
   釘住 `claims.scope`**。既有測試只斷言 `claims.aud`。此為既有程式的 least-privilege
   缺口，**刻意未在 PR #24 修改**，留作 Calendar／安全分支的第一個 code slice。
4. **T8 查價日期未填**、**T9 整區故障備援方案不存在**、**T13 C0 開關未動**、
   **所有核准簽名欄位留白**。詳見資安草稿。
5. **Calendar readiness 文件尚未修訂**（規劃分支的第二部分未做）。
6. **規劃分支 `agent/cal-pilot-001-planning` 尚未開 PR。**
7. `test:rules` 本機 **NOT_RUN**——工作區路徑含 CJK，Firestore Emulator JVM 無法解析；
   CI 上該 job 為 PASS。

### 同日追加決定（2026-08-23，稍晚）

以上第 1、4 項後續由業主與 wayde 在同一天對話中定案，記錄如下，**不改寫上方原始
清單**：

- **第 1 項（staging `live` channel）：業主決定現在不處理，先留著。** 理由：staging、
  synthetic、`noindex`、無真實資料，維持現狀不會造成傷害。**這是主動決定，不是
  仍在等待授權。** 待業主日後想清理時再另行給窄範圍授權。
- **第 4 項之 T8（查價日期）：wayde 確認維持留白，且明確定案為「動工前才查」，
  不是遺漏。** 已寫入資安草稿 T8 段落。
- **第 4 項之 T6（剩餘風險簽收）：wayde 已簽收本節框架與三項補償控制**，2026-08-23，
  已寫入資安草稿 T6 段落的核准紀錄區塊。**業主本人尚未對此項另行留下書面確認**——
  T6 指定業主與 wayde 共同為審查人，此次簽收由 wayde 完成，範圍僅涵蓋這一項殘餘
  風險，不代表 C0 整體結論變動。
- **T9（備援方案）與 T13（C0 開關）維持原樣未動**——兩者都需要實際的設計或核准
  行為，無法在對話中口頭定案。

## 本機環境陷阱

換一台機器或換個人都會踩到：

1. **pnpm 11 的 implicit deps-status check 觸發 Windows `EPERM`**（複製
   `@axe-core/playwright` 的 LICENSE）。解法：process-scoped
   `PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false`。這在 C4 當日紀錄裡已經出現過一次。
2. **`tmp/booking-c4` 只有 root `node_modules` junction、缺 per-package 樹**，
   `packages/contracts` 因此解析不到 `zod`。要在具完整環境的 worktree 驗證，
   或先確認 per-package `node_modules` 存在。
3. **ESLint 會掃進 `playwright-report/` 的壓縮產物**，一次報 1151 個錯。該目錄與
   `test-results/` 都在 `.gitignore`、未追蹤，fresh-clone CI 不受影響；本機跑 gate 前
   先清掉。
4. **逾時被中止的 git 指令會留下孤兒 `git.exe` 握著 `index.lock`。** 本次
   `git status --ignored` 逾時後留下兩個，12 分鐘後自行結束，但 lock 需手動移除。
   移除前務必確認沒有 git 行程還活著。
5. **共用的 dependency environment 把 `@beauessence/domain` 解析到 C3 worktree。**
   本次已驗證 `packages/` 與 `apps/web/public/vendor/` 在 `d9b6965`→`a9c5256` 之間
   **位元相同**，故對建置無影響；但下次 `packages/` 一有變動，這個假設就會失效。
6. **Hosting channel URL 的隨機碼不會因重新部署而改變。** `xvqa68cx` 橫跨 C4、C5、C6
   都相同，因為頻道未到期、每次都是就地更新。**判斷線上是哪個候選只能看 deployed
   commit，不能看 URL。**

## 本階段記錄的決策與剩餘風險

**未新增任何核准。** D-series 與 SEC-series 狀態全部不變，C0 仍為 `revise`。

**更正一筆歸屬（變嚴格）：** 登錄簿原記載 2026-08-16 的答案「由業主填寫」，並據此
認定核准人與核准日期兩欄已滿足。技術負責人於 2026-08-23 更正為「**業主口頭陳述、
技術負責人代為謄寫**」。這移除了核准人欄位而非只是削弱它——每一列比原記錄少滿足一欄，
缺口由三項增為四項。答案內容未變，2026-08-17 的 dated 紀錄原封不動。

**須具名簽收的剩餘風險（助理不代簽）：**

1. **實作者與審查人為同一人。** T6 指定業主與 wayde 同時擔任技術審查人與資安審查人，
   而 wayde 亦為實作者。**沒有第二雙眼睛。** 診所規模下通常無法避免，正規做法是登記為
   已知並接受，並以「全部走 PR＋必要檢查、bypass 使用留紀錄、高風險變更拆小附反向
   測試」作為補償控制。**不得寫成兩組獨立審查。**
2. **Firestore 權限只能設到整個 database 層級**，無法再細分。

## 下一位從這裡開始

1. **先讀** `docs/security/technical-security-decision-draft-2026-08-23.md`，確認 8 項
   建議值，並填入 T8 查價日期。**卡在：需要實際查閱 Google 官方價格表。**
2. **T9 備援方案**需要設計並演練，不能回填。**卡在：Stage 2 設計未開始。**
3. **不要**在 T8／T9 到齊前把 T13 的 C0 結論改為 `approved`。
4. **Calendar 規劃**：修訂 `docs/integration/google-calendar-pilot-readiness.md`，
   補上 D-009＋D-016＋Stage 2/3 三道 blocking gate、`calendar.app.created`、
   `timeMin`/`syncToken` 互斥、all-day fail-closed、工作臺無 server 的事實。
   **卡在：D-009 與 D-016 皆 pending。**
5. **第一個 code slice**（可獨立於真實 Calendar 進行）：`google-calendar.ts` 的
   scope 參數化＋`claims.scope` 迴歸測試。**卡在：無——這是既有程式的 hardening，
   不需要任何真實資料或憑證。**
6. **staging `live` channel 清理**需要業主另行給出窄範圍授權。

**仍然禁止：** 真實病患／職員／臨床／Calendar 資料、Calendar 連線與憑證、
cloud backend、live Hosting、`terraform apply`、公開預約。

## 目前 Stage 位置是否改變

**未改變。** 仍為 **Stage 1 owner decisions and governance approval**。
C0 仍為 `revise`。D-004／D-005 仍為 `pending`——C6 的 60 天視窗與 `>20 分鐘`
自助取消是 synthetic 驗收行為，**不是**已核准的正式規則。

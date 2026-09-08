# UI/UX 重設計 synthetic-review 預覽部署紀錄（2026-09-08）

## 結果

本次已將 UI/UX 重設計的 exact commit `73febfa0184b0d9ffc83b1f3dc6187e262517afb`
部署至既有 `synthetic-review` Hosting preview。這是公開可取得、`noindex`、合成資料
專用的靜態預覽；沒有更新正式網站，也沒有更新 CAL-PILOT staging。

預覽網址：
<https://beauessence-clinic-staging--synthetic-review-xvqa68cx.web.app>

## 授權與目標

| 項目 | 值 |
| --- | --- |
| 明確授權 | 業主於 2026-09-08 指示更新舊 `synthetic-review` |
| Exact source | `73febfa0184b0d9ffc83b1f3dc6187e262517afb` |
| Firebase project | `beauessence-clinic-staging` |
| Hosting channel | `synthetic-review` |
| 到期 | `2026-09-30T12:00:19.673634532Z`（2026-09-30 20:00:19 Asia/Taipei） |
| Operator | `wayde.fu@gmail.com` |
| Hosting release | `1788824248670000` |
| Hosting version | `832dfc10068e6f34` |
| Release time | `2026-09-07T23:37:28.670Z`（2026-09-08 07:37:28 Asia/Taipei） |

到期時間由部署時的整數分鐘 TTL 對齊至業主指定的 2026-09-30 20:00；Firebase
實際回報含約 20 秒的 API 建立延遲，以上列出的時間為線上 channel metadata。

## 建置與部署邊界

- 在 detached exact commit 建置，產生 83 個 dist 檔案，其中 59 個為 content-hashed。
- 首次本機 build 被 pnpm 的無互動 modules purge 保護中止；只在部署程序使用
  process-scoped `CI=true` 重跑，沒有修改 lockfile、依賴、Firebase 設定或原始碼。
- `check-performance-budget`、`check-clinic-freeze`、`check-design-tokens` 與
  `git diff --check` 均 PASS。
- 因共用 `firebase.json` 含 CAL-PILOT 的 `/v1/**` rewrite，本次用一次性的靜態
  Hosting config 部署同一 exact source；預覽版本沒有 `/v1/**`、Firestore、Cloud Run、
  Functions、Storage、Calendar、LINE、Meta 或 NAS rewrite。
- CAL-PILOT channel 與其 API、Worker、Scheduler、Firestore、Identity、Secrets
  均未修改。

## 線上驗證

| 檢查 | 結果 | 證據 |
| --- | --- | --- |
| `/clinic`、`/booking`、`/staff`、`/privacy` | PASS | HTTP 200；均留在專用 staging host |
| HTML 安全標頭 | PASS | CSP、COOP、CORP、`no-referrer`、`nosniff`、`DENY`、`noindex`、`no-cache` |
| hashed JS／CSS | PASS | HTTP 200；`public, max-age=31536000, immutable` |
| `/v1/health` | PASS | HTTP 404，證明本次靜態預覽沒有 backend rewrite |
| `verify:preview` | FAIL（462/463） | 唯一失敗是 root `/` 導向 `/clinic` 後，檢查器仍在 root HTML 找工作臺文案；同一文案在 `/staff` HTTP 200 頁面存在。這是驗證器路徑假設未同步，不是把它改寫成 PASS。 |

本次證據階梯為 **DEPLOYED-NOT-SMOKED**：部署完成且完成 HTTP／標頭／路由檢查，
但沒有把一次失敗的既有 `verify:preview` 檢查宣稱為全綠，也沒有進行真人裝置與讀屏
驗收。`verify:preview` 產生的失敗摘要保留於 git-ignored `output/evidence/`，不納入
產品文件資產。

## 瀏覽器 UI 驗收

使用 Codex in-app browser 對同一預覽網址完成人工 smoke check：

- 桌面預設視窗：`/clinic`、`/booking`、`/staff` 均可載入；首頁症狀導引、預約「初診 → 止鼾 → 時段 → 基本資料」流程與工作臺合成登入均可操作。
- 鍵盤：工作臺以 `Tab` 移動後，焦點有 `3px` 可見外框。
- 手機模擬 `375×812`：首頁、預約三步驟、基本資料表單與工作臺均無整頁橫向溢出；工作臺窄版導覽維持可水平滑動。
- 主題：預約頁的淺色與深色切換均可套用。
- 瀏覽器 console：上述頁面未見 error 或 warning。

這是瀏覽器模擬與合成資料 smoke check；真人 iOS／Android、Safari／Firefox／Edge、
讀屏、200%／400% 文字縮放與實機虛擬鍵盤仍屬 External manual verification required。
官方 `verify:preview` 的 462/463 路徑假設失敗仍存在，因此部署證據階梯仍維持
**DEPLOYED-NOT-SMOKED**，不把本節人工結果冒充成全套 deployment verifier 綠燈。

## 不變邊界與後續

- 正式 live channel、正式網域、Firebase backend 與真實資料均未部署或啟用。
- 本預覽只可用於 UI／UX 檢視；不得輸入真實患者、職員、薪資、行事曆或醫療資料。
- 應補一個後續小修正，讓 `scripts/verify-preview-deployment.mjs` 依目前 `/` → `/clinic`
  導向與 `/staff` 工作臺入口驗證，並在修正後重新跑線上 verifier；這不阻止本次靜態
  預覽存取，但目前證據仍保留 462/463 的真實結果。

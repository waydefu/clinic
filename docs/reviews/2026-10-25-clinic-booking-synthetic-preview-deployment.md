# 官網與預約頁 synthetic-review 預覽部署 — 2026-10-25

## 現行狀態

**DEPLOYED — 靜態預覽，官網與預約頁實機開啟正常；`verify:preview` 298/451，未通過項目如下如實記錄。**
本次只發 Hosting preview channel，沒有動 live、CAL-PILOT、Cloud Run 或任何後端。

| 欄位 | 結果 |
| --- | --- |
| 部署版本 | `main` `aee87f5b18f9e806b01840e7a9945a5391d0bfd4`（含官網改版 #249、預約頁換膚 #274） |
| 該版本 CI | `verify` on `aee87f5` — `success`（2026-10-24） |
| Firebase project | `beauessence-clinic-staging` |
| Hosting channel | `synthetic-review` |
| 期限 | `30d`（負責人選定；runbook 預設 7d，Firebase preview 上限 30d） |
| 預覽網址 | <https://beauessence-clinic-staging--synthetic-review-axk8tb6l.web.app> |
| 到期時間 | `2026-11-24T05:21:31Z`（2026-11-24 13:21 Asia/Taipei） |
| Release／version | `1792905762518000`／`76b931d65a047f62`，124 files |
| Release time | `2026-10-25T05:22:42Z`（13:22 Asia/Taipei） |
| live channel | 未變：仍是 2026-08-22 的 release `1787409828279000` |
| 執行者／核准者 | Claude Code（本機 session）執行；負責人（工程師）於對話中核准 |

## 核准

負責人在 Claude Code 對話中，看過版本、專案、頻道、期限與「只發 preview、不動 live」的說明後，
選擇「照這樣發預覽30天」。本紀錄就是 runbook 要求的逐次核准紀錄；此核准只涵蓋這一次部署，不可重用。

## 部署方式

- 從乾淨的 detached worktree `F:\診所專案\tmp\preview-main-aee87f5` 執行，HEAD 為上述 exact SHA；
  `pnpm install --frozen-lockfile` 後由 `hosting.predeploy` 重新建置（`apps/web/dist`，122 files，87 個內容雜湊檔）。
- 共用的 `firebase.json` 含 CAL-PILOT 的 `/v1/**` → Cloud Run `cal-pilot-api`（`pinTag: true`）rewrite。
  直接用它部署預覽，會在 CAL-PILOT 的 Cloud Run 服務上建立 tag，並讓預覽網址多出一條通往 CAL-PILOT API 的入口，
  超出靜態預覽的核准範圍。所以比照 [2026-09-08 部署](2026-09-08-ui-ux-redesign-synthetic-preview-deployment.md)，
  改用一次性的設定檔：內容與 `firebase.json` 的 `hosting` 相同，只移除 `/v1/**` rewrite。該檔沒有提交進 repo。
- 指令：`firebase --config <一次性設定> hosting:channel:deploy synthetic-review --expires 30d --project beauessence-clinic-staging`。

## 驗證

| 項目 | 結果 |
| --- | --- |
| `/clinic` 實機開啟 | PASS：標題「【測試用】鼻功能與睡眠呼吸照護｜一森渼診所」，ONLINE PREVIEW 標記與新版頁首顯示，主控台無錯誤 |
| `/booking` 實機開啟 | PASS：標題「【測試用】線上預約｜一森渼診所」，合成測試提示與第一步正常，主控台無錯誤，沒有任何 `/v1` 請求 |
| `/v1/health` | PASS：HTTP 404，證明預覽沒有 backend rewrite |
| `verify:preview` | **FAIL 298/451**，見下 |

`verify:preview` 的 153 項失敗：

- 152 項是雜湊過的 `*.js`／`*.css` 沒有帶 CSP 與 `X-Frame-Options`。`main` 的 `firebase.json` 對這些檔案本來就只設
  `Cache-Control`（一次性設定沒改標頭），CSP 只在 HTML 進入點設定。這是驗證腳本與現行設定不一致，不是本次部署造成。
- 1 項是工作臺頁缺「公開預覽，網址持有人皆可存取」文字，與 2026-09-08 紀錄的同一類路徑假設不一致。
- 官網與預約頁的 HTML 進入點檢查沒有失敗。腳本是否要依現行標頭設定更新，另行處理，本次不修改 gate。

## 沒有做的事

- 沒有發布 live、沒有動 CAL-PILOT、Cloud Run、Firestore、Functions、Storage、Calendar 或任何真實資料。
- 本機沒有跑 `pnpm verify`；改以同一 SHA 的 GitHub CI 結果為準（依執行電腦限制）。

## 下架

到期自動失效；提前下架：`firebase hosting:channel:delete synthetic-review --project beauessence-clinic-staging --force`。

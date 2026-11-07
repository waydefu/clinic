# CAL-PILOT：50 次以上隔離合成日曆驗收作業單

狀態：**未執行、未授權外部操作**。本文件及觀察值檢查器不是實測腳本、不是部署授權，也不證明 provider 收斂。實際操作須有新的明確授權，指定 exact SHA、隔離專案、專用合成日曆、操作者、資料範圍、時間與到期；核對當時決策登記簿的 CAL-PILOT 範圍與有效期限。不得使用正式診所日曆、真實病患、憑證檔或未獲授權的環境。

## 作業前核對

- 保持既有排程 PAUSED；手動觸發 worker 與任何設定變動均需列入另次精確授權。不得部署、解鎖 stuck owner、改 IAM、取用或輸出憑證，亦不得把資料寫進此儲存庫。
- 操作者先隔離專用 synthetic 測試對象，預備已知的合成 Firestore 欄位與日曆資料；保留可審核的外部操作紀錄，但不匯出任何原始事件或可能含個資的日誌。
- 定義固定的 synthetic linkId 集合；每次必須完整列出該集合。建立和保護 mirror 原始 event ID；重複事件只有在三項 ownership 證明齊全且帶 If-Match 時才可刪。
- 準備故障個案：dispatch 中 lease 遺失、412、503、回覆結果不明、重複事件、cursor 失效、進程重啟續掃、stuck owner。現階段沒有獲准的真實 provider 故障注入方法；未另獲授權前不得製造這些故障。

## 合成日曆設定過期時的續期

`calendar_pilot_configuration/active` 的 `expiresAt` 過期後，所有日曆寫入路由（含 preflight／activate）都回 503，且 bootstrap 預設模式拒絕覆寫既有文件。續期須有負責人核准，且只能在已獲授權的 C1 視窗內進行；仍未過期的設定一律拒絕續期。

`--renew-expired` 只在同一個 transaction 內更新 `expiresAt`（須為未來且不超過 31 天）並把 `version` 加 1，另新增一筆 `c1_calendar_sync_renewed` 稽核紀錄（含前後到期時間、操作者、原因）。設定與來源不是 synthetic C1、`workerLeaseOwner` 有值、文件缺漏時，整筆不寫入。不改 health、啟用旗標、來源或 lease。

```text
GOOGLE_CLOUD_PROJECT=beauessence-clinic-stg-c1a01 C1_CALENDAR_SYNC_BOOTSTRAP_CONFIRM=YES C1_CALENDAR_SYNC_AUTHORITY_SHA=<40 位 exact SHA> C1_CALENDAR_SYNC_EXPIRES_AT=<未來 31 天內的 UTC，如 2026-12-07T12:00:00.000Z> C1_CALENDAR_SYNC_OPERATOR=<操作者> C1_CALENDAR_SYNC_RENEW_REASON=<原因與核准引用> node scripts/c1-calendar-sync-bootstrap.mjs --renew-expired
```

## 觀察與停止條件

逐次在獲准範圍內完成至少 50 次有唯一流水號的操作與獨立觀察，包含上述有授權的故障案例，並等待完整一輪掃描；不要把一次掃描的多個 slice 當成多次操作。每次逐 linkId 核對 Calendar 全部分頁與 Firestore 正本：

1. `converged`：恰有一筆有效事件、正本 ID 正確，且 title、start、end 與 Firestore 的合成期望一致；重跑完整一輪沒有 provider mutation。
2. `conflict` 或 `blocked`：記錄該狀態與原因，**不得計入收斂**。503 的保留 owner、結果不明與 stuck owner 不因 lease 到期而接管。異常寫入當輪不重試、不重新 GET ETag 後重寫。
3. 一旦發現非合成資料、目標不符、未授權操作、資料損毀或無法確認效果，立即停止；保留證據，依另行核准的 runbook 處置，不自行清除 owner 或資料。

每個成功 link 的 expectedDigest 與 observedDigest 應由操作者分別對 Firestore 合成期望與 provider 觀察，以相同順序、相同 UTF-8 JSON 序列化下列欄位後計算 SHA-256：`id`、`linkId`、`status`、`title`、`startsAt`、`endsAt`；時間先換成 UTC ISO 字串。對每次操作分別統計完整分頁中有效事件數。這是摘要比對，不取代原始來源、ownership、If-Match 及獨立證據檢查。

## 離線觀察值檢查器

`scripts/calendar-pilot-observation-check.mjs` **只檢查操作者整理好的去識別合成 JSON**，不執行 Calendar、Firestore、worker 或故障注入；請勿把原始資料、事件內容、email、URL 或憑證放進檔案或版本庫。輸入為至少 50 個 observation 的陣列，每個 observation 有唯一正整數 `trial` 和非空 `links`；各輪 linkId 集合相同且 ID 為 `synthetic_` 開頭。每個 link 提供 `id` 與 `outcome`；`converged` 另提供 `eventCount: 1`、`expectedDigest`、`observedDigest`（小寫 SHA-256）。`blocked`／`conflict` 另由操作紀錄解釋原因。

```text
node scripts/calendar-pilot-observation-check.mjs <sanitized-json-path>
```

輸出只有次數、blocked、conflict 和 `allConverged`；blocked 或 conflict 會使程序非零退出。檢查器無法證明觀察來源、操作確實執行、JSON 真實或外部寫入安全；不得把人工輸入當成 provider 實測。將 exact SHA、授權引用、隔離目標、觀察時間、完整分頁與獨立核對結果交由負責人驗收。此準備工作不授權或執行真實環境測試。

## 操作者執行腳本（未執行）

`scripts/calendar-pilot-fault-trials.mjs` 是供**另行獲准的操作者**使用的試驗執行器；本儲存庫與 CI 不執行它，也不含任何 Calendar 或 Firestore 存取程式。預設為 dry-run，只印出 50 次以上的試驗計畫（八種故障輪流），不碰任何外部系統：

```text
node scripts/calendar-pilot-fault-trials.mjs --links synthetic_a,synthetic_b [--trials 50]
```

實際執行須同時具備旗標 `--execute-synthetic-trials`、`--driver <path>`（操作者自備、經授權的 ESM 模組，匯出 `runTrial({ trial, scenario, links })`，回傳每個 link 的 `{ id, outcome, eventCount, expected, observed }`）、`--out <新檔路徑>`（已存在則拒寫），以及環境變數 `CALENDAR_PILOT_TRIAL_PROJECT_ID=beauessence-clinic-stg-c1a01`、`CALENDAR_PILOT_TRIAL_CALENDAR_ID`（須為 `synthetic…@group.calendar.google.com` 的專用合成日曆，`primary` 或一般信箱一律拒絕）、`CALENDAR_PILOT_TRIAL_AUTHORIZATION`（授權引用編號）。缺任一項即拒絕。腳本只把 expected／observed 欄位依上節規則算成 SHA-256 後寫出，不保存原始事件；輸出可直接交給 `calendar-pilot-observation-check.mjs`。

參數防護自檢（離線、不連外）：`node scripts/calendar-pilot-fault-trials.selfcheck.mjs`；與 `calendar-pilot-observation-check.selfcheck.mjs` 一樣，目前須手動執行，未接入 package.json 或 CI。真實 50 次以上試驗**尚未執行**。

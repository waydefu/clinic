# 2026-11-18 C1 窗口計畫：補齊 C2～C5 實測並做 C6 合成整合

狀態：**計畫，尚未執行**。負責人 2026-11-17 指示「明天一次搞定到 C6」；本檔是開窗前要核准的範圍與上限。核准只涵蓋本檔列出的動作與次數，超出就停下回報。

- 專案：只用 C1 `beauessence-clinic-stg-c1a01`，不碰 CAL-PILOT `beauessence-clinic-staging`。
- 資料：只用合成資料與專用測試行事曆（密鑰 `c1-synthetic-calendar-id` v2 指向的那一個）；不碰真實病患、正式行事曆、正式 DNS。
- 映像：沿用 11/16 部署的 api `sha256:f70721cf…`、worker `sha256:58a939bd…`（main `df63bb85`），**不重建、不換映像**。
- 登入：負責人本人輸入 Google＋TOTP；Claude 不碰密碼與驗證碼。人員帳號在紀錄中一律遮蔽。

## 0. 兩條護欄

1. **保護 C3 七天讀回**：11/16 在內建瀏覽器以主管帳號建立的 session 要留到 11/23 讀回。整個窗口主管帳號**不登出、不停用、不重新登入**；櫃台測試改在 Chrome（另一組 cookie）。登出會撤銷該帳號全部 refresh token，所以只對櫃台帳號做。
2. **worker 寫入只在本窗口**：worker 讀 `platform_controls/maintenance`（見 [11/16 讀回更正](../reviews/2026-11-16-maintenance-secrets-c2-c5-readback.md)），另有處理開關與排程暫停。關窗三道都要恢復：維護 `true`、處理開關 `false`、兩個排程 `PAUSED`。

## 1. 補齊 C2～C5

| 步驟 | 動作 | 補的片 | 上限 |
| --- | --- | --- | --- |
| 1.1 開窗 | `platform_controls/maintenance` 設 `underMaintenance:false`（有到期時間） | — | 1 次寫入 |
| 1.2 櫃台登入 | 負責人在 Chrome 用櫃台測試帳號登入 `/staff?internalTestBooking=1`（此帳號已存在於 C1 Identity Platform、未停用；是否在櫃台名單以登入結果為準，不讀密鑰內容） | C4 | 登入 ≤ 2 |
| 1.3 櫃台允許 | 看預約與班表；建立 1 筆合成預約後取消 | C4、C5 | 建立 1、取消 1 |
| 1.4 櫃台拒絕 | 報表、CSV 匯出建立應回 403 | C4、C5 | 拒絕嘗試 ≤ 3 |
| 1.5 停權 | Admin SDK 停用**櫃台帳號** → 下一個請求應回 401 `account_disabled` → 立即恢復 | C2、C3 | 停用 1、恢復 1 |
| 1.6 登出 | 櫃台帳號登出 → 讀回 `calendar_pilot_sessions` 該筆 `revokedAt` 有值 | C3 | 登出 1 |
| 1.7 稽核讀回 | 統計窗口期間 `audit_events`、`calendar_pilot_audit_events` 新增筆數與 action（不讀內容） | C5 | 唯讀 |

若 1.2 登入後角色不是櫃台（名單沒有此帳號），停下回報；把帳號加進櫃台名單屬改密鑰，要另外核准。

## 2. C6 合成整合

前置（窗口開始時確認）：

- 專用測試行事曆已分享給 `internal-test-outbox`（可修改事件）與 `internal-test-calendar-sync`（可看事件詳細資料）兩個服務帳號；負責人在 Google Calendar 設定頁確認，Claude 不改分享。
- C6 Terraform plan 已於 11/17 讀回無差異（Calendar API 已啟用）。

| 步驟 | 動作 | 上限 |
| --- | --- | --- |
| 2.1 開 worker 處理 | `c1-internal-test-run` 以私有 `c1-stage-c6-private.tfvars`（與 stage 2b 只差 `worker_processing_enabled=true`）plan → 負責人看 plan → apply。plan 若動到 API 服務或任何非 worker 資源就停下 | apply 1 |
| 2.2 投影 | 用 1 筆合成預約，手動觸發 `internal-test-outbox-drain`（先試 `gcloud scheduler jobs run`；若因暫停被拒，改為 resume → run → pause，期間每分鐘也會自動跑，照分鐘數計入上限） | drain ≤ 5 次、行事曆寫入 ≤ 10 |
| 2.3 讀回 | 在測試行事曆看到合成事件（只有假名化內容）；calendar-sync 手動觸發 1 次確認收斂 | calendar-sync ≤ 5 次 |
| 2.4 衝突 | 負責人在測試行事曆把該事件改時間 1 次 → calendar-sync 1 次 → 預期 `calendar_pilot_audit_events` 出現 `calendar_reconciliation_conflict`、員工 UI 候選有衝突計數。觸發方式來源未確認，沒出現就記「未證明」，不臨場改程式或設定 | 手動改 1 |
| 2.5 補償 | 取消該預約 → drain → 行事曆事件被移除或標記取消 | 含在 2.2 上限內 |
| 2.6 預約仍未對外 | 直連 `/v1/bookings` 公開寫入維持 UNROUTED | 唯讀 1 |

不做：Calendar watch 接線（未掛載，另案）、真實行事曆、OAuth redirect、`calendar-pilot-fault-trials`（需 50 次以上，另排）。

## 3. 關窗

1. 維護文件設回 `underMaintenance:true`。
2. `c1-internal-test-run` 以 stage 2b tfvars plan → apply（`worker_processing_enabled=false`）；排程確認 `PAUSED`（若 2.2 有手動 resume，這裡由 Terraform 收回）。
3. 讀回：兩個排程 `PAUSED`、worker env 為 `false`、直連 API 回 503、Hosting `/booking`、`/staff` 200、櫃台帳號 `disabled:false`、主管 7 天 session 仍有效且未撤銷。
4. 測試行事曆上殘留的合成事件，若補償沒有清掉，由負責人手動刪除並記錄。
5. 報告寫成 `docs/reviews/2026-11-18-c1-window-c2-c6.md`，同時更新 [C2～C6 申請](2026-11-15-c2-c6-rc-deployment-requests.md) 總表與 [RC 交付計畫](2026-11-08-phase1-rc-delivery-plan.md)。

## 4. 停止條件

任何一項成立就停下、照第 3 節關窗、回報：出現非合成資料；目標專案或行事曆不符；plan 動到預期以外的資源；任何上限用完；主管 session 被撤銷或失效；API 或 worker 出現未預期的 5xx 連續 3 次以上。

## 5. 仍留待之後

- C3 七天讀回：最早 2026-11-23 08:23 UTC。
- C5 每月專案外匯出（2 年）：要先決定外部儲存位置。每週備份來源已合併（#528），apply 另核。
- C2～C6 以凍結 RC 版本重部署：凍結後。
- B-01、B-02、NEW-10（見 [11/17 IAM 讀回](../reviews/2026-11-17-iam-readback.md)）。

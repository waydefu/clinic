# 11/21 C1 窗口讀回（實際 11/21 16:41Z 起套用、11/22 08:19Z～08:53Z 開窗）

- 依據：[11/21 C1 窗口計畫](../plans/2026-11-21-c1-window-plan.md)
- 專案：`beauessence-clinic-stg-c1a01`（C1 隔離預覽）；CAL-PILOT 專案未碰
- 來源：`main` `4050a3f2104dbcb77ccf28d77933aa24ebb55ada`（CI 綠）；Cloud Build `147c6ece` SUCCESS
- 映像：`internal-test/api@sha256:05d9e835…`、`internal-test/worker@sha256:9dc8fdf5…`
- 每一筆雲端寫入都經負責人逐項核准；全程只用合成資料

## 1. 時序

| 時間（UTC） | 事件 |
| --- | --- |
| 11/21 16:41 | 負責人晚開；重跑 `c1-internal-test-run` plan，與前一天的預跑完全一致 |
| 11/21 16:4x | 負責人核准 → apply：`5 added, 4 changed, 1 destroyed` |
| 11/21 夜間 | Hosting 部署因本機依賴安裝失敗而延後；維護 `true` 擋全部請求，排程維持暫停 |
| 11/22 08:19 | Hosting API 版部署（`firebase.isolated-api-preview.json`）；`/v1/health` 200 |
| 11/22 08:20 | 維護 `false`（`expiresAtUtc: 2026-11-22T12:00:00Z`），正式開窗 |
| 11/22 08:21～08:50 | 測項 3.1～3.5 |
| 11/22 08:51 | 維護 `true` |
| 11/22 08:5x | stage1 apply `0 added, 3 changed, 0 destroyed`；Hosting 換回靜態版（`/v1/health` 404） |
| 11/22 09:0x | 負責人核准後套用 C5 每週備份：`1 added` |

## 2. 開窗套用（第 2 節三類差異）

與計畫第 2 節完全相符，無額外差異：

- (a) `internal-test-api` → `internal-test-api-00042-psz`；`internal-test-outbox` → `-00023-tlr`；`internal-test-calendar-sync` → `-00010-d2l`，皆為 latest 100%（其餘 tag 為舊 Hosting 預覽，0%）
- (b) 刪除 `google_project_iam_member.terraform_ci_stage_f["roles/iam.serviceAccountUser"]`；新增 5 筆 `google_service_account_iam_member.terraform_ci_act_as_runtime[api|worker|scheduler|builder|calendar_sync]`（#535 生效）
- (c) `google_cloud_scheduler_job.calendar_sync["enabled"]` 已知 `max_doublings` 差異，仍為 `PAUSED`

## 3. 開窗前唯讀核對

- `calendar_pilot_configuration/active`：`health: healthy`、`workerLeaseOwner: null`、到期 `2026-12-16T04:51:37.000Z`
- 主管 session 2 筆有效未撤銷（到期 `2026-11-23T08:23:46Z`），本窗口未碰
- 先前櫃台 session 已撤銷；outbox 6 筆皆 `completed`

## 4. 測項結果

| 測項 | 結果 | 證據 |
| --- | --- | --- |
| 3.1 `calendar-sync` 健檢 | **PASS** | 200；`service: "calendar-pilot-worker"`，有 `worker_started`、`calendar_sync_completed`（`failedJobs: 0`、`syncMode: full`）；無 5xx。#532／#533 驗證 |
| 3.2 合成建立與投影 | **PASS** | 合成預約 `c5e54bd3…`（11/25 12:00）；`drain` 1 次 → `calendar_projection_requested` completed、attempts 1；測試目的地日曆出現「一森渼診所 初診」，建立者為 `internal-test-outbox` SA，標題與內文無個資；`calendar-sync` 第 2 次 completed |
| 3.3 外部異動衝突偵測 | **PASS** | 在測試目的地日曆手動把事件改到 12:30（1 次）→ `calendar-sync` 第 3 次 `incremental`、`candidates: 1`；`calendar_candidate_created` 新增 |
| 3.4 取消畫面與補償 | **PASS** | 員工頁取消後顯示「預約已取消並釋放時段」，列表當下變「已取消」，**未**出現「服務暫時無法使用」（#534 驗證）；`drain` 第 2 次 → cancelled 投影 completed；日曆事件已移除 |
| 3.5 稽核與登出 | **PASS** | `audit_events` 新增 `appointment_confirmed` 1、`appointment_cancelled` 1；櫃台 session 2 筆皆已撤銷（見第 6 節）；主管 session 未碰 |

## 5. 用量（皆在上限內）

| 項目 | 實際 | 上限 |
| --- | --- | --- |
| 合成預約建立／取消 | 1／1 | ≤ 2／≤ 2 |
| 櫃台登入 | 2 | ≤ 2 |
| `internal-test-outbox-drain` | 2 | ≤ 5 |
| `internal-test-calendar-sync` | 3 | ≤ 5 |
| 日曆手動改時間 | 1 | 1 |
| 維護寫入 | 2 | 2 |
| `c1-internal-test-run` apply | 2 | ≤ 2 |
| C5 apply | 1 | ≤ 1 |

排程一律 `resume → run → pause`，結束時兩個排程皆 `PAUSED`。

## 6. 發現（只記錄，窗口內未改程式或設定）

1. **health 停在 `syncing`**：`drain` 取得 worker lease 時把設定改成 `syncing`（`calendar-pilot-runtime.ts`），之後 `calendar-sync` 完成也沒有轉回 `healthy`；lease 已正常釋放。需確認 `commit.completedAt` 何時為空（`firestore-calendar-sync.repository.ts` 轉 `healthy` 的條件）。
2. **`calendar_reconciliation_conflict` 偏多**：窗口內 3 次同步新增 40 筆，疑似每次對帳都對舊鏡像重記衝突。需查是否重複記錄。
3. **櫃台 session 重複換發**：同一個瀏覽器新開分頁時又換發了一筆 session，前一筆變成無法登出的孤兒。本次以 Admin SDK 只撤銷那一筆（role `front_desk`、依 `createdAt` 精確比對）。
4. **Google 轉址登入偶發失敗**：第一次登入出現 Firebase「missing initial state」（sessionStorage 遺失）；在一般視窗的新分頁重試就成功。
5. **本機依賴安裝**：pnpm 全域 store 有檔案權限損壞（使用者無法讀取），`pnpm install` 會卡在 `ERR_PNPM_EPERM`；改用獨立 store 後正常。屬本機環境問題，不影響 repo。

## 7. 關窗讀回

- 維護 `true`；兩個排程 `PAUSED`
- `internal-test-api-00043-rbn`：`INTERNAL_TEST_BOOKING_ENABLED=false`、`INTERNAL_TEST_BOOKING_EXPIRES_AT_UTC=2026-10-02T12:00:00Z`、`BUSINESS_DELIVERY_ENABLED=false`
- `internal-test-outbox-00024-ql9`：`INTERNAL_TEST_OUTBOX_PROCESSING_ENABLED=false`
- Hosting 靜態版（`firebase.isolated-preview.json`）：`/staff` 200、`/v1/health` 404
- C5：新增 `google_firestore_backup_schedule.weekly[0]`（每週日、保留 `8467200s`）；原每日排程（`2592000s`）保留
- `.terraform.lock.hcl` 與 `apps/web/public/vendor/domain/` 已還原

## 8. 未做／延後

- 計畫第 6 節 `c1-foundation`：延後。provider 預設會重新啟用 11/17 停用的 CI 帳號，等 R2 的 `disabled` 變數 PR
- Gate 2（50 次正常收斂）：不在本窗口範圍

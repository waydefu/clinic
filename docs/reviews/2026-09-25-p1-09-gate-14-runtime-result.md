# P1-09 Gate 14 runtime 重驗結果（2026-09-25）

**結論：** `GATE_14 = NOT_PASS`。主要生命週期在 716aaf4 映像上跑通，但同一 idempotency 重送回 `409 CONFLICT`，而錯 ETag／錯連結／缺失 appointment 三個 fail-closed 情境沒有 runtime 證據。429 與切流量依授權條件都沒有執行。`P1_09 = NOT_CLOSED`。

## 範圍與授權

- 業主簽回的 `P1-09-C1-SYNTHETIC-CLOSEOUT`，時窗 UTC `2026-09-25T05:00:00Z` 至 `2026-09-30T12:00:00Z`。
- `main` 在執行前前進到 `c420f18`（只有文件）。業主明確授權「仍沿用 716aaf4 的映像做 Gate 14」。
- 專案 `beauessence-clinic-stg-c1a01`，區域 `asia-east1`，只打 0% tag `p109716aaf4`：
  - API `internal-test-api-00035-beb`，`sha256:da74e119d0583926651168985eb178c3158b65a5e0de87ee25862f277ed69719`
  - calendar-sync `internal-test-calendar-sync-00002-zeq`，worker `sha256:6a4888aa6600102287290603e4b2fc0a10352b9f7dd960b04a2dbec411e7b477`
  - 三個 revision 的 `INTERNAL_TEST_SOURCE_SHA` 都是 `716aaf4f97d77eb87aead6d15b70a2936e676831`
- Cloud Build `4306b761-851f-43ee-8957-a56c379370b2` SUCCESS。Terraform 只跑了唯讀 plan（0 add／4 change／0 destroy），沒有 apply。

## 執行序列（UTC）

| 時間 | 動作 | 結果 |
| --- | --- | --- |
| 17:54 | 操作者在隔離瀏覽器以 manager + TOTP 登入 | 工作階段成立，角色 `manager` |
| 17:59:40 | 唯一一次 Calendar 編輯：同一合成事件開始時間 12:00 → 12:30（台北） | 已儲存，標題不變，日曆為 CAL-PILOT 測試目的地 |
| 17:59:50 | 手動同步 1／2，POST tag `/tasks/calendar-sync` | `200`，full sync，seen 33，新增候選 1 |
| 18:00:49 | reject 送到錯的路徑 `/v1/calendar-pilot/...` | `404`，無任何寫入（讀回確認） |
| 18:01:31 | staff reject，tag `/v1/calendar/candidates/:id/reject` | `201`，候選 `rejected`，版本 1 → 2 |
| 18:01:33 | 同一 idempotency key 與 body 重送一次 | `409 CONFLICT` |
| 18:02:42 | 手動同步 2／2（處理 restore outbox） | `200`，processedJobs 1，failedJobs 0，incremental seen 1，新候選 0 |
| 18:03:12 | 獨立讀回同一 Calendar event | 標題與時段等於 SoT |
| 18:04 | 撤銷 staff 工作階段、關閉並刪除瀏覽器設定檔 | 撤銷 `200`，之後讀取 `401` |

## 斷言

| 斷言 | 結果 | 證據 |
| --- | --- | --- |
| 編輯後恰好一筆 pending `update_appointment` | PASS | 候選數 30 → 31 |
| 恰好一筆 reject audit | PASS | `calendar_candidate_reject` 1 → 2（1 筆為 2026-09-23 歷史） |
| 恰好一筆 restore outbox | PASS | 新增 1 筆 `calendar_projection_restore`，`writeMode=update_existing`，最後 `completed`，attemptCount 0 |
| SoT 沒被 Calendar 偷改 | PASS | appointment `startsAt=2026-09-24T04:00:00.000Z`、`version=1`、updateTime 仍為 2026-09-23 |
| 同一個 `externalEventId`、沒有第二個 event | PASS（Firestore 與同步證據） | 鏡像數 33 不變；同 external ID 的鏡像只有 1 筆；restore 後 incremental 只看到 1 個事件。沒有用日曆總覽再掃一次（原因見「事件」） |
| 回復後標題與時間等於 confirmed SoT | PASS | 獨立讀回 `[預約] A01｜初診｜止鼾`，台北 9/24 12:00–12:30 |
| 重送不增加 audit／outbox | PASS | 重送後 audit 36、outbox 2、idempotency 3，都沒有再增加 |
| 重送回傳原本的回應 | **FAIL** | 得到 `409 CONFLICT` |
| 錯 ETag／錯連結／缺失或取消的 appointment fail closed | **NOT_RUN（runtime）** | 只有 `tests/firestore/calendar-candidate-review.test.ts` 的 source 證據；runtime 預算只夠一次正向流程 |
| 既有 unmatched 集合不變 | PASS | 29 筆；本次同一算法前後雜湊皆為 `E973ED79C45A24B1B6B70705CE7F2246456A71D94AF5DEA49A12CB931EFB5A3C`。與 2026-09-24 交接文件的雜湊算法不同，不直接比較 |
| 沒碰到正式 Calendar | PASS（寫入） | 唯一的寫入在 CAL-PILOT 測試目的地。讀取有例外，見「事件」 |
| 設定 `calendar_pilot_configuration/active` 未被改寫 | PASS | version 1、`sourceSha=caaa69e`、health `healthy`、無 lease |

## 發現：重送回 409（CONFIRMED）

`ClinicCalendarReviewApplicationService.tryReview`（`apps/api/src/calendar/clinic-calendar-review.application-service.ts`）先讀候選，並在 `stored.expectedVersion !== command.expectedVersion` 時直接丟 `ConflictError`。第一次拒絕後，候選版本已經是 2，所以同一 idempotency key 的重送永遠到不了 `FirestoreCalendarPilotRepository.reviewCandidate` 裡的 idempotency 重播分支。副作用是安全的（沒有重複的 audit／outbox），但客戶端重試會看到衝突，而不是原本的成功回應。修正應放在 review 的擁有邊界，並補一個會先失敗的回歸測試。

## 事件：讀到正式診所日曆

為了確認操作者帳號看得到合成事件，代理開了 Google Calendar 的日視圖。那個畫面同時顯示操作者可見的正式診所日曆，真實預約內容因此出現在代理的工具輸出裡。處理方式：

- 立刻關閉該分頁。確認沒有任何檔案、紀錄或 git 內容保存了這些資料。本文件不引用任何內容。
- 之後只用「直接開啟單一合成事件」的方式編輯與讀回，並檢查頁面沒有出現正式日曆名稱。
- 沒有對正式日曆做任何寫入。
- 瀏覽器設定檔（內含操作者的 Google 登入）已刪除。

之後的 runtime 驗收不要用操作者帳號的日曆總覽畫面。

## 沒有做的事

- 429 測試（前提是 Gate 14 PASS）：`NOT_RUN`。
- Cloud Run 流量與 Hosting `internal-preproduction` `/v1/**` 切換：`NOT_RUN`。
- Terraform apply：沒有執行。
- 沒有新增 IAM。代理 worker 服務帳號需要 `iam.serviceAccounts.getAccessToken`，這個權限不在授權內，所以 Calendar 操作改用操作者帳號。

## 執行後狀態（18:04 讀回）

- API 100% `internal-test-api-p109durable1`（tag `fh-4f2b6f65fe8cc288`），新 revision 0% tag `p109716aaf4`。
- outbox 100% `internal-test-outbox-00012-vzl`；calendar-sync 100% `internal-test-calendar-sync-00001-422`；兩者的新 revision 都是 0% tag `p109716aaf4`。
- 排程 `internal-test-calendar-sync` `PAUSED`，`internal-test-outbox-drain` `ENABLED`。
- Hosting `internal-preproduction` version `4f2b6f65fe8cc288`，到期 `2026-10-19T20:38:03Z`。
- 預算使用：Calendar 編輯 1／1、手動同步 2／2、staff reject 1／1、重送 1／1、restore 1／1、獨立讀回 1／1、429 送出 0／20。

## 下一步

1. 修正重送 409（source PR + 回歸測試），CI 綠燈後合併，形成新的 exact SHA。
2. 新 SHA 需要重新 build、0% 部署，並重新核准 Gate 14 預算。這次的 Calendar 編輯與手動同步額度已經用完。
3. 新的 Gate 14 應把 fail-closed 負向情境納入 runtime 預算，或由業主明確接受 source 證據。
4. Gate 14 全部 PASS 後才做 429，兩者都通過才切流量。

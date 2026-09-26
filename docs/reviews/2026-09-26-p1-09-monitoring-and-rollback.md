# P1-09 監控修正、告警實測與回退演練（2026-09-26）

**結論：** 9 條會通知真人的 WP-B4 告警原本永遠不會被真實事件觸發，現已修正並套用到 C1。真實路徑的告警已實際觸發，等待業主確認收件（`humanInboxProof` 尚未取得）。回退演練完成。另更正前一份紀錄：429 只證明了 HTTP 429，持久計數擋下的證據沒有取得。`P1_09 = NOT_CLOSED`。

## 更正：P09-11 持久 429

前一份紀錄（[切換結果](2026-09-26-p1-09-traffic-cut.md)）把 429 記為 PASS，這是錯的。`WpB2RateLimiter` 先過記憶體內的 burst 限流，擋下時不會寫 Firestore。第 11 次請求被擋之後，`lookup_identity_failure` 的紀錄仍是 count 10、沒有鎖定時間；如果是 Firestore 擋下，紀錄會出現鎖定時間。所以這次是 burst 擋下的。

依 operator packet 的規則，P09-11 應為 `HTTP_429_PROVEN / DURABLE_REJECTION_NOT_PROVEN`。要補證明，得在同一個時間窗內讓第 11 次請求落到沒看過前 10 次的新 process，例如另開一個同 digest 的 0% revision。這至少需要 11 次送出；本時窗的 20 次額度已用 16 次，不夠，需要新的額度。

## 監控缺陷（CONFIRMED）

- 10 條告警政策的條件都寫死 `resource.type="global"`。
- 過去 30 天的時間序列顯示，真實事件都在 `cloud_run_revision`：`wp-b4-auth-failure` 14 條、`wp-b4-authz-denial` 5 條、`wp-b4-http-5xx` 2 條、`wp-b4-outbox-oldest-age` 7 條。`global` 只有先前的合成 log。
- 影響：真實的 5xx、outbox 積壓、dead-letter、認證或授權異常，都不會通知任何人。

### 修正過程

| 步驟 | 結果 |
| --- | --- |
| [PR #172](https://github.com/waydefu/clinic/pull/172)：拿掉 `resource.type` | 合併。C1 套用時 9 條都回 `400 must specify a restriction on "resource.type"`；API 拒絕，實際環境沒有任何改變（讀回確認） |
| [PR #173](https://github.com/waydefu/clinic/pull/173)：應用程式 metric 用 `cloud_run_revision`，IAM 用 30 天內 `SetIamPolicy` 出現過的資源類型 `one_of(...)`；檢查器要求每個條件都有 `resource.type` | 合併（`01ea8d1`）。兩種寫法先用唯讀的 `timeSeries.list` 驗證過 |
| `wp-b4-alerting` 唯讀 plan → apply（08:14:19） | `0 added, 9 changed, 0 destroyed`，只改 9 個 `filter`；讀回 9 條都已更新、啟用、各有 2 個通知管道 |

## 真人告警實測（真實路徑）

- 政策：`WP-B4 auth failure spike`（5 分鐘內超過 9 次，持續 5 分鐘）。
- 觸發：08:15:24–08:23:42 UTC，經 Hosting 對 `/v1/calendar/status` 送 48 次不帶登入的請求，全部 `401`，沒有寫入。
- metric：`internal-test-api-00037-dus` 的 5 分鐘累計在 08:20 為 28、08:25 為 19，超過門檻超過 5 分鐘。
- 通知：政策會同時送到 email 與 Pub/Sub。告警 topic 沒有訂閱，系統端無法在不新增資源的情況下確認送達。
- 狀態：`HUMAN_INBOX_PROOF = PENDING`。需要業主確認在約台北時間 16:20–16:30 收到 `WP-B4 auth failure spike` 的開啟通知，並提供事件編號或時間；事件自動關閉後應再收到一封關閉通知。

## 回退演練（P09-13）

| 時間（UTC） | 動作 | 讀回 |
| --- | --- | --- |
| 08:25:48 | 三個 Cloud Run 服務切回 `internal-test-api-p109durable1`、`internal-test-outbox-00012-vzl`、`internal-test-calendar-sync-00001-422`；Hosting release 指回 `4f2b6f65fe8cc288` | 全部 100% 舊 revision；Hosting rewrite tag `fh-4f2b6f65fe8cc288`；health `200` |
| 08:26:57 | 切回 `internal-test-api-00037-dus`、`internal-test-outbox-00018-nik`、`internal-test-calendar-sync-00004-zoh`；Hosting release 指回 `3eb05e7f8b8b15d5` | 全部 100% 新 revision；rewrite tag `p109ea1fbcc`；health `200` |

- outbox drain 在演練期間每分鐘都是 `200`，其中 08:27 那次落在舊 revision。
- inbound 排程全程 `PAUSED`，channel 到期時間不變（`2026-10-19T20:38:03Z`）。

## 其他唯讀檢查

- `outbox_jobs` 6 筆、`calendar_pilot_outbox` 3 筆，全部 `completed`，沒有 dead-letter。calendar 同步設定 `healthy`、沒有 lease。
- `outbox_jobs` 已完成的 6 筆仍保留 `leaseOwner` 欄位，完成時沒有清掉。不影響處理，記為待查。
- Firestore `(default)`：PITR 與刪除保護都已開啟，備份排程保留 30 天（只有 inspect，不是還原演練）。

## 待辦

1. 業主確認告警收件，綁定事件編號後才能把 `security_one_real_human_alert` 記為 PASS。
2. P09-11 持久 429：需要新的送出額度（約 11 次）與一個同 digest 的 0% 探測 revision。
3. `c1-foundation` 的 `C1 IAM SetIamPolicy`（只通知 Pub/Sub）仍是 `global`，原始碼已修，但該 stack 未套用。
4. `c1-iam-setiampolicy` metric 在 30 天內沒有抓到任何 `SetIamPolicy` 稽核 log 的時間序列，IAM 告警可能仍不會觸發，需要另查。
5. Stage F 其餘案例（預約建立與重新整理、Workbench 報到／完成、Calendar 外送同一事件、回診查詢既有、必要回診排程、持久化讀回）都會寫入新資料，需要另列寫入額度。
6. P09-10 並發上限沒有 runtime 證據。

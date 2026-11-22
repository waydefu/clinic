# Gate 2 讀回：真實日曆 50 次正常收斂（11/22 14:07Z～16:32Z）

- 依據：[11/21 C1 窗口計畫](../plans/2026-11-21-c1-window-plan.md) 第 4 節、[50 次以上隔離合成日曆驗收作業單](../runbooks/calendar-pilot-synthetic-fault-observations.md)
- 專案：`beauessence-clinic-stg-c1a01`（C1 隔離預覽）；CAL-PILOT 專案未碰；只用合成資料
- 授權引用：`APPROVAL-GATE2-2026-11-22`。負責人一次核准整份開窗清單；以下三項另外逐項核准：Calendar 讀取改用 worker 服務帳號身分、加 Token Creator 權限、維護時窗延長 60 分鐘、單窗跑滿 50 次
- 部署映像來源：`main` `e6d854f0`（含 #543 R3、#544 R4、#552 Gate 2 檢查）；Cloud Build `ac98a7cb` SUCCESS；`internal-test/api@sha256:1534ff48…`、`internal-test/worker@sha256:e00ebbfa…`
- 試驗腳本來源：`main` `1bbb802c`（多了 #553 只讀 token、#554 Windows gcloud；兩者只改 `scripts/calendar-pilot-live-ports.mjs`，不影響部署程式）

## 1. 結果

`node scripts/calendar-pilot-observation-check.mjs <輸出檔>`：

```json
{"observations":50,"blocked":0,"conflicts":0,"allConverged":true}
```

- 50 個 trial 全部 `converged`：每次都是「一次完整掃描 → 事件恰好 1 筆 → 期望與觀測 digest 相同」。
- 只用 1 個合成 link（`patientCode` A01，`confirmed`）；driver 不做任何寫入（Calendar 寫入 0）。
- 50 次同步觸發都走 resume → run → pause，結束時兩個排程都是 `PAUSED`。
- 輸出檔與日曆 ID 不入版控（存在負責人私有資料夾）。

## 2. 時序

| 時間（UTC） | 事件 |
| --- | --- |
| 14:07～14:20 | Cloud Build；私有 tfvars 換 SHA、digest；c6 到期延到 11/25 |
| 14:2x | c6 apply `0 added, 4 changed, 0 destroyed`；Hosting API 版；`/v1/health` 200；維護 `false`（到期 15:55Z） |
| 14:3x～15:15 | 卡關兩次並修正：gcloud 預設 OAuth client 拿不到 Calendar scope → 改用 worker 服務帳號的只讀短效 token（#553）；Windows 上 spawn 不到 `gcloud.cmd`（#554） |
| 15:38～15:47 | trial 1～10 |
| 15:45 | 維護到期延到 16:55Z（負責人核准） |
| 15:48～16:22 | trial 11～50（約 50 秒一次） |
| 16:23 | 維護 `true`；stage1 apply `0 added, 3 changed, 0 destroyed`；Hosting 換回靜態版 |
| 16:32 | 本窗的櫃台工作階段已撤銷；lock 檔已還原 |

## 3. 關窗讀回

- `/v1/health` 404（靜態版）
- `internal-test-api-00045-l7n`：`INTERNAL_TEST_BOOKING_ENABLED=false`、`BUSINESS_DELIVERY_ENABLED=false`
- `internal-test-outbox-00026-h99`：`INTERNAL_TEST_OUTBOX_PROCESSING_ENABLED=false`
- 排程 `internal-test-calendar-sync`、`internal-test-outbox-drain`：`PAUSED`
- 維護文件：`underMaintenance: true`

## 4. 留下的事

- 負責人帳號在 `internal-test-calendar-sync` 服務帳號上的 Service Account Token Creator 權限還在，要不要移除由負責人決定。
- 合成病患只有 A01 一位；之後的故障注入試驗若要多個 link，需要先建更多合成預約。
- `calendar/status` 的 health 開窗前顯示 `syncing`（11/22 舊映像留下）；本窗換新映像後試驗全數收斂，沒有出現 blocked。

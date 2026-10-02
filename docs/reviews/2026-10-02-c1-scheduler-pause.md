# C1 背景排程暫停紀錄（2026-10-02）

**類型：** 日期證據；記錄已執行的費用控制操作，不是部署核准或新一輪驗收。

## 操作與授權

業主在確認目前 repository 與 C1 排程用途後，直接指示「先暫停要測再開」，
隨後要求以 PR 留下紀錄。本次只暫停 isolated synthetic C1 的 outbox
Cloud Scheduler 工作；沒有更改程式、部署映像、流量、IAM、資料或預約開關。

Cloud Scheduler 控制台在操作前顯示 outbox 每分鐘執行、狀態為 `Enabled`。
操作後顯示「已暫停 1 項工作」，outbox 狀態為 `Paused`，下次執行欄位為空。
控制台顯示最後更新時間 `2026-10-02 21:20:23 Asia/Taipei`，換算 UTC 為
`2026-10-02T13:20:23Z`。

| 工作 | 原排程（UTC） | 操作前 | 操作後 | 本次操作 |
| --- | --- | --- | --- | --- |
| `internal-test-outbox-drain` | `* * * * *` | `Enabled` | `Paused` | 暫停 1 項工作 |
| `internal-test-calendar-sync` | `*/5 * * * *` | `Paused` | `Paused` | 維持原狀 |

這是控制台讀回的日期證據；沒有執行 Terraform plan/apply，也沒有讀回 Terraform
state 或覆寫既有 tfvars。IaC 已有
[`worker_schedule_paused`](../../infra/terraform/c1-internal-test-run/variables.tf)
（預設 `true`）及
[Scheduler 的 `paused` 綁定](../../infra/terraform/c1-internal-test-run/main.tf)。
未來套用前仍須確認實際輸入，避免舊的 `false` 把排程再次打開。

## 費用與驗收界線

每分鐘觸發會持續喚起 outbox worker；本次停止後續自動觸發。
沒有量測暫停後的 Cloud Run 縮容、CPU 使用量或帳務結果，因此不宣稱所有資源
已關閉、費用歸零或預算已達成。已發生的用量不因暫停而撤銷，儲存等其他用量仍
可能計費。

[P1-09 的 2026-09-28 關帳](2026-09-28-p1-09-closeout.md)屬於既有歷史驗收。
本紀錄不重開預約 gate，不新增 production、真實資料或 D-series 權限。

## 需要測試時的下一步

1. 先由業主指示要測試的項目，確認適用的 Roadmap／CP ID、目標 C1、版本、
   合成資料範圍、UTC 起訖及適用核准；本次「要測再開」不代表現在恢復排程。
2. 只有測試確實需要背景 drain 時，才在該時窗恢復 outbox 排程；不順帶啟用
   Calendar 同步或預約寫入。每個 gate 仍依其自身核准處理。
3. 測試結束或時窗到期，重新暫停並讀回 `Paused` 與空白的下次執行欄位，
   在新的日期紀錄中留下恢復與關閉時間。本次未建立自動恢復工作。

## 證據與檢查

程式基準為當時的 main `0870a5fd16c720cafc085f29594bef7afb30a71b`。
本文件自身的 commit 請以
`git log -- docs/reviews/2026-10-02-c1-scheduler-pause.md` 查找；merge commit
尚未產生。PR 是文件紀錄，不執行第二次雲端操作。

原始控制台截圖保留於業主本機及本次對話，未上傳 repository，以避免公開
帳號及控制台資訊。repository 內這份 Markdown 是可攜的操作摘要。

| 私有證據名稱 | SHA-256 |
| --- | --- |
| `clinic-outbox-paused.jpg` | `d57486f4aae2199a77d85417fa5f780cce63d576b684ac9dfca46afe7e1b1ade` |

文件變更的 evidence rung：`CODE-ONLY`；排程狀態另以上述控制台讀回為證，
不等同應用程式 runtime 或 production 驗收。

| 檢查 | 結果 | 涵蓋／限制 |
| --- | --- | --- |
| Cloud Scheduler 操作後讀回 | `PASS` | 1 項工作暫停；2 項工作均為 `Paused`；outbox 下次執行欄位為空 |
| 文件 diff 人工檢查 | `PASS` | 僅新增本紀錄及索引；不包含帳單帳戶、個人信箱、私有 URL、病患資料或截圖 |
| `check:docs`、`check:format`、`check:lint`（本機） | `UNAVAILABLE` | 隔離 worktree 無 `node_modules`；未因驗證而安裝依賴，交由 PR CI 執行 |
| exact-commit `Verification evidence` | `NOT_RUN` | 撰寫時尚未建立 PR；以該 PR 同一 head SHA 的 CI 結果為準，舊 main 綠燈不沿用 |
| 費用下降／Cloud Run 縮容驗證 | `NOT_RUN` | 本次只暫停排程，未做後續用量量測 |
| runtime、Emulator、E2E 驗收（本機） | `NOT_RUN` | 文件變更不重跑雲端驗收；既有 PR CI 規則保持不變 |

未解事項 owner：業主／技術操作者。下次第一步是確認測試項目與有界時窗；
費用是否下降須另讀回後續用量，不能由 Scheduler 狀態推定。

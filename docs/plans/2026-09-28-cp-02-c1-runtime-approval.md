# CP-02 C1 新預約驗收核准（2026-09-28）

**狀態：** `APPROVED_IN_CHAT`，業主在對話中核准（單人核准，沒有第二組審查）。
**工作包：** [CP-02](2026-09-22-current-project-execution-packets.md)（新預約
runtime／相容驗收）。**來源：** CP-01 已合併（`1e0b84f`）。

這份文件記錄的是核准範圍，不是執行結果。執行後另寫帶日期的證據紀錄。

## 授權欄位

```text
PACKET = CP-02-C1-MINIMIZED-BOOKING
STATUS = APPROVED_IN_CHAT（業主，2026-09-28）
AUTHORITY_SHA = 1e0b84f0991f766170357bd4ea3e3bbbbf4aa6b2
APPROVER = 業主
OPERATOR = Claude Code session，以業主在場登入的身分執行；每個改動雲端的步驟前再確認
VALID_UNTIL_UTC = 2026-10-02T12:00:00Z
BOOKING_GATE_EXPIRES_UTC = 2026-10-02T12:00:00Z
PROJECT = 隔離 C1 專案（與 P1-09 相同）
HOSTING_CHANNEL = internal-preproduction
PRECONDITION = main 在 AUTHORITY_SHA 的 Verification evidence 通過
STOP_ON_UNEXPECTED_CHANGE = true
```

**AUTHORITY_SHA 的對帳規則：** 合併本文件會讓 `main` 前進。執行時 `main` 與
`AUTHORITY_SHA` 之間若只有文件變更，記下 diff 後照走；出現任何非文件變更就停止，
重新請業主核准。

## 核准的步驟與額度

| # | 內容 | 額度上限 | 停止條件 |
| --- | --- | --- | --- |
| 1 | 以 `AUTHORITY_SHA` 建 API 與 worker 映像 | 1 次建置 | 建置失敗 |
| 2 | run stack 重新 plan，只 apply 同一份 saved plan：換映像、開預約開關並設到期 | 1 plan、1 apply | plan 出現映像、開關、流量以外的變更，或任何 replace／destroy |
| 3 | 發布對應網頁到 `internal-preproduction`，確認 `/v1/**` 指向新 revision | 1 次 | 指向不符就停，不打寫入 |
| 4 | 業主人工核對表單：只有月日、國籍恰兩選項、沒有證件與來源欄 | — | 看到多收欄位 |
| 5 | 唯一新病患：初診預約、Workbench 檢視、同冪等 key 重送、改期 1 次 | 1 筆預約、1 個日曆事件 | 出現第二筆；日曆事件帶姓名、生日或國籍 |
| 6 | 回診：標完成與需要回診、電話＋月日查詢、回診預約 | 1 筆預約 | 查詢未給 session，或給了別人的 |
| 7 | 同鍵不同名並發送出兩筆新預約 | 最多 1 筆成立 | 兩筆都成立；錯誤回應透露另一人 |
| 8 | 既有舊合成病患以電話＋月日查詢 | 0 寫入 | 回 session 或姓名 |
| 9 | 帶已移除欄位（證件、來源）送出 | 0 寫入 | 未被拒絕 |
| 10 | 登出／重新整理後工作臺不復活；唯讀讀回預約、索引、稽核、outbox 與日曆事件 | 唯讀 | — |
| 11 | 收尾：取消全部測試預約、關閉預約開關、讀回 | — | — |

合計上限：4 筆預約、4 個日曆事件、約 60 個請求。只取消，不刪預約、稽核或
outbox；不繞過 API 直接寫入 Firestore（`CP-02-NO-DIRECT-SEED-2026-09-28`）。

## 驗收列對照

- BKG-01～05、07、09～12：由上表步驟證明。
- BKG-06：不適用（`LEGACY-PATIENT-NO-ALIAS-2026-09-28`）。
- BKG-08：runtime 證明同鍵並發只成立一筆；「兩位候選」的拒絕沿用 Emulator 證據。

## Rollback

- 流量與 Hosting tag 切回目前的預約關閉 revision，讀回確認。
- 舊版程式只讀舊索引，新索引資料對它無害；不做 `terraform destroy`，不刪資料。

## 本文件不是什麼

不是 production 授權，不改 D-series 狀態，也不授權修改原始碼。驗收中任何必要
斷言失敗即停止，修復另開 PR，並需要新的部署核准。

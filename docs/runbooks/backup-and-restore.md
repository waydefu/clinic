# 備份與還原 runbook（含 RTO/RPO）

**建立日期：** 2026-07-24

**狀態：** cloud backup／PITR **尚未演練**。2026-07-26 已完成
[Emulator 邏輯還原與事故技術演練](../reviews/2026-07-26-local-operations-rehearsal.md)，
V1～V5 與 Calendar companion V6 通過；它不驗證真實備份、IAM、RTO／RPO 或流量
切換。D-010 target 已核准，但 C0 review／C1 isolated-foundation authority 尚未
完成；C1 明確不含 Firestore。只有後續 C5/C6 Firestore／runtime slice 各自取得
獨立 authority、apply approval 並實際建立 cloud staging 後，才可照本 runbook
做真實還原——
**沒有演練過的備份不能算備份**。

## 1. 保護對象

| 對象 | 機制 | 遺失的後果 |
| --- | --- | --- |
| Firestore（預約、患者、排班、個案、薪資） | 每日排程備份 ＋ PITR | 診所無法營運 |
| 稽核事件 | 隨 Firestore 備份，append-only | 失去「誰做了什麼」的證據 |
| Secret Manager | 版本保留 | 服務無法連外部系統 |
| Terraform state | GCS bucket 版本控管 | 基礎設施無法安全變更 |
| Hosting 產物 | Hosting 版本保留 | 可由 repository 重建，影響最小 |
| Google 日曆 | **不備份** | 日曆是投影，可由 Firestore 重建（見 §6） |

最後一列是刻意的設計：日曆不是真相來源，備份它沒有意義，重建它才有意義。

## 2. RTO / RPO 目標

**D-010 target 已於 2026-07-28 核准：RPO 1 小時／RTO 4 小時，適用 database、
whole-project 與 regional failure。** 目前仍沒有 cloud 演練證明可達成；本節中
標示「未證明／未達」的列是 Stage 2 必須關閉的 architecture gap，不能因 target
已核准就宣稱備援存在。

| 情境 | RPO（可接受的資料遺失） | RTO（可接受的中斷） | 依據 |
| --- | --- | --- | --- |
| 誤刪單筆／少量資料 | **≤ 1 小時 target；不得寫 0** | **≤ 4 小時 target** | PITR 以分鐘粒度選 recovery point，但「有分鐘粒度」不等於零資料遺失；須記錄事故前最後可驗證資料時間與實際 RPO/RTO |
| 整個 database 損壞 | 1 小時 | 4 小時 | PITR 視窗內還原 |
| 整個 project 不可用 | **1 小時 target，目前設計未證明** | **4 小時 target，目前設計未證明** | 每日備份不足以單獨達標；須補跨 project 復原設計與演練 |
| 區域性故障 | **1 小時 target，目前單區設計未達** | **4 小時 target，目前未定義路徑** | 目前是單區設計，見 §7 |

**營運上的替代方案必須同時存在。** 系統中斷 4 小時，診所不能停擺——櫃台要能用
紙本記錄當天預約，事後補登。這條「降級運作」程序屬營運端，應與本 runbook 一起
演練；技術上再快的還原，也快不過「先讓診所能看診」。

## 3. 備份設定

| 項目 | 值 |
| --- | --- |
| 每日備份排程 | 每日一次；Firestore 會在每天不同時間執行，**不能指定固定 04:00**。須監控每日 backup 是否完成，而不是檢查一個不存在的固定執行時間 |
| 備份保留 | 30 天 |
| PITR | 開啟，保留 7 天 |
| 備份位置 | 與 database 同區（跨境屬 D-001～D-003） |
| 刪除保護 | database 開啟 |

官方限制與 Terraform schedule shape 見
[Firestore backups](https://cloud.google.com/firestore/docs/backups#create_and_manage_backup_schedules)。

保留期限的最終值受**資料保存政策**（D-001～D-003）約束：備份保留超過政策規定的
保存期限，等於用備份繞過了保存期限。這一點在 §5 另外處理。

## 4. 還原程序

### 4.1 判斷（先做這一步，不要跳過）

1. **確認這真的是資料事故**，而不是查詢錯誤或權限問題。還原是重動作，做錯的
   代價比多花十分鐘確認更高。
2. 決定還原範圍：單筆／集合／整個 database。
3. 指定一位**決策者**（見[事故應變 runbook](incident-response.md)）。還原期間
   的每一個「要不要繼續」由這個人回答。

### 4.2 止血

**先停止寫入，再還原。** 邊還原邊寫入，得到的是一份誰也說不清的資料。

- 開啟維護模式（`apps/api/src/platform/runtime/maintenance-gate.ts` 的
  `SERVICE_UNAVAILABLE`）；
- 暫停 worker 的排程觸發，避免對帳把舊狀態又投影出去。

### 4.3 還原

**一律還原到新的 database，不要覆蓋現有的。** 覆蓋會把「事故現場」也一起銷毀，
而事故現場是事後檢討與（若涉及個資）通報判斷的依據。

1. 由備份或 PITR 時間點建立**新的 database**（例如 `restore-<日期時間>`）。
2. 在新 database 上驗證（見 4.4）。
3. 驗證通過後才切換應用連線；不通過就換一個還原時間點重來。
4. 原 database 保留至少 7 天，供調查使用。

### 4.4 驗證（缺一不可）

| # | 檢查 | 通過條件 |
| --- | --- | --- |
| V1 | 資料筆數 | 預約、患者、排班的筆數與事故前的監控數字相符 |
| V2 | 抽樣比對 | 隨機抽 10 筆預約，欄位與稽核紀錄一致 |
| V3 | 稽核連續性 | 稽核事件在還原時間點前是連續的，沒有缺口 |
| V4 | 冪等鍵 | outbox 與冪等記錄同步還原，不會重放已完成的動作 |
| V5 | 應用可用 | 建立並完成一筆合成預約；另建立並取消一筆，全程成功 |
| V6 | 日曆一致 | 執行一次對帳，漂移數在預期範圍內 |

### 4.5 復原後

1. 關閉維護模式，恢復 worker 排程。
2. 執行一次完整對帳，把日曆拉回與 Firestore 一致（見
   [worker 執行與對帳計畫](../architecture/worker-runtime-and-reconciliation-plan-2026-07-24.md)）。
3. 清點**還原時間點之後遺失的操作**，交給櫃台以紙本紀錄補登。
4. 若涉及個資，走[事故應變 runbook](incident-response.md) 的隱私路徑。
5. 寫事後檢討。

## 5. 備份與「刪除權」的衝突

患者要求刪除資料時，備份裡仍然有他的資料。這不是疏漏，是備份的本質。處理方式：

- 從**線上資料**刪除，並記錄刪除稽核事件；
- 備份中的副本隨保留期限自然過期，期間**不得**用於還原個別資料；
- 若必須從備份還原，還原後要**重新套用**期間所有的刪除請求——因此刪除請求本身
  必須保留一份「已刪除的識別清單」（只留必要的識別欄位與時間）。

這份例外處理必須寫進隱私政策，由法務確認（D-001～D-003）。工程端不能自行決定
「備份可以留多久」。

## 6. 日曆的重建，而不是還原

日曆事件由 Firestore 的預約狀態投影而來，事件 ID 由預約決定（base32hex，
`packages/domain/src/calendar-event-id.ts`）。因此日曆的修復方式是**重跑投影**，
不是還原日曆：

1. Firestore 還原完成並驗證後，
2. 執行完整對帳，讓缺少的事件被重建、殘留的事件被取消，
3. 孤兒事件（診所人員自己建立的行程）**不會**被動到。

## 7. 演練要求

**每季一次**，並在下列時機額外執行：

- 後續 C5/C6 Firestore／runtime slice 各自取得獨立 deployment authority 與
  apply approval，並首次實際建立含 Firestore 的 cloud staging 之後；C1
  isolated-foundation authority 本身不觸發此演練；
- 正式上線前（列入證據包，Stage 6）；
- 任何改動備份設定、資料模型或 PITR 視窗之後。

符合季度／上線 gate 的演練必須是**真的從 cloud backup／PITR 還原**，不是「確認
備份檔存在」，也不是 Emulator logical copy。通過條件是 §4.4 的 V1～V6 全部
通過，且**實際耗時記錄下來並與 §2 的 RTO 比較**。演練耗時超過 RTO，就代表 RTO
是假的，要嘛改設計、要嘛改目標。

紀錄放在 `docs/reviews/`，檔名 `restore-drill-<YYYY-MM-DD>.md`，至少包含：

```markdown
| 項目 | 值 |
| --- | --- |
| 日期 | |
| 環境 | staging / production |
| 情境 | 誤刪單筆 / database 損壞 / project 不可用 |
| 還原來源 | 每日備份（日期）/ PITR（時間點） |
| 開始～可用耗時 | ____ 分鐘（目標 RTO ____） |
| 資料遺失範圍 | ____（目標 RPO ____） |
| V1～V6 | 各項通過／失敗 |
| 發現的問題 | |
```

新增紀錄後同時登進[文件索引](../README.md)的「Review record」。

## 8. 尚未涵蓋

- **跨區災難復原**：目前是單區設計；§2 的 RPO 1 小時／RTO 4 小時是核准 target，
  不是現有能力。四個候選與共同驗收欄位已列於
  [C0 readiness artifacts §5](../architecture/stage-2-c0-readiness-artifacts-2026-07-29.md#5-disaster-recovery-option-analysis)，
  但 secondary project/location、成本、跨境、routing 與實際演練仍 pending。
- **備份加密金鑰的自管（CMEK）**：預設用平台管理的金鑰。改用自管金鑰會讓金鑰
  遺失等同資料遺失，需要先有金鑰管理程序。
- **匯出到本地／NAS**：企業規劃書提過 NAS adapter，但把患者資料匯出到診所內部
  儲存會新增一個完整的資料落點，必須先過隱私評估（D-001～D-003）。

## 相關文件

- [事故應變 runbook](incident-response.md) — 分級、角色與通報
- [基礎設施與維運計畫](../architecture/infrastructure-and-operations-plan-2026-07-24.md) — 備份設定與環境隔離
- [worker 執行與對帳計畫](../architecture/worker-runtime-and-reconciliation-plan-2026-07-24.md) — 還原後的日曆重建
- [台灣隱私法規基線](../security/taiwan-privacy-legal-baseline.md) — 保存、刪除與通報義務

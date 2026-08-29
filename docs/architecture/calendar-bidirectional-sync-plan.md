# Google Calendar 雙向同步規劃

> **2026-08-29 實作註記：** 下文是 production／真實資料方向的 plan-only 歷史
> 文件，因此其 blocked 結論仍適用 production。另有一個已核准的窄範圍
> synthetic-only 實作：兩本 allowlisted CAL-PILOT 日曆、A01～A30、Google＋TOTP、
> 五分鐘增量同步、人工候選審核、30 天 kill switch。現行操作規格請看
> [CAL-PILOT 30 天雙向同步操作手冊](../runbooks/cal-pilot-30-day-bidirectional-sync.md)。

**狀態：** production plan-only。**production 仍被 D-009 與 D-016 阻擋，且
必須遵守現行已接受的 ADR-0002。** 本文件不授權正式連線、正式 credential、
正式 worker 部署或真實 Calendar-to-system write path。

**撰寫日期：** 2026-08-04

---

## 1. 這份規劃不得改變系統權威

[ADR-0002](../adr/0002-calendar-is-a-projection-not-the-lock.md) 的現行結論是
**Calendar 是投影，不是鎖**：system/domain state 是唯一權威；Calendar 永遠不是
availability source、capacity lock 或 booking transaction authority。這個決定保持
accepted，沒有被本規劃取代。

本文件的 inbound 僅指「把外部變更讀成 candidate，送進人工待審佇列」。candidate
store 不得直接修改 appointment、slot、audit 或其他營運資料；若 D-016 日後核准，
reviewer 接受 candidate 也必須發出正常 domain command、重新檢查當下資源衝突並追加
audit/outbox。這種設計仍是 system-authoritative，與 ADR-0002 相容。

若未來提案要自動套用 Google 變更、讓 Google 衝突優先，或把 Calendar 變成
co-authority，才需要新的 accepted ADR 明確取代 ADR-0002；目前沒有這項 authority。

決策登錄 [D-016](../product/phase-1-decision-register.md) 目前為 pending。2026-08-16
輸入已指定 manual review、system authoritative 與 30-minute target，但那是 recorded
input，不是 formal approval；reviewer role、matching identity、刪除語意與 scope/exclusion
仍未解。**這些問題不回答，route、權限與資料模型就不能定案。**

同時 D-009（outbound Calendar 整合的擁有者、日曆選擇、授權模型、scope 與最小事件
欄位）也仍為 pending。**單向都還沒核准，雙向不可能先做。**

---

## 2. 現況

已完成且經演練：

- 假 Calendar 服務定型：upsert／cancel、409 與 410 皆視為冪等成功。
- 冪等鍵綁預約（base32hex），一筆預約一個日曆事件；重試 100 次只產生一個事件。
  見 [Calendar event ID](calendar-event-id.md)。
- outbox worker 的租約、指數退避（含 full jitter）、最大重試、死信與補回。
- 失敗 → 死信 → 補回已固定為 Emulator 測試，並補上 `OutboxProcessor.requeue`。
- 真實 Google Calendar 用戶端已寫好（`apps/worker/src/google-calendar.ts`），
  憑證只走 env，未設定時回退假日曆。

**未完成：** 實際連線（憑證由負責人保管）、任何 inbound 路徑、webhook channel、
syncToken 增量同步。

---

## 3. 資料模型

以下欄位掛在預約的同步狀態子文件，**不混進預約本體**——同步是基礎設施關注點，
不是預約的業務屬性。

| 欄位 | 型別 | 用途 |
| --- | --- | --- |
| `googleEventId` | string | Google 端事件 ID |
| `calendarId` | string | 所屬日曆；多分院／多資源時不只一個 |
| `syncToken` | string | 增量同步游標，per calendar 而非 per event |
| `etag` | string | Google 端版本；寫入時帶 `If-Match` 做樂觀鎖 |
| `syncStatus` | enum | `pending` \| `syncing` \| `synced` \| `failed` \| `conflict` |
| `syncSource` | enum | `system` \| `google`；最後一次變更由誰發起 |
| `lastSyncedAt` | timestamp | — |
| `lastSyncError` | object \| null | 錯誤碼、訊息、發生時間、重試次數 |
| `deletedAt` | timestamp \| null | 軟刪除；**不得**直接移除文件 |
| `conflictState` | object \| null | 衝突時兩側的快照與待審資訊 |

`syncToken` 放在 per-calendar 的同步狀態文件，不是每筆預約各存一份——Google 的增量
同步游標本來就是 calendar 層級的。把它複製到每筆預約會產生大量無法收斂的分歧游標。

---

## 4. 同步流程

### 4.1 系統 → Google（outbound，D-009）

沿用既有 outbox，不新增路徑：

```
狀態轉換 → 同一交易寫入 outbox → worker 取租約 → 呼叫 Calendar
                                      ├─ 成功 → syncStatus=synced, 更新 etag
                                      ├─ 409/410 → 視為冪等成功
                                      └─ 失敗 → 指數退避重試 → 死信
```

新增、修改、取消三種動作各對應一次 upsert／cancel。**交易內絕不呼叫 Calendar**
（不可協商規則 #2）。

### 4.2 Google → candidate review queue（inbound proposal，D-016）

```
Google push notification → proposed webhook → 驗證 channel token
    → 以 syncToken 拉增量 → 寫入隔離的 mirror/candidate store → 逐筆比對
        ├─ 系統無此事件      → 進入待審佇列（不自動建立預約）
        ├─ 系統有且 etag 相同 → 無變更，略過
        ├─ 系統有但 etag 不同 → 進入衝突處理（§5）
        └─ Google 端已刪除    → 進入待審佇列，不自動取消預約
```

**inbound 一律不自動寫入營運資料。** 這是本規劃最重要的安全設計：日曆是一個
外部可寫的介面，任何有該日曆編輯權的人都能改動。把它當成可信輸入，等於把預約
系統的寫入權開放給日曆的所有共用者。所有 inbound 變更只能進入**隔離待審佇列**；
目前沒有 reviewer route 或落地路徑。D-016 若日後核准，具權限角色接受 candidate 時
仍須執行正常 domain command、重查 slot/capacity 衝突並追加 audit/outbox——這正是
D-016 尚未定案的 reviewer authority／matching／delete semantics 邊界。

### 4.3 syncToken 與 410

Google 的 `syncToken` 過期會回 `410 Gone`。處理方式：捨棄該 token，改做一次全量
拉取以重建基準，然後取得新 token。**全量重建期間不得觸發任何自動寫入**，否則一次
token 過期會變成一次大規模誤改。

### 4.4 Webhook channel 續訂

Google 的 watch channel 有到期時間。需要一個排程在到期前續訂，並在續訂失敗時
告警。**channel 過期是靜默的**——不會有錯誤，只是不再收到通知，因此必須主動監控
「距上次收到通知已過多久」，而不是只監控錯誤率。

### 4.5 冪等與重試

沿用既有的 base32hex 冪等鍵設計。inbound 側以 `googleEventId` ＋ `etag` 作為去重
依據；同一個 etag 重複送達不產生第二筆待審項目。

### 4.6 時區

全部統一為 `Asia/Taipei`。既有的 `taipei-time.js` 與 domain 側的時間處理是唯一
來源，Calendar 適配層不得自行做時區轉換。

---

## 5. 衝突處理

衝突定義：系統與 Google 兩側都在上次同步後有變更（etag 不符且系統側有本地修改）。

| 情境 | 處理 |
| --- | --- |
| 兩側時間都被改 | 進入衝突佇列，`syncStatus=conflict`，UI 顯示兩側值供人工選擇 |
| 系統改、Google 刪 | 進入待審；預設保留系統側，需人工確認刪除 |
| Google 改、系統刪 | 系統側刪除為權威（已是營運決定），outbound 重推刪除 |
| 兩側都刪 | 冪等成功，無動作 |

衝突**永不自動解決**。自動解決的每一種策略（後寫贏、系統優先、日曆優先）都會在
某些情境下靜默丟失營運資料。

UI 需求見 [App Shell 規劃 §2.2](../design/ui-shell-and-scheduling-redesign-plan.md)
的同步狀態列與 §3.4 的 Drawer 同步區塊。

---

## 6. 隱私原則（硬性）

Google Calendar 事件**不得**直接暴露完整生日、手術細節、費用與敏感病歷。

日曆只存最小必要資訊與內部識別碼：

- 標題：服務類型的通用名稱 ＋ 內部預約識別碼，**不含病患姓名**。
- 描述：內部識別碼，供人工比對。
- 不寫入：生日、身分證／護照號、手術術式、麻醉方式、任何金額、病患備註。

理由：日曆事件會出現在所有具該日曆讀取權者的手機通知、桌面提醒與第三方日曆
App 上，其存取控制不在本系統掌握之內。既有的「事件欄位最小化斷言」已有單元測試，
本規劃**擴大**而非放寬該斷言。

這一條與 [資料分級與欄位盤點](../security/data-classification-and-field-inventory-2026-07-29.md)
一致；任何欄位要進日曆，須先在該文件中被分級為可外流。

---

## 7. 錯誤處理與可觀測性

| 錯誤 | 處理 |
| --- | --- |
| 401／403 | 憑證問題，立即告警，不重試 |
| 404 | 事件已不存在，視為冪等成功 |
| 409 | 視為冪等成功（既有語意） |
| 410（syncToken） | 觸發全量重建（§4.3） |
| 410（事件） | 視為冪等成功（既有語意） |
| 429 | 依 `Retry-After` 退避 |
| 5xx | 指數退避重試 → 死信 |

必要指標（低 cardinality）：outbound 佇列深度、死信數、inbound 待審佇列深度、
距上次收到 webhook 的時間、衝突未解數。

---

## 8. 驗收條件

1. outbound 的新增、修改、刪除可投影；inbound 的三種外部變更只可形成隔離
   candidate，不可自動修改營運資料。
2. 重試不產生重複事件（既有的 100 次重試測試維持全綠）。
3. syncToken 過期（410）可自動重建且**不觸發任何自動寫入**。
4. webhook channel 續訂失敗會告警。
5. 所有 inbound 變更進入待審佇列，無任何自動落地路徑；人工接受仍走正常
   domain command、衝突檢查與 audit。
6. 所有衝突都有明確的人工處理介面，無自動解決；reviewer role 未核准前不建立 route。
7. 日曆事件欄位最小化斷言涵蓋 §6 全部禁止欄位。
8. 時區全程 `Asia/Taipei`，無隱含轉換。

---

## 9. 回滾策略

1. **停止 inbound**：關閉 webhook 端點；outbound 不受影響，系統回到 ADR-0002 的
   單向投影模式。
2. **停止全部同步**：outbox 停止派送，既有預約資料完全不受影響——因為日曆從來不是
   真實來源。

第 2 點是遵守 ADR-0002 的實際好處：即使 inbound candidate intake 整個失敗，營運
資料仍然完整。任何未來要放棄這個性質的提案都必須先用新的 accepted ADR 明確取代
ADR-0002；本規劃沒有這項 authority。

---

## 10. 風險

| 風險 | 影響 | 緩解 |
| --- | --- | --- |
| 日曆共用者誤改造成預約異動 | **高** | inbound 一律待審，不自動落地（§4.2） |
| syncToken 過期後全量重建誤判大量衝突 | 高 | 重建期間禁止自動寫入（§4.3） |
| webhook channel 靜默過期 | 中 | 監控「距上次通知時間」而非錯誤率（§4.4） |
| 敏感欄位流入日曆 | **高** | 欄位最小化斷言＋資料分級前置（§6） |
| 憑證外洩 | 高 | 憑證只走 env，不進版控；助理不讀取也不輸入憑證 |

---

## 11. 相關文件

- [ADR-0002 — Calendar 是投影，不是鎖](../adr/0002-calendar-is-a-projection-not-the-lock.md) — **本規劃必須遵守的 accepted authority**
- [Calendar event ID 與 outbox key](calendar-event-id.md)
- [日曆與資料庫整合計畫](calendar-and-database-integration-plan.md)
- [Calendar 同步失敗 runbook](../runbooks/calendar-sync-failure.md)
- [Calendar go-live runbook](../runbooks/calendar-go-live.md)
- [Expansion S 規劃](../product/2026-07-28-surgery-follow-up-expansion-plan.md) — Calendar inbound 的既有規劃落點
- [資料分級與欄位盤點](../security/data-classification-and-field-inventory-2026-07-29.md)

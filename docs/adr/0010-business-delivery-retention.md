# ADR-0010：商務交付病患封存與刪除（CP-05）

**狀態：** 已接受；政策依據為 `BD-POLICY-2026-09-29` §2 與
`OWNER-BATCH-2026-09-29B` 第 4、5 項。
**適用：** C1 合成隔離環境 `internal_synthetic`。
**不授權：** production、真實病患資料、production deletion、雲端部署或備份操作。
production 套用仍需專業隱私／法律審查及另行授權。

## 背景

病患封存須可復原，永久刪除須明確由管理者啟動並留下可稽核證據。Firestore
TTL 不能作為即時刪除保證；備份／PITR 也不能由一般病患操作改寫。

## 決策

1. 一筆病患及其所有預約是封存單位。只有 `manager` 可封存、復原、設定或解除
   legal hold，或永久刪除。
2. 封存與永久刪除都要求 10 分鐘內重新 Google＋TOTP；復原及 legal hold 不要求
   重新驗證。封存拒絕有未來 `confirmed`／`arrived` 預約的病患。
3. `recoverableDays` 固定為 30 天。第 30 天整點起不得復原，也不會自動刪除；
   到期紀錄進入不含姓名的「待永久刪除」清單。
4. 永久刪除要求封存已滿 30 天、無 legal hold、有效 `reasonCode`，並在單一
   Firestore transaction 中清除病患、預約、booking guard、follow-up state、return
   sessions、follow-ups，以及各 lookup index 中該病患的 ID。
5. `audit_events`、`bd_*`、備份與 PITR 不因永久刪除而清除。`bd_retention_log`
   記錄 opaque `patientId`、雜湊 actor reference、動作、時間與請求雜湊；不記姓名、
   電話、生日或原始重新驗證 token。備份依既有保存期自然到期；任何還原後都必須
   重新套用已核准的刪除紀錄。
6. 每個明確操作以動作與冪等鍵雜湊定位 log。同鍵同內容回傳原結果，同鍵不同內容
   回 409。單筆 transaction 超過 400 筆寫入時拒絕操作；不得拆成多筆非原子交易。
7. 被封存的病患不得出現在預約查詢或回診 lookup。建立同電話與月日的新病患時，
   lookup index 保留舊 ID 並附加新 ID；若新病患已存在，舊病患不可復原，以免同鍵
   出現兩筆有效紀錄。
8. **日曆投影跟著保存狀態走（2026-10-03 補）。** 預約日曆標題含 ADR-0002 核准的
   姓名、電話與生日月日，所以日曆是病患資料的一個副本。封存、復原與永久刪除在同一個
   transaction 中為該病患每筆預約與每個有日期的回診提醒寫入 outbox 投影工作（只含 ID、
   狀態與時間，不含個資）：封存後 worker 依已封存紀錄改寫成不含個資的精簡標題；復原後
   恢復核准標題；永久刪除時以 `events.delete` 刪除全部事件。這些工作算入 400 筆寫入
   上限，因此一位病患可處理的預約數約減半；超過時照第 6 點由人員處理。Google 端刪除後
   的垃圾桶保存屬於 Google 的保存期，本 ADR 不宣稱即時清除。

## 後果

- `manager` 的 CP-05 route 由 `BUSINESS_DELIVERY_*` 完整設定與 C1 synthetic scope
  控制；缺設定時回 404。
- 超過單交易寫入上限或遇到衝突時由人員處理，不自動分批執行。
- API 不宣稱備份中的資料即時刪除，也不會自動改寫還原副本。
- 本 ADR 不變更 D-series production 狀態或發布任何資料政策。

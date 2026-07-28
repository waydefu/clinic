# Markdown 現況一致性稽核（2026-07-28）

**狀態：** 有日期的文件稽核證據。本文記錄本次檢查與修正，不取代
`roadmap.md`、Phase 1 執行計畫、決策登錄、ADR 或 runbook。

## 範圍與方法

本次掃描修正前既有的 85 份 Markdown，依
[文件生命週期規則](../document-lifecycle.md)區分現行權威、草案／plan-only、
dated evidence、superseded 與 archive。全文掃描舊階段名稱、目前狀態、部署邊界、
預覽期限、患者欄位、身分／角色、營業時間、單項／多項服務、RTO／RPO、D-001～D-013
狀態與會讓接手者重做已完成工作的指示；再逐份核對命中的現行權威文件。

dated review 與 archive 原則上保留當時證據，只在其內容可能被誤當現況時加上
生命週期註記。沒有為了讓歷史數字看起來「最新」而覆寫舊測試結果、部署 SHA 或
當日結論。

## 已修正的現況落差

1. 統一寫明 Stage 0／Checkpoint A 已完成、目前是 Stage 1 owner decisions；
   舊稱整合階段 A 已完成，B／C 分別對應目前 Stage 2／3。
2. 保留 `/v1/health` 為唯一 routed API；已完成的 application、repository、
   contracts 與 Calendar client 不等於已連線或已部署。
3. 把瀏覽器複數 `itemIds` 與正式 contract/domain 單一
   `serviceId`/`itemId` 的落差列入 D-004，不再指示接手者直接照原型改成複數。
4. 重查
   [診所官方預約頁](https://beauessence.com.tw/reservations/)後，記錄官網
   「週一至週五 11:00–20:00、週六 11:00–16:00」與合成預覽
   「週三至週五 12:00–20:00、週六 10:00–18:00」的 D-004 衝突；撤回
   「官網時段屬於另一間診所」的錯誤說法。
5. 把 D-006 的 Google sign-in＋自架帳號候選、較早 account/password 方向、
   醫師角色與櫃檯委派刪除列為待核准衝突，不把合成角色矩陣當正式 RBAC。
6. 把 D-010 已記錄的 `asia-east1`、RPO 1 小時／RTO 4 小時列為候選輸入，
   同時標出單區／每日備份設計尚未證明可達標；移除舊的 24 小時 RPO 現行建議。
7. 更新隱私基準與欄位檢核：合成預覽可在瀏覽器內使用已授權測試欄位，但這不是
   後端蒐集或法律依據；正式逐欄 inventory 仍受 D-001～D-003、D-006、D-011
   約束。個資法施行狀態已於
   [全國法規資料庫](https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=I0050021)
   重查至 2026-07-28。
8. 刪除 roadmap 中斷裂的舊 UI 段落，並修正「先做已完成階段 A」、舊 Java 版本、
   舊字型待決策與舊核准狀態等會誘發重工的說法。

## 稽核後的單一現況

- Stage 0／Checkpoint A 已完成；目前是 Stage 1。
- D-006 與 D-010 共同阻擋 Stage 2 cloud staging；D-009 阻擋 Stage 3 Calendar。
- 沒有 cloud backend、Authentication、實際 Calendar 連線或真實患者資料。
- `apps/api` 仍只路由 `GET /v1/health`。
- 2026-07-27 的 Hosting preview 是 static、synthetic-only、`noindex` 的 dated
  deployment；本次文件變更不代表重新部署。
- 下一個產品決策先處理 D-004 的營業時間與一筆預約可選服務數，再完成 D-006、
  D-010 的具名核准。

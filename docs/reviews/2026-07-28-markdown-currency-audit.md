# Markdown 現況一致性稽核（2026-07-28）

**狀態：** 有日期的文件稽核證據。本文記錄本次檢查與修正，不取代
`roadmap.md`、Phase 1 執行計畫、決策登錄、ADR 或 runbook。

> **同日後續決策註記：** 本次掃描後，業主又核准完整 D-006 安全基線，並澄清
> 止鼾／醫美實際療程時長到診後才形成、不寫死服務分鐘。下方「稽核當時」的
> pending／40～60 描述保留為 dated evidence；現況以
> [決策登錄](../product/phase-1-decision-register.md)、
> [Stage 2 change plan](../architecture/stage-2-identity-and-cloud-change-plan-2026-07-28.md)
> 與 [Expansion S](../product/2026-07-28-surgery-follow-up-expansion-plan.md) 為準。

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
   `serviceId`/`itemId` 的落差列入 D-004；同日稍後業主確認正式預約也允許多項，
   同日再確認止鼾維持 40～60 分鐘多時長、醫美依療程進度；剩餘 gate 是可選刻度、
   合併計算、容量與一致的 contract/domain/persistence 實作。
4. 重查
   [診所官方預約頁](https://beauessence.com.tw/reservations/)後，記錄官網
   「週一至週五 11:00–20:00、週六 11:00–16:00」與合成預覽
   「週三至週五 12:00–20:00、週六 10:00–18:00」的 D-004 衝突；撤回
   「官網時段屬於另一間診所」的錯誤說法。
5. 把 D-006 的 Google sign-in＋自架帳號候選、較早 account/password 方向、
   醫師角色與櫃檯委派刪除列為待核准衝突，不把合成角色矩陣當正式 RBAC。
6. 把 D-010 的 `asia-east1`、RPO 1 小時／RTO 4 小時列入決策；同日稍後業主
   核准 target 適用 database、whole-project 與 regional failure。單區／每日備份
   設計仍未證明可達標；target approval 不是 implementation evidence。
7. 更新隱私基準與欄位檢核：合成預覽可在瀏覽器內使用已授權測試欄位，但這不是
   後端蒐集或法律依據；正式逐欄 inventory 仍受 D-001～D-003、D-006、D-011
   約束。個資法施行狀態已於
   [全國法規資料庫](https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=I0050021)
   重查至 2026-07-28。
8. 刪除 roadmap 中斷裂的舊 UI 段落，並修正「先做已完成階段 A」、舊 Java 版本、
   舊字型待決策與舊核准狀態等會誘發重工的說法。

## 稽核後的單一現況

- Stage 0／Checkpoint A 已完成；目前是 Stage 1。
- D-010 target 與 D-006 identity/security 已核准；Stage 2 change/deployment
  review 仍阻擋 cloud staging；D-009 阻擋 Stage 3 Calendar。
- 沒有 cloud backend、Authentication、實際 Calendar 連線或真實患者資料。
- `apps/api` 仍只路由 `GET /v1/health`。
- 2026-07-27 的 Hosting preview 是 static、synthetic-only、`noindex` 的 dated
  deployment；本次文件變更不代表重新部署。
- D-004 已確認營業時間、多項服務與「實際時長不寫死」方向，仍缺 operational
  slot block、多服務占位、緩衝與 capacity；D-006 已完整核准但尚未實作，下一個
  Stage 2 gate 是 change/deployment review。

## 同日最終決策後補掃

業主完成 D-006 最終核准與排程澄清後，再對 repository 內 88 份 Markdown 執行
全文狀態掃描、link/index/lifecycle 檢查，並修正現行權威、核准包、架構計畫、
runbook 與導航文件：

- D-006／D-010 統一為「決策目標已核准，但控制／cloud 尚未實作或驗證」；
- 止鼾與醫美統一為「預約時不寫死實際療程分鐘」，reservation operational
  interval 與 encounter actual timestamps 分開；
- 超出營業時間的自訂手術時段統一為 administrator-only override＋必填理由，
  不委派且不繞過醫師／手術室／病患衝突；
- Calendar inbound 僅把「須與工作臺同步」列為已記錄方向；auto-apply／review
  queue 與 reviewer authority 未獲明確答案，D-016 仍為 `pending`；
- 日期型 review 內的舊狀態保留為歷史證據，並以生命週期註記指回現行權威。

本次是 plan-only 文件變更。`apps/web/public/modules/constants.js` 的舊
「止鼾 40–60 分鐘」與 worker 的一小時合成 Calendar fixture 是已知後續實作落差，
不是現行規則，也不是本次漏改；未取得改碼授權前不得動它們。

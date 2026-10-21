# SOL-BUSINESS：可追溯試用調整模型提案

日期：2026-10-22（Asia/Taipei）。狀態：**DESIGN-PROPOSED／BLOCKED-OWNER**，不是新政策或可用功能。
Packet：SOL-BUSINESS；本次只推進 D-24。原 packet 的 D-35、E3-25 保留既有來源結論，不借本提案重新關帳。
依據：[#268 保守版原話](https://github.com/waydefu/clinic/pull/268#issuecomment-6322342715)、
[既定政策 §4](../product/2026-09-29-business-delivery-policy-decisions.md#4-驗收與付款里程碑cp-03)、
[ADR-0008](../adr/0008-business-delivery-usage-and-milestones.md)。原話登記 PR #281 尚待業主合併。

## 已確認的來源缺口

- `calculateBusinessDeliveryMilestones`（`packages/domain/src/business-delivery.ts`）已有受政策上限約束的 `adjustmentDays`；不是重做日期工具。
- `evaluateBusinessMilestones`（`packages/domain/src/business-delivery-policy.ts`）沒有收到調整值，回傳未調整期限。
- `BusinessDeliveryApplicationService.view` 只傳 `firstEligibleUseAt`、policy 與 acknowledgements。
- `FirestoreBusinessDeliveryRepository.milestoneState` 的 `MilestoneState` 沒有調整批准；既有 acknowledgements 文件只有兩個確認項目。
- [既有 contract](../../packages/contracts/src/business-delivery.ts) 只接受正式上線與尾款確認，strict body 不接受試用調整。
  不把現有 `evidenceRef` 當作已存在的調整批准，不把未保存欄位假裝已接線。

## 送審的最小模型（尚未採納）

重用 `bd_milestones/acknowledgements` 與既有只增紀錄 `bd_milestone_acknowledgement_log`，不建立 collection。
在既有 milestone state 增加一份選用的目前調整投影，歷史事件留在既有 log；不新增或變更公開 API。
以下是待核的儲存設計，不是聲稱 repository 已有這些欄位：

| 提案欄位 | 合法輸入與來源 |
| --- | --- |
| `adjustmentId` | 不含身份的 opaque identifier，使用現有 identifier 規則；與一次批准綁定 |
| `firstEligibleUseAt` | 從既有 first-use 文件讀出的 UTC 起算，不接受客戶端另指定起點 |
| `policyVersion` | 已核且適用 internal synthetic scope 的政策版本，未知版本拒絕 |
| `adjustmentDays` | 整數、非負、不得超過該版本 `maxAdjustmentDays`；為累計總調整，不是可反覆加上的增量 |
| `approvalRef` | 業主確認的 opaque 引用；不是自由文字、秘密、姓名或可由請求自封的核准 |
| `revision`／`expectedVersion` | 與既有 acknowledgement revision 共用 optimistic concurrency，避免覆蓋他人確認 |
| `actorRef`／`approvedAt` | 已驗證服務端身分的既有雜湊／UTC 時鐘，不接受請求冒填 |
| `status`／`revocationRef` | 有效或已撤銷；撤銷需另一批准引用，保留舊批准與紀錄，不刪歷史 |

### 寫入、批准與撤銷

1. 暫不增加 writer、endpoint、milestone ID、權限或命令列雲端操作。API 原來兩種確認與回應保持相容。
2. 未來來源實作僅可接業主另核的 **server-only 調整命令入口**，不得讓 browser 直寫資料庫。
   若無法在「不新增 API」下取得可驗證的批准輸入，維持封閉；不得退回手改文件或把部署設定當批准。
3. 批准命令須同時帶 immutable `adjustmentId`、同一 first-use、政策、總調整天數、批准引用及預期 revision。
   已批准內容不得原地改寫；不同天數要一筆新批准事件，總天數仍受上限限制。
4. 在單一交易內讀取 first-use、目前投影與 log 冪等鍵，檢查權限、批准來源與 revision，寫投影及只增 log；
   交易不得呼叫外部系統。同鍵同內容重播回原 revision；同鍵異內容或已撤銷批准重播都拒絕。
5. 撤銷同樣須可驗證的新批准與 revision，僅使該調整不再有效；舊記錄保留。撤銷之後不得重播舊批准復活。
   若沒有新的有效批准，讀取回到未調整日期，而不是刪除審計紀錄。
6. 不重新起算試用、不重寫 first-use、不把延長串到正式運行滿月／尾款／維護費。既有提前結束政策不在本模型實作。

### 讀取與時間

repository 僅回傳驗證通過、未撤銷且 first-use／policy 相符的有效調整；未存在與格式不合法要分開：
不存在仍沿用未調整日期，存在但不合法應拒絕該讀取，不靜默當零，也不直接信任 TypeScript cast。
service 傳入唯一 domain 計算，回應仍用既有 `trial.endExclusiveDate`，不加 wire 欄位或第二份計算。
UTC 儲存、Asia/Taipei 日曆日顯示與試用計算。domain 的上限唯一來自已核政策，不在 API／repository 重寫數字。

## 核准後的驗證契約（本 PR 未執行）

| 證據 | 正向 | 拒絕／衝突 |
| --- | --- | --- |
| domain／service | 有效批准使既有回應顯示調整期限；跨台北日界、月底、閏日固定時間 fixtures | 負值、小數、超上限、未知政策、起點不符、撤銷及未批准皆不得延長 |
| repository Emulator | 同一交易讀批准並寫投影／log；同鍵相同回原結果 | 同鍵異內容、stale revision、撤銷後重播、格式壞資料、缺 first-use、兩 writer 衝突不覆寫 |
| compatibility | 原兩種確認、RBAC、fresh reauth、CSRF、未知 route 的拒絕保持 | 不得讓新資料令正式運行未滿月或未確認尾款成為通過 |
| integration | 持久化後經 repository → service → domain → 既有 milestones 回應 | 未接資料流的純 helper 單測不算 D-24 修復 |

此表是後續 acceptance，不是已通過測試。需同一 exact head 的 required CI、Verification evidence 與獨立 diff review。
本 PR 只有設計與索引；本機重型測試 NOT_RUN（依執行電腦限制交 CI），runtime／雲端／資料操作 NOT_RUN（未授權）。

## 業主只需回答的設計問題

建議核准以上「既有文件＋既有 log、總天數有上限、撤銷不刪記錄、原起點與政策綁定」模型，
**並指定可驗證的 server-only 批准命令入口／批准來源**；沒有來源時維持封閉，不先建立 API。
核准後把具體答案記入決定登記簿，才改持久化契約與資料流。只核准設計不授權雲端資料寫入或 migration。

PR 合併本身只接受提案文件，不自動等於上述新儲存／批准契約已核准。D-24 仍 BLOCKED-OWNER，SOL-BUSINESS 不是完成。

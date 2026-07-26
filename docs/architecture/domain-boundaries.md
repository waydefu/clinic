# 領域邊界與不變條件

## 寫入路徑

```text
Web / 社群 / 未來 App
        -> Domain API
        -> Firestore Transaction + Outbox
        -> Worker
        -> Google Calendar / Email / 社群 / NAS Connector
```

只有 Domain API 可以變更預約、到診、個管指派、薪資案件、月結與隱私接受紀錄。Firestore Security Rules 預設拒絕病患端寫入；伺服器端必須自行驗證身份、角色與欄位。

## 重要不變條件

1. 同一 `resourceId + startAt` 在同一時間只能有一筆有效預約。
2. Firestore 是可預約時段的權威來源；Google Calendar 只反映同步結果。
3. 外部副作用不在 Firestore transaction 中發生。
4. 每個外部工作均有 idempotency key、可重試狀態與人工補救入口。
5. `completed` 只能由具權限的現場角色寫入，且必須留下 actor、時間與理由。
6. 預設計薪規則下，同一病患、同一個管、同一薪資月、同一 metric/rule version 最多一筆有效 credit。
7. 月結鎖定後，不得重算或覆寫；只能新增可稽核 adjustment。
8. 所有時間以 UTC 寫入，顯示與薪資月份以 `Asia/Taipei` 決定。
9. 不以姓名自動合併病患；任何病患合併與案件改派都需人工授權及稽核。

## 哪一層擁有哪一條規則

| 規則 | 唯一來源 | 其他層只能 |
| --- | --- | --- |
| 患者身分格式、正規化、比對鍵、身分證遮罩 | `packages/domain/src/patient-identity.ts` | 匯入。瀏覽器走 vendored 副本，只負責把 `{ field, code }` 翻成中文 |
| 時區常數與時段規則 | `packages/domain/src/schedule.ts` | 匯入。瀏覽器的時間格式化一律經 `modules/taipei-time.js` |
| 預約狀態轉移與守衛 | `packages/domain/src/appointment-*.ts` | 匯入 |
| 線路格式（wire schema） | `packages/contracts` | 只依賴 zod，不得反向依賴 domain |

**這張表由 `pnpm check:architecture` 強制執行**，不是慣例：它檢查依賴方向、
擋下瀏覽器重寫 domain 規則，並要求 domain 每個原因代碼都有對應的介面訊息。
規則的由來見 [2026-07-26 全專案審查](../reviews/2026-07-26-full-project-audit.md)。

## 核心資料關係

```text
patient -> appointment -> completed visit -> patient case -> case assignment
                                                    -> payroll credit -> payroll period snapshot
appointment -> outbox job -> calendar link -> Google Calendar event
privacy policy version -> privacy acceptance
```


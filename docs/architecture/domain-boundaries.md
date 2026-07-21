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

## 核心資料關係

```text
patient -> appointment -> completed visit -> patient case -> case assignment
                                                    -> payroll credit -> payroll period snapshot
appointment -> outbox job -> calendar link -> Google Calendar event
privacy policy version -> privacy acceptance
```


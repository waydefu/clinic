# 個案管理師月結與薪資案件規格

## 預設統計口徑

`countable credit` 的預設條件：

1. 預約已由授權櫃台/主管標記為 `completed`。
2. 該到診事件屬於目前 `payroll_rule` 的合格服務。
3. 到診時存在有效的個案管理師指派。
4. 同一病患、同一個管、同一臺北時區薪資月份、同一 `metricCode` 與規則版本，尚無有效 credit。

取消、爽約、待確認、重複 webhook 與未到診均不計入。這是「案件單位」與薪資匯出依據，不是法定薪資、所得稅或勞健保計算引擎。

## 月結狀態

```text
open -> provisional -> reviewed -> locked
locked -> adjustment_open -> adjusted_locked
```

- `provisional`：系統依當月完成到診產生候選 credit。
- `reviewed`：主管處理未指派、改派、例外或人工調整。
- `locked`：薪資管理者核准，建立不可修改快照並輸出檔案。
- 鎖定後發現錯誤時，以新 adjustment 修正，不變更原始 credit 或歷史匯出。

## 必備報表

- 每位個管：新患者/回診患者、有效案件單位、調整單位、總計。
- 未指派或無法計薪的完成到診清單。
- 依服務、醫師、來源與月份的案件分布。
- 每筆 credit 的患者代碼、完成日期、指派快照、規則版本、覆核人與調整原因。


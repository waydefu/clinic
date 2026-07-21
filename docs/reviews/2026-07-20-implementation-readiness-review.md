# 2026-07-20：啟動前比較審查與優化結果

## 結論

目前架構可進入「需求簽核與基礎設施建立」階段，但**尚不可接收真實病患資料**。阻擋項目列於 `docs/product/open-decisions.md`；特別是計薪口徑、隱私政策、Email 驗證、Calendar 作業 SOP 與環境帳務權限。

## 三份提案的比較結果

| 議題 | 初始 Firebase PDF | 零成本提案 | 本專案採用決定 |
|---|---|---|---|
| 後端 | Cloud Functions，未交代正式商用帳務與復原 | Vercel Hobby/GAS，成本低但有商用與公開端點風險 | Cloud Run + 專用服務帳號 + 工作佇列，接受商用成本 |
| 預約防撞 | 提及 Functions，但未定義資料模型與失敗補救 | 文件 ID transaction，但取消與多資源模型不足 | slot transaction + appointment history + outbox + idempotency |
| Google Calendar | 直接同步，無失敗狀態 | GAS 公開 Web App 橋接 | Calendar 為投影；專用日曆、無病患資料、可重試與 Runbook |
| 個資 | 泛稱 Firebase 資安 | 有 Rules，但未含政策、備份與資料權利 | 政策版本/閱覽紀錄、最小權限、資料遮罩、備份及法務門檻 |
| 個案管理/薪資 | 未涵蓋 | 未涵蓋 | `completed` 事件、指派歷程、credit 帳本、月結快照與 adjustment |
| NAS | 未涵蓋 | 未涵蓋 | 僅日後出站加密 connector；NAS 不是線上交易資料庫 |

## 已排除或緩解的高風險

| 風險 | 排除/緩解措施 | 剩餘責任 |
|---|---|---|
| Vercel Hobby 非商用限制 | 不使用 Hobby 作正式服務 | 雲端帳務與成本上限由技術負責人設定 |
| Calendar 逾時造成雙約或重複事件 | Firestore lock、outbox、固定 event ID、重試 | 櫃台遵守不直接改 Calendar 的 SOP |
| Calendar webhook 遺漏/到期 | 首期不依賴外部手動異動；後續才加入 watch + full sync | Phase 2 實作與營運監控 |
| 個資過度蒐集/外洩 | 預約最小欄位、無病歷、政策版本、遮罩與最小權限 | 法務完成最終文字與供應商揭露 |
| 薪資重複或歷史被改寫 | 病患月度唯一 credit、月結快照、鎖定後 adjustment | 薪資主管簽核規則與例外 |
| 病患誤合併 | 不以姓名自動合併，需可稽核人工操作 | 櫃台 SOP 與授權管理 |
| 雲端或 NAS 被公開暴露 | Cloud IAM、Secret Manager、NAS 僅出站 connector | NAS 導入前額外資安評估 |

## 上線前新增門檻

1. 以 Firestore emulator 完成 Rules/API 權限測試，並以 staging Calendar 完成冪等、取消與失敗回補測試。
2. 進行併發預約、Calendar 不可用、病患合併、個管改派及鎖定月結的失敗注入測試。
3. 設定每個環境的 Cloud budget alert、Cloud Run max instances、API/WAF rate limit、工作佇列速率與告警責任人。Budget alert 不是硬性關機機制，仍須搭配服務級上限。
4. 啟用真實資料前，完成隱私政策、預約條款、個資權利處理、備份/還原演練與櫃台教育訓練。


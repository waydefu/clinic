# 本機維運與邏輯還原演練（2026-07-26）

**結論：** Emulator 技術演練通過；cloud backup／PITR、真實 IAM、告警、聯絡人與
RTO／RPO **沒有**因此被判定通過。

| 項目 | 證據 |
| --- | --- |
| 日期／時區 | 2026-07-26／Asia/Taipei |
| 驗證版本 | 本文件所在 commit；遠端完成後由 CI artifact 綁定確切 SHA |
| 環境 | `beauessence-appointment-local` Firestore Emulator，零真實資料 |
| 指令 | `corepack pnpm test:rules` |
| 結果 | 6 個檔案、62 項測試通過；最終本機 suite 60.87 秒 |
| 還原測試 | `tests/firestore/local-restore-drill.test.ts` |
| 日曆復原測試 | `tests/firestore/calendar-sync-runbook.test.ts` |

## 1. 邏輯還原演練

情境是預約核心集合遭誤清空。測試先用真正的 transaction repository 建立預約，
把所有核心集合做 logical snapshot，清空來源，再還原到獨立的 named Emulator
database `restore-drill`。驗證期間來源保持清空，模擬保留事故現場、不覆寫原資料庫。

| Runbook 驗證 | 結果 | 自動證據 |
| --- | --- | --- |
| V1 資料筆數 | 通過 | 六個核心集合逐集合相等 |
| V2 抽樣比對 | 通過 | 還原前後 document ID 與全部欄位 deep-equal |
| V3 稽核連續性 | 技術範圍通過 | 建立預約的 audit action、resource 與 correlation 保留 |
| V4 冪等與 outbox | 通過 | outbox／idempotency 同步還原；原 command 重播回 `replayed: true` |
| V5 應用可用 | 通過 | 還原庫經真實 repository 建立並完成一筆預約，另建立並取消一筆 |
| V6 日曆一致 | Emulator companion 通過 | lost-ack、死信補回、同鍵重跑不重複，共 3 項 |

這不是備份產品測試：snapshot 只存在測試程序記憶體，沒有驗證 Firestore scheduled
backup、PITR 時間點、GCS、加密金鑰、IAM、跨 project 還原或流量切換。

## 2. 事故技術桌上演練

採用 runbook 建議情境：「櫃台回報患者收到別人的預約通知」。

1. 先列為 **SEV1 隱私疑慮**，不等待確認外洩才升級。
2. 止血順序為維護模式、暫停 worker、保留 Firestore／outbox／稽核與外部事件，
   不刪除事故現場。
3. 範圍認定以 correlation／causation ID 串接 appointment audit 與 outbox，不把
   日曆內容當真相來源。
4. 若是 lost-ack 或重試，固定 Calendar event ID 讓補回保持單一事件；若來源資料
   已損壞，還原到新 database 後才切換。
5. 對外只溝通已確認事實；通知義務由診所的法務／隱私負責人判斷。

可由程式證明的部分已被測試：維護 gate、direct-client deny、transactional audit／
outbox、named-database logical restore 與 Calendar lost-ack recovery。這次沒有
真人召集，因此**沒有**證明電話能打通、誰真的有 production 權限、告警會觸發、
法務能在目標時間內回應，或紙本降級流程能運作。

## 3. 後續邊界

以下工作不能在 D-010 與相關營運決定以外自行關閉：

- cloud staging 啟用後的 scheduled backup／PITR 真實還原；
- production IAM、維護模式與 worker 暫停權限實測；
- 告警路由、值班聯絡方式與真人 tabletop；
- 診所核准的 RTO／RPO、資料保存期限與跨區策略。

正式 quarterly restore drill 仍須依[備份與還原 runbook](../runbooks/backup-and-restore.md)
執行；本紀錄只把能在零雲端、零真實資料下完成的技術部分提早關閉。

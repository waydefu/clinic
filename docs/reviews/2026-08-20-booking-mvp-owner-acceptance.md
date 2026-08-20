# Booking MVP 業主驗收與交付審查 — 2026-08-20

**狀態：** 部署前候選版；合成預覽網址與到期日待本次授權部署後補入。這不是正式
上線核准，也不得用來處理真實病患、職員、薪資、醫療或 Calendar 資料。

## 業主需要知道的 11 件事

1. **這次完成了什麼？** 預約、營業時間、日期例外、休診、可預約時段與工作臺的
   合成展示已收斂；Case／Payroll 在 Phase 1 的 UI、路由、畫面投影與寫入邊界皆
   fail closed，但原有 domain／contract／tests 均保留（Freeze != Delete）。另完成
   Booking Preview 獨立驗證、網站廠商評估包、前端傳輸量報告、Calendar 規格對齊
   與 live 文件同步。
2. **現在業主可以實際測什麼？** 待下方新預覽網址補入後，可用全合成資料測
   `/booking` 建立、查看目前預約、改期與取消；在工作臺測清單／搜尋／篩選、狀態、
   排班、營業時間／例外／休診、時段與一般回診追蹤。建議各測一次桌面與手機版。
3. **哪些功能仍刻意凍結？** Case Management、Payroll／Commission、手術／臨床
   紀錄、付款／退款、庫存、LINE／Meta／CRM、多院區、App／Push 與進階報表；
   `/clinic` 只作既有視覺參考，內容與資產維持 frozen baseline。
4. **預約流程目前安全邊界是什麼？** 預覽是公開但會到期、`noindex` 的靜態合成
   環境；資料只留在該瀏覽器的 `localStorage`。不可輸入真實資料，瀏覽器不直連
   Firestore，也沒有 production API。一般 follow-up 不帶 `managerId` 仍可用；任何
   Case assignment intent 會在 mutation 前被拒絕。
5. **是否有正式病患資料或正式雲端後端？** 沒有。未使用真實資料，未啟用
   production Firebase backend、Authentication、Firestore、Functions 或 Cloud Run。
6. **Google Calendar 現況是什麼？** 尚未連線、未加 credential、未部署 worker。
   現行權威仍是 system/domain；Calendar 只可作 projection／operational view，outbound
   必須走 transaction → outbox → worker。Inbound 目前只有人工審查候選佇列規格，
   不得自動修改系統；D-009／D-016 仍 pending。
7. **網站廠商接下來拿到什麼？** 一份不需整包 repository 的
   [整合評估包](../integration/booking-web-vendor-evaluation.md)與
   [payload 報告](../integration/booking-frontend-payload-report.md)，包含官方
   `/reservations/` 目標、推薦 Widget + API 模式、API-only 替代、responsive／
   accessibility／error responsibilities，以及 current preview 不可直接 iframe 的限制。
8. **測試結果是否全部通過？** 候選凍結前的同 commit GitHub run
   [32345057004](https://github.com/waydefu/clinic/actions/runs/32345057004) 已 11/11
   jobs PASS（含 verify/performance/clinic freeze、unit、全部 E2E、Firestore Emulator、
   supply-chain、SAST 與 Verification evidence）。最終候選 C、授權紀錄 D、部署後文件
   head 仍各自必須同 SHA 全綠，才可結案。
9. **預覽網址與到期日？** `PENDING DEPLOYMENT`。只允許部署到
   `beauessence-clinic-staging` 的 `synthetic-review` Hosting preview channel，期限
   7 天；部署與線上驗證通過後才會以 Firebase 新網址及絕對到期時間取代本行。
10. **如果要回復，如何 rollback？** 程式與文件以 `git revert` 逐一回復，不改寫
    shared history；預覽會自動到期，也可依
    [preview runbook](../runbooks/synthetic-online-preview.md#下架)刪除該 preview channel。
    這些動作都不涉及 production data migration，因為本次沒有 backend 或真資料。
11. **下一個需要業主真正做決定的事項？** Phase 1 仍需正式關閉 privacy policy、
    保存／刪除及 vendor/data-region record（D-001～003）、排程／容量與取消／no-show
    規則（D-004／005）、Case／Payroll 規則
    （D-007／008）、Calendar owner／授權／scope 與 inbound reviewer／matching／delete
    semantics（D-009／016）、正式公開網址與人工備援（D-011）。手術／臨床與金流
    （D-014／015）屬獨立 frozen expansion，不由本次 Booking MVP 自動解鎖。

## 建議驗收順序

1. 手機（約 375px）與桌面各完成一筆全合成 `/booking` 預約，確認警語、欄位、
   錯誤提示、目前預約、改期與取消。
2. 工作臺以合成角色確認預約清單／搜尋／篩選、狀態、排班、日期例外、休診、時段
   與一般 follow-up；確認看不到 Case／Payroll entry，直接舊 hash 會安全回到 overview。
3. 開啟 `/privacy` 與 `/clinic`；前者應標示測試／草稿，後者只作 frozen 視覺參考。
4. 不在任何欄位輸入真實姓名、電話、證件、病歷、薪資或 Calendar 資料；測完清除
   瀏覽器網站資料即可清空合成狀態。

技術證據集中於
[Booking MVP execution log](../implementation/phase-1-booking-mvp-execution-log.md)；PR #23
保持未合併，等待業主完成這份驗收。

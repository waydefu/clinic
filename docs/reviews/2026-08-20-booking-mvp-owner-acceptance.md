# Booking MVP 業主驗收與交付審查 — 2026-08-20

**現行狀態：PENDING C2 DEPLOYMENT。** 業主已審閱先前 candidate C，並要求
在同一 PR #23 完成 final owner refinement。先前 exact candidate
`7e0add8079b37da2e1c11ef4f59660554b9b66d8`、463/463 線上檢查與其 preview
仍是有效 historical evidence，但不是現行交付候選，也不得作為新的廠商
或業主驗收網址。現行 C2 URL、expiry 與 online verification 在 exact-C2
部署完成前保持 **PENDING DEPLOYMENT**。

這不是正式上線核准，也不得用來處理真實病患、職員、薪資、醫療或 Calendar 資料。

## C2 final owner refinement 現行交付邊界

- Active non-frozen surfaces 預設為 warm theme；`/clinic` 與 doctor surfaces 仍維持
  frozen 30-file baseline，本輪沒有改動。
- Case Management 只在 synthetic workbench 恢復 UI、route、render 與受權限保護的
  mutation。寫入前先驗證 `ASSIGN_CASE`／`REASSIGN_CASE`，拒絕不得產生局部
  follow-up、Case、audit、outbox 或 persisted-state 寫入。這不是 D-007
  production approval。
- Payroll／Commission 仍 frozen，不可 discover、navigate、render 或 mutate；保留
  domain、contracts 與 tests。
- 工作臺週曆只由營業時間、日期例外、休診與真實合成 appointments 衍生，
  沒有虛構 event cards。這是 internal schedule view，不是 Google Calendar
  integration。
- `/booking` 從 true page top 開始，沒有初始自動捲動；Step 2／3 持續顯示已選
  真實 context；privacy dialog 關閉後保留 Step 3、輸入、已閱狀態與焦點。
- 網站廠商交付只有 `/booking`，目標是官網 `/reservations/`。Booking header 不暴露
  `/clinic`、doctor 或 staff workbench navigation；其他 repository routes 不屬廠商
  evaluation scope。
- [2026-08-20 新視覺基準](ui-visual-baseline-2026-08-20.md) 含 10 張逐張人工檢視
  的 GitHub-hosted 截圖；2026-08-10 與更早證據未改寫。
- 本輪未使用真實資料、未啟用 production backend／Firestore browser access、
  未連接 Google Calendar／LINE／Meta／NAS，也未改變 performance budget。

現行建議是等待 exact C2 full GitHub CI、合成 preview 部署與 online/browser
驗證完成，再使用本文件將記錄的新 URL 驗收。

## 先前 candidate C 交付紀錄（historical）

> 以下內容記錄 owner refinement 以前的 exact-C 狀態；不是現行 C2 驗收指示。

## 業主需要知道的 11 件事

1. **這次完成了什麼？** 預約、營業時間、日期例外、休診、可預約時段與工作臺的
   合成展示已收斂；Case／Payroll 在 Phase 1 的 UI、路由、畫面投影與寫入邊界皆
   fail closed，但原有 domain／contract／tests 均保留（Freeze != Delete）。另完成
   Booking Preview 獨立驗證、網站廠商評估包、前端傳輸量報告、Calendar 規格對齊
   與 live 文件同步。
2. **現在業主可以實際測什麼？** 使用下方已驗證網址，可用全合成資料測
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
7. **網站廠商接下來拿到什麼？** 已可交付一份不需整包 repository 的
   [整合評估包](../integration/booking-web-vendor-evaluation.md)與
   [payload 報告](../integration/booking-frontend-payload-report.md)，包含官方
   `/reservations/` 目標、推薦 Widget + API 模式、API-only 替代、responsive／
   accessibility／error responsibilities，以及 current preview 不可直接 iframe 的限制。
8. **測試結果是否全部通過？** Exact candidate C 的 GitHub run
   [32345967000](https://github.com/waydefu/clinic/actions/runs/32345967000) 已 11/11
   jobs PASS（含 verify/performance/clinic freeze、unit、全部 E2E、Firestore Emulator、
   supply-chain、SAST 與 Verification evidence）；授權紀錄 D 的 run
   [32346355049](https://github.com/waydefu/clinic/actions/runs/32346355049) 亦 11/11 PASS。
   部署後 `verify:preview` 為 463/463 PASS；本文件所在 final docs HEAD 仍須通過
   GitHub required checks 才可供 merge review。
9. **預覽網址與到期日？**
   <https://beauessence-clinic-staging--synthetic-review-xvqa68cx.web.app>；到期時間為
   **2026-08-27 16:37:05 Asia/Taipei**
   (`2026-08-27T08:37:05.942064109Z`)。這是 `beauessence-clinic-staging` 的
   `synthetic-review` Hosting preview channel；部署內容是 exact candidate C，不是
   PR #23 的 docs-only current HEAD。
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

1. 開啟
   <https://beauessence-clinic-staging--synthetic-review-xvqa68cx.web.app>；手機（約
   375px）與桌面各完成一筆全合成 `/booking` 預約，確認警語、欄位、
   錯誤提示、目前預約、改期與取消。
2. 工作臺以合成角色確認預約清單／搜尋／篩選、狀態、排班、日期例外、休診、時段
   與一般 follow-up；確認看不到 Case／Payroll entry，直接舊 hash 會安全回到 overview。
3. 開啟 `/privacy` 與 `/clinic`；前者應標示測試／草稿，後者只作 frozen 視覺參考。
4. 不在任何欄位輸入真實姓名、電話、證件、病歷、薪資或 Calendar 資料；測完清除
   瀏覽器網站資料即可清空合成狀態。

技術證據集中於
[Booking MVP execution log](../implementation/phase-1-booking-mvp-execution-log.md)；PR #23
保持未合併，等待業主完成這份驗收。

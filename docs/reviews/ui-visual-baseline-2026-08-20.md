# UI 視覺基準 — 2026-08-20

## 狀態與邊界

本批是 BOOK-MVP-003-B REDO 業主驗收 refinement 的現行 reference-only 視覺證據。
它覆蓋合成工作臺與 `/booking`，不是跨 OS pixel golden，也不取代行為、
可及性、效能或安全測試。

- 擷取來源 commit：`8376f580fa56a3671a6a10c2f42a4716a164d8e8`
- GitHub Actions 擷取 run：
  [`32361992728`](https://github.com/waydefu/clinic/actions/runs/32361992728)；job
  `96403401959` 完成 Chromium build、10 張擷取與 artifact upload
- 同一 source commit 一般 PR 驗證：
  [`32361996691`](https://github.com/waydefu/clinic/actions/runs/32361996691)，全部 required jobs
  與 Verification evidence 通過
- 環境：Linux x64、Chromium `149.0.7827.55`、Playwright `1.61.1`、
  `zh-TW`、`Asia/Taipei`、warm theme、reduced motion
- 固定合成時間：`2026-07-29T01:00:00.000Z`；實際擷取日期由
  manifest 的 `captureDate` 獨立記錄
- 10 個情境的 console errors／warnings 均為 0，且擷取程式先驗證無水平
  overflow

`/clinic` 與 doctor surfaces 此次不重拍：它們是 frozen surface，不是本次廠商
booking-only handoff 的 active 驗收路徑。Clinic freeze guard 仍對 30 個檔案
fail closed；2026-08-10 與更早批次保留為當時的 historical evidence，未修改、
刪除或改寫。

## 業主指定情境

1. 無預約事件的 schedule-derived 週曆：
   [desktop 1280×900](assets/ui-visual-baseline-2026-08-20/workbench--weekly-calendar-empty--desktop-1280x900--warm.png)
2. 三個真實合成預約事件的週曆：
   [desktop 1280×900](assets/ui-visual-baseline-2026-08-20/workbench--weekly-calendar-events--desktop-1280x900--warm.png)
3. 完診 follow-up 與 Case manager 欄位：
   [desktop 1280×900](assets/ui-visual-baseline-2026-08-20/workbench--follow-up-case--desktop-1280x900--warm.png)
4. 同一 follow-up／Case 情境的單欄手機版：
   [phone 375×812](assets/ui-visual-baseline-2026-08-20/workbench--follow-up-case--phone-375x812--warm.png)
5. `/booking` Step 1 的 true page top、營業時間與 booking-only header：
   [desktop viewport 1280×900](assets/ui-visual-baseline-2026-08-20/booking--step-1-true-top--desktop-1280x900--warm.png)
6. Step 2 與持續的已選條件摘要：
   [desktop 1280×900](assets/ui-visual-baseline-2026-08-20/booking--step-2--desktop-1280x900--warm.png)
7. Step 3 與持續的已選條件摘要：
   [desktop 1280×900](assets/ui-visual-baseline-2026-08-20/booking--step-3--desktop-1280x900--warm.png)
8. Step 3 手機單欄摘要：
   [phone 375×812](assets/ui-visual-baseline-2026-08-20/booking--step-3--phone-375x812--warm.png)
9. 從 Step 3 開啟的 privacy dialog：
   [desktop viewport 1280×900](assets/ui-visual-baseline-2026-08-20/booking--privacy-dialog-step-3--desktop-1280x900--warm.png)
10. 關閉 privacy dialog 後保留 Step 3 與表單狀態：
    [desktop 1280×900](assets/ui-visual-baseline-2026-08-20/booking--privacy-return-step-3--desktop-1280x900--warm.png)

每張的 route、role、state、viewport、capture kind、console count 與 SHA-256
記錄於 [manifest](assets/ui-visual-baseline-2026-08-20/manifest.json)。

## 擷取校正與人工檢視

第一批 artifact 的 full-page 圖顯示 sticky booking summary 被 Chromium 拼接重複；
這是 capture-only artifact，不是 runtime defect，因此該批未納入 repository。第二批
只在擷取時將 persistent summary 與既有 sticky regions 改以 document flow 呈現，
並在 manifest 披露 normalization；runtime sticky behavior 仍由 E2E 覆蓋。

第二批 10 張已逐張人工檢視：無事件週曆沒有假卡片；有事件週曆只有
三個實際合成預約；Case 欄位在桌面與手機都可讀；booking 首屏沒有
初始自動捲動或 clinic／internal navigation；Step 2／3 摘要與手機排版正常；
privacy dialog 關閉後回到原 Step 3 且輸入內容保留。未發現需要改動 runtime
的視覺缺陷。


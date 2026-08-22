# UI 視覺基準 — 2026-08-22

## 狀態與邊界

本批是 BOOK-MVP FINAL UI CORRECTION / C3 的現行 reference-only 視覺證據，
覆蓋合成工作臺、三步驟 `/booking`、雙欄位預約查詢與 synthetic 自助取消。
它不是跨 OS pixel golden，也不取代行為、可及性、效能或安全測試。

- 擷取來源 commit：`85c8cb90bbcdc1f16354bdd7f0300f7d6d83096d`
- GitHub Actions 擷取 run：
  [`32552601705`](https://github.com/waydefu/clinic/actions/runs/32552601705)；job
  `96981661065` 完成乾淨安裝、Chromium build、13 張擷取與 artifact upload
- 同一 source commit 一般 PR 驗證：
  [`32552271093`](https://github.com/waydefu/clinic/actions/runs/32552271093)，全部 11 個
  required jobs 與 Verification evidence 通過
- 環境：Linux x64、Chromium `149.0.7827.55`、Playwright `1.61.1`、
  `zh-TW`、`Asia/Taipei`、warm theme、reduced motion、單 worker
- 固定合成時間：`2026-07-29T01:00:00.000Z`；實際擷取日期由
  manifest 的 `captureDate` 獨立記錄
- 13 個情境的 console errors／warnings 均為 0，且擷取程式先驗證沒有
  page-level horizontal overflow

`/clinic` 與 doctor surfaces 沒有重拍：它們仍是 frozen surface，也不是本次
booking-only vendor handoff 的 active 路徑。Clinic freeze guard 仍對 30 個檔案
fail closed；2026-08-20 與更早證據保持原樣，僅作歷史紀錄。

## 業主指定的 13 個情境

1. 七個日期欄、無預約事件的週曆：
   [desktop 1280×900](assets/ui-visual-baseline-2026-08-22/workbench--weekly-calendar-empty--desktop-1280x900--warm.png)
2. 三個實際合成預約事件的週曆：
   [desktop 1280×900](assets/ui-visual-baseline-2026-08-22/workbench--weekly-calendar-events--desktop-1280x900--warm.png)
3. 完診 follow-up 與 Case manager 欄位：
   [desktop 1280×900](assets/ui-visual-baseline-2026-08-22/workbench--follow-up-case--desktop-1280x900--warm.png)
4. 同一 follow-up／Case 情境的手機單欄版：
   [phone 375×812](assets/ui-visual-baseline-2026-08-22/workbench--follow-up-case--phone-375x812--warm.png)
5. `/booking` Step 1 true page top、診所資料左欄與 type／service 右區：
   [desktop viewport 1280×900](assets/ui-visual-baseline-2026-08-22/booking--step-1-true-top--desktop-1280x900--warm.png)
6. Step 2 無 sidebar、單一 active date 與該日期時段：
   [desktop 1280×900](assets/ui-visual-baseline-2026-08-22/booking--step-2--desktop-1280x900--warm.png)
7. Step 3 本人資料／本次門診補充的雙語意欄：
   [desktop 1280×900](assets/ui-visual-baseline-2026-08-22/booking--step-3--desktop-1280x900--warm.png)
8. Step 3 的手機堆疊版：
   [phone 375×812](assets/ui-visual-baseline-2026-08-22/booking--step-3--phone-375x812--warm.png)
9. 從保留完整 Step 3 state 的表單開啟 privacy dialog：
   [desktop viewport 1280×900](assets/ui-visual-baseline-2026-08-22/booking--privacy-dialog-step-3--desktop-1280x900--warm.png)
10. 電話＋生日雙欄位查詢與最小化預約結果：
    [desktop viewport 1280×900](assets/ui-visual-baseline-2026-08-22/booking--cancellation-lookup--desktop-1280x900--warm.png)
11. 距預約嚴格大於 20 分鐘的取消確認：
    [desktop viewport 1280×900](assets/ui-visual-baseline-2026-08-22/booking--eligible-cancellation-confirmation--desktop-1280x900--warm.png)
12. 距預約 19 分鐘時只提供診所電話：
    [phone viewport 375×812](assets/ui-visual-baseline-2026-08-22/booking--cancellation-phone-fallback--phone-375x812--warm.png)
13. 三步驟後的預約成功結果，沒有第四步：
    [desktop viewport 1280×900](assets/ui-visual-baseline-2026-08-22/booking--success-result--desktop-1280x900--warm.png)

每張的 route、role、state、viewport、capture kind、console count 與 SHA-256
記錄於 [manifest](assets/ui-visual-baseline-2026-08-22/manifest.json)。

## 擷取校正與逐張人工檢視

擷取時只隱藏未聚焦 skip link，並把 sticky header／navigation／status 暫時改成
document flow，避免 Chromium full-page stitching artifact；runtime 的 sticky、焦點與
捲動行為仍由 E2E 覆蓋，這兩項 normalization 亦寫入 manifest。

13 張已逐張人工檢視。結果如下：

- **無 page-level overflow 或意外 clipping：** 375px 手機表單與 dialog 均留在 viewport；
  Step 2 日期列及工作臺手機導覽的橫向移動限制在元件內，沒有撐寬整頁。
- **無重疊或巨大空白：** Case 手機卡片、follow-up 表單、三個 booking steps、成功卡與
  footer 均依內容自然延伸；Step 2 slots 後直接接 footer。
- **資訊層級正確：** 週曆以七個日期欄為主體，休診只在 header 標示；只有三個實際
  synthetic appointments 出現事件卡。Step 1／2／3 分別聚焦類型項目、日期時段、
  基本資料，成功是結果而非 Step 4。
- **取消邊界清楚：** 查詢必須同時提供兩項資料；可取消情境先顯示確認；19 分鐘情境
  不顯示自助取消，只顯示 canonical `02-2577-1314` 點擊撥號。
- **暖色預設與隱私狀態：** 所有圖皆是 warm theme；privacy dialog 背後仍可辨識已填的
  Step 3 欄位與 consent state，dialog 內有版本、draft status、測試邊界與關閉動作。

人工檢視沒有發現需要再改 runtime 的 C3 視覺缺陷。

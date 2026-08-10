# UI 視覺基準 — 2026-08-10

**狀態：** 本文件是 2026-08-10 的 dated evidence，記錄診所首頁改為鼻功能／打鼾
混合式導覽後的現行畫面。它不是 production 核准、醫療內容核准，也不是跨作業系統
的逐像素 golden。現行工作權威仍是 [roadmap](../roadmap.md)、
[Phase 1 execution plan](../phase-1-execution-plan.md) 與
[decision register](../product/phase-1-decision-register.md)。

**與前一版的關係：** [2026-08-07 基準](ui-visual-baseline-2026-08-07.md)及更早版本
完整保留為歷史證據。現行基線是本文件；`check-structure.mjs` 只釘住本批 manifest
與十張 PNG。

## 1. 為什麼重拍

[首頁重構](2026-08-10-clinic-homepage-restructure.md)更換 `/clinic` 的資訊架構、hero、
症狀導覽、服務卡、評估流程、醫師摘要、FAQ 與 SEO shell。前一版首頁含固定圓球且
混合了不再需要的展示結構，因此已不能代表現況。

## 2. Diff-before-accept

先將新圖擷到 `ui-visual-baseline-2026-08-10`，再與 2026-08-07 逐檔比較：

| 結果 | 檔案 | 判定 |
| --- | --- | --- |
| 尺寸與內容改變 | `clinic--home--desktop`、`clinic--home--phone` | **預期**：首頁完整重構；全頁高度分別 5681→6678、9706→10429 |
| SHA-256 完全相同 | `/booking` 三張、`/privacy` 一張、工作臺四張 | **通過**：變更沒有外溢到預約、隱私或營運工作臺 |

兩張首頁圖經人工檢視，桌機為雙欄 hero／雙欄服務卡，手機為自然單欄；官網插圖沒有
失真、截斷文字或被固定圓形遮罩裁掉。標題使用 balanced wrapping，沒有單一中文字
孤立成一行。

## 3. 參考畫面

![診所首頁桌面參考](assets/ui-visual-baseline-2026-08-10/clinic--home--desktop-1280x900--light.png)

![診所首頁手機參考](assets/ui-visual-baseline-2026-08-10/clinic--home--phone-375x812--light.png)

完整集合（10 張）：

| Route／角色／狀態 | Viewport | 參考圖 |
| --- | ---: | --- |
| `/clinic`／public／home | 1280×900 | [clinic home desktop](assets/ui-visual-baseline-2026-08-10/clinic--home--desktop-1280x900--light.png) |
| `/clinic`／public／home | 375×812 | [clinic home phone](assets/ui-visual-baseline-2026-08-10/clinic--home--phone-375x812--light.png) |
| `/booking`／public／step 1 | 1280×900 | [booking step 1 desktop](assets/ui-visual-baseline-2026-08-10/booking--step-1--desktop-1280x900--light.png) |
| `/booking`／public／step 3，固定合成欄位 | 375×812 | [booking step 3 phone](assets/ui-visual-baseline-2026-08-10/booking--step-3-filled--phone-375x812--light.png) |
| `/booking`／public／step 3，低寬低高壓力狀態 | 320×568 | [booking step 3 stress](assets/ui-visual-baseline-2026-08-10/booking--step-3-filled--stress-320x568--light.png) |
| `/`／未登入／login gate | 1280×900 | [workbench login desktop](assets/ui-visual-baseline-2026-08-10/workbench--login--desktop-1280x900--light.png) |
| `/#appointments-section`／admin／一筆合成預約 | 1280×900 | [appointments desktop](assets/ui-visual-baseline-2026-08-10/workbench--appointments-populated--desktop-1280x900--light.png) |
| `/#appointments-section`／admin／一筆合成預約 | 375×812 | [appointments phone](assets/ui-visual-baseline-2026-08-10/workbench--appointments-populated--phone-375x812--light.png) |
| `/#case-section`／admin／到診、已指派個管 | 1280×900 | [case workload desktop](assets/ui-visual-baseline-2026-08-10/workbench--case-assigned-workload--desktop-1280x900--light.png) |
| `/privacy`／public／未核准告知草稿 | 375×812 | [privacy draft phone](assets/ui-visual-baseline-2026-08-10/privacy--draft-notice--phone-375x812--light.png) |

## 4. 可重現條件

- 指令：`corepack pnpm capture:ui`
- Playwright 1.61.1／Chromium 149.0.7827.55／Windows 10.0.22631 x64
- 固定合成時間：`2026-07-29T01:00:00.000Z`
- locale／timezone：`zh-TW`／`Asia/Taipei`
- theme／motion：light／reduced；DPR 1；workers 1；server `127.0.0.1:3211`
- 截圖前移開游標、清空 local storage、完成 image decode、font ready、network idle
  與兩個 animation frames。
- 每個情境都驗證無水平 overflow、console error 或 warning；本批十個情境的兩者均為 0。

完整環境、狀態與每張 PNG 的 SHA-256 在
[manifest.json](assets/ui-visual-baseline-2026-08-10/manifest.json)。結構 gate 只驗證 manifest
與檔案一致，不會判定視覺設計是否正確；首頁兩張仍須保留人工檢視紀錄。

## 5. 下一次重拍

先改 `current-ui.spec.ts` 的 `CAPTURE_DATE`，讓新圖落在新日期目錄，再逐張 diff；確認
後才更新 `check-structure.mjs` 的 required paths／`visualBaselineDirectory`、本文件與
規則書 §5.5。舊日期目錄不得覆寫或刪除。

# UI 視覺基準 — 2026-08-20

**狀態：** 本文件是 2026-08-20 的 dated evidence，記錄工作臺凍結能力隔離
（BOOK-MVP-003-B）後的現行畫面。它不是 production 核准、醫療內容核准，也不是跨
作業系統的逐像素 golden。現行工作權威仍是 [roadmap](../roadmap.md)、
[Phase 1 execution plan](../phase-1-execution-plan.md) 與
[decision register](../product/phase-1-decision-register.md)。

**與前一版的關係：** [2026-08-10 基準](ui-visual-baseline-2026-08-10.md)及更早版本
完整保留為 dated evidence（2026-08-10 的 manifest、markdown 與 case-assigned-workload
PNG 逐位元組未動）。現行基線是本文件；`check-structure.mjs` 只釘住本批 manifest
與九張 PNG。

## 1. 為什麼重拍

BOOK-MVP-003-B 把已凍結的「個管指派」與「薪資檢視」能力從工作臺隔離：`#case-section`
不再有 UI 入口（導覽、待辦、表單與深連結全部 fail-closed），但 domain／state、
contracts、RBAC 與相關測試完整保留。2026-08-10 的工作臺畫面含「個管尚未指派」待辦
與已指派個管的 workload 區塊，已不能代表現況，因此重拍。

工作臺之外的頁面（`/clinic`、`/booking`、`/privacy`）原則上沒有受到隔離影響，但
本批在 Windows 10（10.0.19045）擷取，而 2026-08-10 是在 Windows 11（10.0.22631）
擷取，系統字型渲染不同，因此**九張圖全部與 2026-08-10 逐位元組不同**——這是文件
化預期的環境差異（規則書 §5.5：系統字型會讓不同 OS 的字形與換行產生合理差異），
不是功能回歸。每一張都比對過 2026-08-10 的版面：除工作臺移除個管入口外，沒有
產生新的水平 overflow 或 console error／warning（見 §4）。

## 2. Diff-before-accept

先將新圖擷到 `ui-visual-baseline-2026-08-20`，再與 2026-08-10 逐檔比較：

| 結果 | 檔案 | 判定 |
| --- | --- | --- |
| 移出現行集合 | `workbench--case-assigned-workload--desktop-1280x900--light.png` | **預期**：凍結能力不再有 UI 入口；該張 2026-08-10 dated evidence 原樣保留 |
| 工作臺版面變更 | `workbench--login`、`workbench--appointments-populated`（桌機、手機） | **預期**：隔離後導覽不含個管入口；合併至系統字型渲染差異 | 
| SHA-256 逐位元組不同但版面同構 | `/booking` 三張、`/privacy` 一張、`/clinic` 兩張 | **環境差異**：08-10 為 Windows 11、本批為 Windows 10，字形／換行渲染不同；無隔離相關變更外溢 |

## 3. 參考畫面

![診所首頁桌面參考](assets/ui-visual-baseline-2026-08-20/clinic--home--desktop-1280x900--light.png)

![診所首頁手機參考](assets/ui-visual-baseline-2026-08-20/clinic--home--phone-375x812--light.png)

完整集合（9 張）：

| Route／角色／狀態 | Viewport | 參考圖 |
| --- | ---: | --- |
| `/clinic`／public／home | 1280×900 | [clinic home desktop](assets/ui-visual-baseline-2026-08-20/clinic--home--desktop-1280x900--light.png) |
| `/clinic`／public／home | 375×812 | [clinic home phone](assets/ui-visual-baseline-2026-08-20/clinic--home--phone-375x812--light.png) |
| `/booking`／public／step 1 | 1280×900 | [booking step 1 desktop](assets/ui-visual-baseline-2026-08-20/booking--step-1--desktop-1280x900--light.png) |
| `/booking`／public／step 3，固定合成欄位 | 375×812 | [booking step 3 phone](assets/ui-visual-baseline-2026-08-20/booking--step-3-filled--phone-375x812--light.png) |
| `/booking`／public／step 3，低寬低高壓力狀態 | 320×568 | [booking step 3 stress](assets/ui-visual-baseline-2026-08-20/booking--step-3-filled--stress-320x568--light.png) |
| `/`／未登入／login gate | 1280×900 | [workbench login desktop](assets/ui-visual-baseline-2026-08-20/workbench--login--desktop-1280x900--light.png) |
| `/#appointments-section`／admin／一筆合成預約 | 1280×900 | [appointments desktop](assets/ui-visual-baseline-2026-08-20/workbench--appointments-populated--desktop-1280x900--light.png) |
| `/#appointments-section`／admin／一筆合成預約 | 375×812 | [appointments phone](assets/ui-visual-baseline-2026-08-20/workbench--appointments-populated--phone-375x812--light.png) |
| `/privacy`／public／未核准告知草稿 | 375×812 | [privacy draft phone](assets/ui-visual-baseline-2026-08-20/privacy--draft-notice--phone-375x812--light.png) |

## 4. 可重現條件

- 指令：`corepack pnpm capture:ui`
- Playwright 1.61.1／Chromium 149.0.7827.55／Windows 10.0.19045 x64
- 固定合成時間：`2026-07-29T01:00:00.000Z`
- locale／timezone：`zh-TW`／`Asia/Taipei`
- theme／motion：light／reduced；DPR 1；workers 1；server `127.0.0.1:3211`
- 截圖前移開游標、清空 local storage、完成 image decode、font ready、network idle
  與兩個 animation frames。
- 每個情境都驗證無水平 overflow、console error 或 warning；本批九個情境的兩者均為 0。

完整環境、狀態與每張 PNG 的 SHA-256 在
[manifest.json](assets/ui-visual-baseline-2026-08-20/manifest.json)。結構 gate 只驗證 manifest
與檔案一致，不會判定視覺設計是否正確；工作臺兩張仍須保留人工檢視紀錄。

## 5. 下一次重拍

先改 `current-ui.spec.ts` 的 `CAPTURE_DATE`，讓新圖落在新日期目錄，再逐張 diff；確認
後才更新 `check-structure.mjs` 的 required paths／`visualBaselineDirectory`、本文件、
docs/README.md 索引與規則書 §5.5。舊日期目錄不得覆寫或刪除。
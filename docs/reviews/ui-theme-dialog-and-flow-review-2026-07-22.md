# 主題、彈窗與動線優化（2026-07-22 第二輪）

## 起因

專案負責人以線上預覽截圖回報四項：sticky 導覽列半透明疊字、預約清單排序
疑慮、原生 confirm 彈窗不美觀、患者端選錯初診／回診的返回動線；並要求加上
暖色護眼與暗色模式、確保網頁規範與 SEO，且對照多份權威資料。

## 對照的外部準則

1. [MDN：`<dialog>` 元素](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog)
   ——`showModal()` 內建焦點陷阱、Esc 關閉與 `aria-modal`
2. [W3C WAI-ARIA APG：Modal Dialog Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
   ——對話框需可存取名稱（`aria-labelledby`）、焦點管理
3. [web.dev：`prefers-color-scheme`](https://web.dev/articles/prefers-color-scheme)
   與 [color-scheme](https://web.dev/articles/color-scheme)
   ——深色模式應跟隨系統偏好、`color-scheme` 讓表單控制項同步
4. [Material Design：Dark theme](https://m3.material.io/styles/color/dark-theme)
   ——深色表面用深灰綠而非純黑，維持高度層次
5. [Apple HIG：Dark Mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode)
   ——兩種外觀下都要維持內容可讀與品牌一致
6. [WCAG 2.2 SC 1.4.3 對比度](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
   ——正文 4.5:1；本次深色主題實測全部配對 ≥ 6.19:1
7. [NN/g 易用性啟發式](https://www.nngroup.com/articles/ten-usability-heuristics/)
   ——#1 系統狀態可見、#3 使用者控制與自由（返回動線）、#5 錯誤預防

## 修正內容

| # | 項目 | 內容 |
| --- | --- | --- |
| 1 | 導覽列不透明 | `.workspace-nav` 由半透明白改為不透明 `--surface` 並加陰影；hero 文字不再透出疊字 |
| 2 | 預約清單排序 | 實測確認現行程式已正確：越接近現在的排越上面，新建立的預約立即歸位（`sortedAppointments` 於每次快照套用）。回報的問題出自 07-22 13:44 重新部署前的舊版 |
| 3 | 自製確認彈窗 | `modules/confirm-dialog.js`：原生 `<dialog>.showModal()`，取消鈕優先聚焦（誤按 Enter 不觸發破壞性動作）、破壞性動作紅色確認鈕、Esc 可取消；取代兩頁全部 7 處原生 confirm；`check:ui` 新增「禁止 window.confirm」守門 |
| 4 | 患者端返回動線 | 第 2 步顯示「目前選擇：初診 · 止鼾，可返回重選」脈絡列；第 3 步新增「← 重新選擇類型與項目」直達第 1 步；類型與項目按鈕補 `aria-pressed` |
| 5 | 主題系統 | 自動（跟隨系統）／淺色／護眼暖色／深色四段切換，兩頁共用 `theme.js`（`<head>` 同步載入避免閃爍；CSP 禁 inline script 故為獨立檔）；選擇持久化於 `localStorage`；`meta theme-color` 與 CSS `color-scheme` 隨主題更新；全部硬編碼色彩收斂為 design token |
| 6 | 網頁規範檢查 | `lang="zh-Hant"`、標題階層、landmark、meta description、canonical、OG、JSON-LD 結構化資料齊備；零外部請求；`prefers-reduced-motion` 支援；測試階段依規定維持 `noindex` |

## 驗證（2026-07-22，本機 127.0.0.1:3100）

- `corepack pnpm verify` 通過（95 tests；`check:ui` 含新守門）。
- 深色主題對比度實測（WCAG 相對亮度公式）：正文 13.54:1、次要文字
  7.15:1、品牌綠文字 7.58:1、危險紅 6.19:1、白字綠底按鈕 7.91:1——
  全部高於 AA 的 4.5:1。
- 彈窗實測：取消→不動作；確認→執行並回報；開啟時焦點在「取消」。
  修正過程發現隱藏分頁的 `close` 事件派發可能延遲，改為按鈕點擊當下
  settle、Esc 仍由 close 事件收尾。
- 患者端實測：脈絡列文字正確、第 3 步雙返回鈕、直達第 1 步後焦點落在
  步驟標題、`aria-pressed` 正確切換；主控台 0 errors／0 warnings。
- 桌面步驟指示器文字標籤：專案負責人的寬螢幕截圖證實有顯示，roadmap
  對應項目結案。

## 同日第三輪補充（手機實機回報）

| # | 回報 | 修正 |
| --- | --- | --- |
| 1 | 手機上預約清單三個篩選下拉各佔一整列，吃掉整個畫面 | ≤48rem 改 2 欄格線、奇數個時最後一項跨滿；實測高度 173px、無水平溢出 |
| 2 | 「處置」選單在手機往左展開，直接超出螢幕 | 手機版預約卡為直向排列、按鈕靠左，選單改往右開並限制最大寬度；實測完全在視窗內 |
| 3 | 回診目標只有日期可選 | 改為「日期＋時間」；時間選單只列該日回診可掛號網格（:15/:45、扣除固定不開放），與時段產生共用 `followUpDueTimes` 同一套語意 |
| 4 | 未營業日不可選（日期時間類輸入同理） | 三層防護：改日期即重建時間選單並提示「當天未營業」、`recordFollowUp` 在狀態轉換層拒絕、預設日期改為第一個門診日（舊預設 2030-01-15 恰是週二未營業日，一併修正）。單元測試涵蓋週日／週一／休診例外／非網格分鐘（97 tests） |

## SEO／上線前仍待處理（測試階段刻意維持）

`noindex` 移除、`og:image` 分享圖製作、canonical 換正式網域、hashed
檔名與長期快取——均已列於 roadmap 第四節「上線前必須回頭處理的事」。

## 尚未處理（既有 roadmap 項目）

時段「載入更多」、預約清單分頁、`Noto Sans TC` 決定、櫃台鍵盤快捷鍵、
階段 B 前的按鈕 pending 狀態設計。接日曆實測的技術前置清單見
[日曆整合計畫第 3.1 節](../architecture/calendar-and-database-integration-plan.md)。

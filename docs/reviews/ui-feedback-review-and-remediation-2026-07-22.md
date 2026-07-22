# UI 回饋可見性檢查與修正（2026-07-22）

## 起因

專案負責人回報：「工作臺按下建立後沒有反饋，不知道建立是否成功。」實機檢查
證實此問題屬實且是系統性的，並依外部準則完成修正。線上預覽（07-21 17:18 部署）
的「無法建立預約」實測為**功能正常但回饋不可見**——建立其實成功了。

## 對照的外部準則

1. [NN/g 易用性啟發式 #1：系統狀態可見性](https://www.nngroup.com/articles/visibility-system-status/)
2. [WCAG 2.2 SC 4.1.3 Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html)
   與 [SC 3.3.1 Error Identification](https://www.w3.org/WAI/WCAG22/Understanding/error-identification.html)
3. [GOV.UK Design System：Error message／Error summary](https://design-system.service.gov.uk/components/error-message/)
   ——錯誤置頂需同時移動鍵盤焦點，欄位旁需同步顯示
4. [Material Design 3：Snackbar](https://m3.material.io/components/snackbar/guidelines)
   ——操作回饋應出現在操作點附近
5. [Apple HIG：Feedback](https://developer.apple.com/design/human-interface-guidelines/feedback)
   ——重要動作完成時應明確確認
6. [Baymard Institute：行內驗證研究](https://baymard.com/blog/inline-form-validation)
   ——錯誤訊息應緊鄰欄位

## 發現與修正

| # | 發現（實測證據） | 修正 |
| --- | --- | --- |
| 1 | 工作臺唯一回饋是頁首 `#status`；按「建立預約」時它在視窗上方 838px 外，成功／失敗都看不到，表單又同時清空，體感是「按了沒反應」或「資料消失」 | `#status` 改為 sticky（任何捲動位置皆可見）；每個表單旁新增就地 `form-status`，成功與失敗原因直接顯示在剛按下的按鈕旁 |
| 2 | `message()` 有設 `data-state`，但 CSS 只有患者端 `.status-message` 的變體——工作臺成功／錯誤外觀完全相同（死碼） | 補上 `.status-banner[data-state]` 樣式，成功／錯誤以色彩＋符號區分 |
| 3 | 建立預約成功只寫「預約已建立。」 | 改為「預約已建立：編號 · 日期 時間」，不必捲到清單即可核對 |
| 4 | 患者端告知未勾選時按送出：零文字錯誤，只默默移焦點（違反 SC 3.3.1） | 勾選框旁顯示 `role="alert"` 文字錯誤，送出鈕旁同步顯示原因；勾選後自動清除 |
| 5 | 患者端 domain 錯誤（重複預約）只在頁首顯示，送出鈕旁無提示 | 失敗原因顯示在送出鈕正下方（實測距離 10px），頁首 sticky 播報維持 |
| 6 | 帳號表單成功後不清空、無同名防護：連按兩次建立兩個同名帳號 | `createAccount` 在狀態轉換層拒絕重複標籤（含測試）；成功後清空輸入；移除 HTML 預填值 |
| 7 | 已完成到診的預約卡仍可按「確認改期」，被 domain 拒絕後錯誤又不可見 | 改期表單只在 `actionEnabled('reschedule')` 允許的狀態渲染，與處置選單同一閘門 |
| 8 | 患者端步驟切換後焦點停在 BODY；步驟指示器無 `aria-current` | `showStep` 把焦點移到新步驟標題（初始載入除外）；指示器同步 `aria-current="step"` |
| 9 | 患者端無 `<form>`，欄位內按 Enter 無法送出 | 第 3 步包進 `<form novalidate>`，Enter 觸發同一套「一次攤開全部錯誤」驗證 |

## 線上預覽重新部署（2026-07-22）

依 runbook 完成部署前檢查（`pnpm verify`、`login:list`、`projects:list`）後，
以 `hosting:channel:deploy synthetic-review --expires 7d` 重新部署。網址不變，
新效期 2026-07-29 13:44；`hosting:channel:list` 確認 live 頻道時間戳未變動
（2026-07-21 11:05）。線上驗收：CSP／`noindex`／`no-referrer`／`no-store`
標頭齊備，`form-status` 元素與 anchor 版 `message()`、患者端 `<form>`、
`aria-current` 皆已上線。

## 驗證（2026-07-22，本機 127.0.0.1:3100）

- `corepack pnpm verify` 通過（含新增的帳號重複單元測試，95 tests）。
- 實機逐項：未選時段／重複預約／排班無效時間／帳號重複，失敗原因皆出現在
  對應表單旁；建立成功顯示編號與時間並清空表單；到診後改期表單消失；
  患者端四步驟焦點與 `aria-current` 正確；主控台 0 errors／0 warnings。
- sticky 狀態列在捲動 2952px 深處仍固定於視窗頂（rect 實測 top 66px）。
- 375px 版面為既有基線且本次未動版面結構；瀏覽器面板不可見導致視窗尺寸
  讀值為 0，該寬度的目視複驗待下次實機檢查一併執行。

## 尚未處理（既有 roadmap 項目，非本次範圍）

時段「載入更多」、預約清單分頁、`Noto Sans TC` 決定、櫃台鍵盤快捷鍵，
以及接上真後端後所有按鈕的 pending 狀態設計（階段 B 前必須納入 UI 契約）。

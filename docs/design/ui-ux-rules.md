# 介面規則書

**版本：** 2026-07-27　**狀態：** 生效中　**適用範圍：** 本專案所有對外與對內畫面

## 0. 這份文件的地位

這是**規則**，不是建議。每一條都附「依據」與「怎麼驗證」；能自動驗的一律有測試
守著，不能自動驗的列在人工檢查清單裡。

**要改規則，先改這份文件**，並在同一個 commit 裡改對應的測試。反過來做——先放寬
測試、事後補說明——是明確禁止的：那正是規則失效的方式。

## 1. 為什麼需要它

以下缺陷在 2026-07 反覆出現，每次都是「同一類問題、不同位置」：

| 日期 | 症狀 | 根因 |
| --- | --- | --- |
| 07-25 | 「清除選取」「前往處理清單」看不出可以按 | `.text-button` 沒有任何形狀 |
| 07-25 | 同一個 class 在兩個容器裡長得不一樣 | 樣式被寫成 `.父層 .子層`，另一處沒吃到 |
| 07-26 | 手機上英文副標消失 | 用 `display: none` 解決空間不足 |
| 07-27 | 政策頁底部「回到線上預約」只是一句底線文字 | 新頁面不在任何掃描範圍內 |
| 07-27 | 頁尾連結被擠成一個字一行 | flex 項目預設可縮到比內容還窄 |
| 07-27 | 900px 時導覽三個連結各排成兩行 | 同上，且沒有人在那個寬度看過 |

共同點是**沒有人「做錯」什麼**——CSS 沒壞、也不報錯。所以規則必須配掃描，而掃描
必須量「畫面上算出來的樣子」，不是「有沒有寫某條規則」。

## 2. 規則

### R-1　動作用按鈕，導覽用連結

- 會**改變資料或狀態**的 → `<button>`。
- 會**帶使用者到另一個位置**（另一頁、頁內錨點）的 → `<a href>`。
- 不可用 `<div onclick>`。不可用 `<a>` 觸發破壞性動作。

**依據：** NN/g〈Buttons vs. Links〉——按鈕觸發動作，連結負責導覽；語意錯誤會同時
損害鍵盤操作（Enter/Space 行為不同）與輔助技術的播報。

**例外：** 導覽性質但屬於流程主線的動作（如「回到預約」），**外觀做成按鈕、語意
維持連結**。NN/g 明確承認這個慣例（購物車的「前往結帳」即是）。

**驗證：** 人工複查；`tests/e2e/affordance.spec.ts` 驗外觀。

### R-2　可點擊的東西必須看得出來

互動元素至少要有下列一種**形狀**：邊框、底色、外框、陰影、底線。

**只靠文字顏色不算。** 顏色是唯一線索時，色覺障礙者與低對比環境下的使用者無法
辨識，也違反 WCAG 1.4.1（不以顏色作為唯一視覺傳達方式）。

**依據：** NN/g〈Beyond Blue Links: Making Clickable Elements Recognizable〉；
WCAG 2.2 SC 1.4.1 Use of Color。

**豁免（僅此三種，不得自行擴充）：**

1. 導覽列內的連結（`nav`／`.workspace-nav`／`.patient-nav`）——位置即訊號。
2. 標誌連結——必須掛 `brand` class。「標誌＝回首頁」是網頁最強的既有慣例。
3. 行文中的連結——底線即足夠，且不受 R-4 約束。

**驗證：** `affordance.spec.ts`「互動元素都看得出可以按」，逐頁掃描計算後樣式。
**新增任何對外頁面時，必須把它加進那個 describe。**

### R-3　目標尺寸

- **下限 24×24 CSS px**：WCAG 2.2 SC 2.5.8 Target Size (Minimum)，**Level AA**，
  本專案的合規目標。
- **主要操作 44×44 CSS px**：SC 2.5.5 Target Size (Enhanced) 為 AAA；本專案對
  「送出、確認、刪除、預約」這類主要操作**自願採用**，因為現場常是單手持手機。

SC 2.5.8 的例外中，本專案只承認 **Inline**（句子中的連結）與 **Equivalent**
（另有一個符合尺寸的等效控制項）。

**依據：** [W3C Understanding SC 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)。

**驗證：** `typography.spec.ts` 量主要控制項高度；axe（`wcag22aa` 標籤）掃
`target-size`。

### R-4　短標籤不得被逐字斷行

獨立控制項（導覽項、頁尾項、按鈕）的標籤**一律 `white-space: nowrap`**。

中文沒有空格，容器只要比一個詞窄就會一個字一行。**寧可整列換行或橫捲，也不要
把一個詞拆開。** 同時，flex 容器裡放控制項的那一格要 `flex-shrink: 0`——flex
項目預設可以縮到比內容還窄，這是逐字斷行最常見的成因。

**不適用：** 行文中的連結（它本來就該跟著句子走）。

**驗證：** `affordance.spec.ts`「可點擊的短標籤不會被逐字斷成好幾行」，用
`Range.getClientRects().length` 量實際行數，六個寬度各掃一次。

### R-5　有橫向空間就不要上下堆疊　**（最高優先）**

同一組的動作（2–3 顆按鈕、一列連結）**在放得下的時候必須並排**。只有在真的放不
下時才換行或堆疊，而且要由 `flex-wrap`／容器寬度自己決定，不是寫死。

禁止的寫法：

- 在不需要的斷點無條件 `flex-direction: column`。
- 用固定 `width: 100%` 讓一顆按鈕獨佔一列。
- 讓容器可以縮到比內容還窄（見 R-4）。

**理由：** 白白的縱向堆疊會把首屏推走——這個專案量過：頁首多一列就讓患者看到第
一個問題的位置往下掉 50px（212→162px 那次修的就是這件事）。垂直空間在手機上是
最稀缺的資源。

**依據：** web.dev〈The new responsive〉——版面應由**可用空間**決定（container
query 思維），而不是由裝置類別決定；Material Design 3 的 button group 也是空間
不足才收合。WCAG 2.2 SC 1.4.10 Reflow 只要求 320px 下不出現水平捲軸，**它不是
「一律堆疊」的理由**。

**驗證：** `affordance.spec.ts`「同一組動作在放得下時必須並排」。

### R-6　文字尺寸

- 正文與表單控制項 **16px**（`--text-body`）。表單控制項低於 16px 會讓 iOS
  Safari 在聚焦時自動縮放頁面。
- 輔助文字下限 **14px**（`--text-micro`）。**不得再小。**
- 一律使用 token，不得寫字面值（`check:tokens` 硬性歸零）。

**驗證：** `check:tokens`、`typography.spec.ts`。

### R-7　新增對外頁面的檢查清單

1. 加進 `affordance.spec.ts` 的掃描（R-2、R-4、R-5）。
2. 加進 `performance-budget.json`（沒有預算的頁面 `check:perf` 直接失敗）。
3. 加進 `accessibility.spec.ts` 的 axe 掃描。
4. 加進 `responsive.spec.ts` 的寬度矩陣。
5. 在 `check-structure.mjs` 登記檔案。
6. 決定 `robots`／`canonical`／sitemap（見 SEO 基準）。

## 3. 例外處理程序

任何一條規則的例外，必須：

1. 寫在這份文件的規則條目底下（不是寫在程式註解裡就算）；
2. 說明**為什麼這個情境下規則不適用**，不是「暫時先這樣」；
3. 若掃描會擋，就在掃描中加具名豁免並附相同理由。

沒有走完這三步的例外，等於違規。

## 4. 參考資料

- [WCAG 2.2](https://www.w3.org/TR/WCAG22/)（W3C Recommendation）
- [Understanding SC 2.5.8 Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
- [Understanding SC 2.5.5 Target Size (Enhanced)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html)
- [NN/g — Beyond Blue Links: Making Clickable Elements Recognizable](https://www.nngroup.com/articles/clickable-elements/)
- [NN/g — Buttons vs. Links](https://www.nngroup.com/videos/buttons-vs-links/)
- [web.dev — The new responsive: Web design in a component-driven world](https://web.dev/articles/new-responsive)
- [Material Design 3 — Button groups](https://m3.material.io/components/button-groups/overview)
- 專案內：[網頁品質把關](../architecture/web-quality-gates-2026-07-24.md)、[Boutique Clinical Command 設計文件](boutique-clinical-command-2026-07-25.md)

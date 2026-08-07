# 清掉診所官網剩下的欠項（2026-08-07）

前兩輪各自留下一份「沒做的事」，累積到六項。這一輪把做得到的四項做完，
並把做不到的兩項從待辦清單改成明確的 **External manual verification required**。

## 影響範圍

改動集中在 `clinic-site.js`／`clinic-site.css` 的麵包屑、`check-design-tokens.mjs`
的 clamp 判定、三支測試與 `playwright.config.ts`，以及文件。沒有動後端、Rules、
API contract、RBAC、`packages/domain`。沒有新增執行期相依；新增的 WebKit 是
**測試期**瀏覽器。影像與字型預算未調整。

## 一、麵包屑語意（Wave 1）

兩處逐字重複的 inline 程式碼，三個偏離：外層是 `<div>` 不是 `<ol>`、當前頁沒有
標記、分隔符 `/` 是**真實文字節點**（會被唸出來）。視覺沒問題——五個項目量到的
top／bottom／height 完全一致 134/178/44，改完仍是 134/178/44。**axe 不檢查這三項**：
它看得到 `<nav>` 有名稱、連結有文字，那就是它要的全部。

抽成共用的 `breadcrumb(items)`，產出 `<nav aria-label>` ＋ `<ol>`／`<li>`，
當前頁 `<span aria-current="page">`，分隔符改由 `li:not(:last-child)::after`。

**措辭界線：** APG 對「當前頁不是連結」時的 `aria-current` 列為 optional
（它的範例把當前頁做成連結並標在連結上）。本專案一律要求明示——這是**專案加嚴
規則**，程式與文件都這樣寫，不得寫成 APG 的硬性要求。

Gate 在 `clinic-site.spec.ts`，路由 import `CLINIC_UI_SCAN_ROUTES`，斷言寫成
「有麵包屑的話就必須合格」，日後在別的路由加麵包屑不必回頭改測試。

**注入測試（實跑，不進 commit）：** 用 DOM 變異逐條確認會轉紅——拿掉
`aria-current`、把 `<ol>` 換回 `<div>`、把 `/` 文字節點加回去。第一版注入腳本
自己撞到這個 app 的 Trusted Types（`innerHTML` 被擋），改用搬節點。

## 二、非字級 `clamp()`（Wave 2）

`check-design-tokens.mjs` 的間距檢查看到值裡有括號就整條 `continue`，而 `width`
之類根本沒有掃描。實測 **28 處**（`clinic-site.css` 23、`styles.css` 4、
`workbench.css` 1）從來沒被任何規則看過。

`reviewFontSizeClamp` 抽成 `reviewClamp(value, policy)`，**只共用語法解析與
fail-closed 行為**；min／max 與 preferred 的合法性一律由 property-specific policy
決定：

| 類別 | 端點依據 | preferred |
| --- | --- | --- |
| font-size | `TYPE_SCALE`／`--text-*` | **強制**可縮放文字基底＋流體單位，不接受 px（SC 1.4.4） |
| spacing | `SPACING_GRID`／`--space-*` | **純 viewport 值合法** |
| layout dimension | 目前無 layout token → 全數記帳 | **純 viewport 值合法** |

**三類不共用尺度，也不共用 preferred 規則。** 字級那條「preferred 必須有可縮放
基底」來自 SC 1.4.4 的文字縮放要求；間距與容器寬度沒有那個要求，套過去是憑空
發明限制，而且會逼人改掉 `padding: clamp(1rem, 4vw, 3rem)` 這種完全正確的寫法。

**容器寬度另立 ratchet，不併進 `SPACING_GRID`。** 那四筆的端點雖然都落在 4px
網格上，但「能被 4 整除」不等於「它是 `--space-*`」——容器寬度與版面間距是兩種
語意。為了讓一個計數器歸零而寫進語意不對的規則，比留著盲點更糟。這個專案還沒有
layout token，所以端點先登記在檯面上，要收斂得先決定那套級數長什麼樣。

shorthand 需要自己的括號感知切割：`padding: clamp(4rem, 8vw, 7rem) 0` 用
`split(/\s+/)` 會碎成六塊。

起始上限＝實測現況（間距 16／4／1，容器 4），所以規則進來的 commit 自身是綠的。

**注入測試：** 讀真實 CSS、在**記憶體裡**多加一筆違規，不寫回檔案。間距 16→17、
容器 4→5、壞語法變成硬性違規。

**措辭（這個區分很重要，不要簡化掉）：**

> **「非字級 clamp 盲點已被納管」不等於「28 個 clamp 已全部標準化」。**

現在的狀態是：gate **知道它們存在**、數量**不能偷偷增加**。spacing 與 layout 的
端點**還沒有全部收斂**——那 21 筆仍在 ratchet 上。字級那一類是清零的（上限 0），
非字級這兩類不是。寫成「已修復」會讓下一位以為端點都對齊了。

## 三、200% 文字放大（Wave 3）

R-26 的驗證欄要求這一項。**只看文件層的水平溢位證明不了沒有裁切**——固定高度加
`overflow: hidden` 的元件，文字放大後下半截整個消失，`document.scrollWidth <=
clientWidth` 依然是綠的。W3C 的 F69 明列 clipped／truncated／obscured。

三層：文件層溢位、元素層裁切、功能不得遺失（關鍵區域仍可見、預約入口仍是 44px
目標）。

**第一版的判準是錯的，而且立刻被自己抓到。** 它比的是「容器的 scroll 範圍有沒有
超過 client 範圍」，於是 `/clinic` 的 hero 報成缺陷：那裡用偽元素畫裝飾形狀，
200% 下 `scrollWidth` 1325 對 `clientWidth` 1280——**沒有任何文字被切**，
而那正是 hero 上 `overflow-x: hidden` 存在的目的。改成問「**文字**有沒有跑到可見
框外」之後假陽性消失，而且不需要 allowlist 去掩蓋它。allowlist 目前是空的。

**注入測試（雙向）：** 把某段落的父層壓成 8px 高並裁掉 → 抓到；hero 的裝飾溢位
→ 仍然不報。

**措辭界線：** SC 1.4.4 的核心是「透過使用者代理提供的文字縮放機制放大到 200% 而
不損失內容或功能」，**W3C 並未指定必須用 text-only zoom**。這裡改的是根字級，
是 proxy，不取代人工驗收。CSSOM 而非 `addStyleTag`，因為這個 app 的 CSP 是
`style-src 'self'`。

## 四、WebKit 引擎覆蓋（Wave 4）

**先修正一個先前寫錯的敘述。** 之前的紀錄寫「Playwright 的 iPhone descriptor 跑的
仍是 Chromium，沒有 WebKit」，那把 device descriptor 與 browser engine 混為一談。
Playwright 支援 Chromium／Firefox／WebKit，descriptor 可以套在 WebKit project 上。
**正確的說法**：本專案的兩個 project（`Desktop Chrome`、`Pixel 7`）都是 Chromium
的 descriptor，所以自動化沒有 WebKit 覆蓋——那是設定選擇，不是工具限制，因此它
屬於「做得到」。

新增 `webkit` project，`testMatch` 收在 `clinic-site.spec.ts`。沒有把
`typography.spec.ts` 拉進去：它帶著工作臺的登入流程，把整條 auth 拖進第二個引擎
的代價與收穫不成比例；官網才是患者用 iPhone 開的東西。

CI 只在 `patient-portal` 這一組裝 WebKit（約 59 MB ＋系統相依），其餘四組不裝。
六組都裝等於為兩分鐘的引擎覆蓋付六份下載。

WebKit 下 16 個測試全過，包含新的麵包屑斷言——CSS `::after` 分隔符在那裡同樣不會
進 `textContent`。

**它換不到什麼：** 不是實體 iOS Safari。沒有真實軟鍵盤、OS 層 Dynamic Type／
系統字級、瀏覽器 chrome、safe area、平台輔助科技整合。§5.3 不會因此被滿足。

## 五、視覺基線重拍（Wave 5）

**這一輪最有價值的不是新圖，是流程。** 先擷到新日期目錄（舊目錄因此動都不會被
動到）、逐張 diff、確認差異都是預期的，最後才把 required paths 指過去。

那道流程立刻擋下兩張被殘留 `:hover` 污染的圖：

| 圖 | 症狀 | 原因 |
| --- | --- | --- |
| `workbench--appointments-populated--phone` | 「到診」按鈕是 `#0f4537` 而非 `#155c48` | `--accent-solid-strong` 是 `.button-primary:hover` |
| `workbench--case-assigned-workload--desktop` | 表格列是 `--surface-soft` 而非 `--canvas` | 列的 hover 底色 |

**這一輪沒有任何 commit 碰過 `workbench.css`、`styles.css` 或工作臺的 HTML。**
追下去發現 **2026-08-06 那份也被污染過**，只是位置不同（它的表格列是 hover 的、
按鈕不是）。三份基線的同一張工作臺圖兩兩都不同，就是這樣來的。

根因：`scenario.prepare()` 最後一次點擊把游標留在原地，截圖前沒有人移開。
修法：截圖前 `page.mouse.move(-10, -10)`。

**驗證方式刻意做成雙盲**：用 `(0, 0)` 與 `(-10, -10)` 兩個不同的移開座標各擷一次，
**十張的 SHA-256 完全相同**——證明游標的影響是消失了，不是換個位置藏起來。
另外連續兩次相同設定的擷取逐位元組相同，所以擷取本身一直是決定性的，游標是唯一
的變數。

10 張裡 4 張變更（2 張療程卡預期、2 張上述修正），6 張逐位元組相同。

## 六、剩下兩項：External manual verification required（Wave 6）

規則書 §5.3 的實體裝置矩陣與 runbook 的報讀器實聽，欠的不是工時，是**實體裝置與
真人輔助科技環境**。狀態改寫成：

> 自動化能做的範圍已完成；剩餘驗證需由具備實體裝置／真人 AT 環境的人員執行。
> **不列為 Agent 可執行的 backlog，但仍屬發布前的人工驗收項目。**

理由：掛在一般待辦清單上，每一輪都會有人重新發現「找不到 iPhone」再記一次；
劃掉又等於偷偷關閉一項真正的驗收要求。

runbook §8-b 新增兩筆待實機確認：麵包屑的播報（含 **CSS generated content 是否被
朗讀**這個已知風險），以及 R-26 的複雜圖長描述。§1.1 補上本輪新增的自動化斷言。

## 七、剩下的事：兩類，不是待修的缺陷

**「清欠項」到這一輪為止。** 剩下的不再是一份混在一起的未完成清單，
依性質正式分成兩類，各自有不同的負責人與觸發時機：

### A. 人工發布驗收（External manual verification required）

需要實體裝置與真人輔助科技環境，Agent 做不到。**不是 backlog，是發布前的驗收關卡。**

- 規則書 §5.3 的實體裝置矩陣（實體 iPhone／Android、旋轉、軟鍵盤、autofill、弱網）
- runbook §4–§7 的報讀器實聽，以及 §8-b 的 7 筆待實機確認
- 200% 文字放大的人工驗收——自動化的那一層是 proxy

### B. Design System 長期 ratchet 收斂

已納管、數量只能減不能增，**不是缺陷**。收斂時機由設計決策驅動，不是由「數字還沒
歸零」驅動。

| 類別 | 現況上限 | 收斂前要先決定的事 |
| --- | ---: | --- |
| 間距字面值（clinic-site.css） | 11 | 間距網格在 1.5→2→3→4rem 之間跳得很開，官網的大留白該補哪一階 |
| 間距 clamp 端點 | 16／4／1 | 同上 |
| 容器 clamp 端點 | 4 | 這個專案要不要有 layout／container token，以及它的級數 |

### 其餘明確不做

- **線上 WordPress 官網**（使用者 2026-08-07 指示不處理）。查證時看到的 `alt=""`
  與兩張只有像素的複雜資訊圖，記在
  [療程卡影像修復](2026-08-07-clinic-service-imagery.md)裡。
- **`typography.spec.ts` 不納入 WebKit**。官網結構的 WebKit smoke coverage 已經有了；
  為了「瀏覽器數量看起來漂亮」把帶登入的 typography matrix 整套複製過去，CI 成本
  大於現階段得到的訊號。**等真的出現 WebKit 的 typography／layout regression，
  再依風險加**。

## 八、驗證

```bash
corepack pnpm verify
corepack pnpm exec playwright test --project=webkit
```

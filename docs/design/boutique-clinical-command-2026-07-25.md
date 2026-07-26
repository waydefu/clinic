# 視覺方向：Boutique Clinical Command（2026-07-25）

這份文件是視覺改造的**單一交接點**。接手的人只要讀這一份，就知道方向是什麼、
已經做到哪裡、下一步要做什麼、以及哪些事情不能碰。

## 1. 方向與由來

負責人於 2026-07-25 採用「精品醫療營運指揮臺」，這是一個**混合方案**而不是單一
風格：

| 系統層級 | 採用風格 | 負責什麼 |
| --- | --- | --- |
| 全站骨架 | 瑞士資訊設計 | 網格、字級、對齊、留白、資訊層級 |
| 品牌外觀 | 精品營運系統 | 墨綠、暖白、宋體標題、少量香檳金 |
| 營運首頁 | 情境式指揮中心 | 顯示「現在最該處理什麼」 |
| 表格工作區 | 觸感硬邊 | 預約、排班、個管、權限、稽核 |
| 患者預約頁 | 精密自然主義 | 降低焦慮、溫暖但不失專業 |
| 動效與狀態 | 克制式未來醫療 | 只用來解釋狀態變化 |

核心前提，也是所有取捨的依據：

> **營運工作臺以效率為主，患者預約頁才承擔品牌與情緒。**

兩個頁面**刻意不統一密度**，但 2026-07-25 的桌機可讀性回饋重新畫清楚了下限：
工作臺的導覽、狀態、篩選、表格資料、表單與操作文字，以及患者頁所有必讀／可操作
文字都使用 16px；14px 只留給 eyebrow、代碼、徽標、chip 與緊湊週曆事件等次要
資訊。兩端密度仍不同，但不再用縮小高頻資訊來換密度。

## 2. 實施順序（負責人指定）

順序經負責人調整過，理由是**先處理影響效率的問題，再處理品牌感**，而且每一階段
都能獨立驗收與回滾，不把視覺、效能與互動問題混在一起。

| 階段 | 內容 | 狀態 |
| --- | --- | --- |
| 1 | Design Tokens 2.0（CSS） | **完成** `bc975be` |
| 2 | 瑞士資訊骨架（Grid／Spacing／Type Scale） | **完成** `68fa08b` |
| 3 | 工作臺卡片重構為資料表格 | **完成** `bab9768`（表格）＋`2a4b944`（排序、批次操作） |
| 4 | 首頁改為情境式指揮中心（資訊架構重構） | **完成**（見 §8） |
| 5 | 品牌層（配色、香檳金、系統字體排版） | **完成**（見 §10） |
| 6 | Motion System 與互動細節 | **完成**（見 §11） |

品牌資產（診所標誌、健保署署徽）已先行置入：`a36274e`。無障礙與效能的修正：
`01bb7dd`、`d4fe827`。

**階段 5 的兩個前置決定已於 2026-07-25 拍板**（原 §7）：

1. **不載入任何中文字型**，字型預算維持 0 KiB。中文一律用系統字體。
2. **香檳金＝Brand Decorative Accent**，只承載品牌與質感，永遠不代表狀態。

實作結果與界線見 §10。

## 3. 已完成的部分：接手前必須知道的規則

### Token 是唯一的換膚機制

`:root` 之外**沒有任何** `[data-theme]` 選擇器，也不該新增。換主題永遠只是換值。
需要某個元素在深色下表現不同時，做法是新增一個 token 並在主題區塊覆寫它——
`--brand-mark-filter` 就是這樣處理「標誌在深色底會沉下去」的。

### 硬性歸零的類別（`pnpm check:tokens`）

再出現一個就是建置失敗，不是警告：

- 未定義的 `var(--x)`（`--text-sm` 曾經被用了五次卻從未定義，CSS 對此完全沉默）
- `:root` 以外的寫死顏色
- 數字字重、寫死圓角、寫死陰影
- 非正式尺度的斷點（只有 64rem／48rem／30rem）
- 離開字級尺度的 `font-size`、離開 4px 網格的間距
- 寫死的字體堆疊、寫死的動效時長

**兩個刻意的例外**，都有紀錄：`em` 字級（相對於父層文字的比例，換成 rem 會切斷
那個關係）與 `prefers-reduced-motion` 區塊裡的 `0.01ms`（那是把動效關掉，不是
調時長）。

### 已定義但尚未使用的 token

階段 5、6 會用到，現在就定義好是為了讓決定只做一次：

- `--font-serif` **目前指向與 sans 相同的堆疊**。階段 5 才換成思源宋體，而那一步
  會撞到 0 KiB 的字型預算。
- `--motion-fast/base/slow` 與兩個 easing：已定義，只有少數 transition 用到。
- `--control-height-sm/md`。

### 影像與樣式表預算

`apps/web/performance-budget.json`。建置會壓縮 CSS **與 JS**（`minifyStylesheets`
／`minifyModules`，用 esbuild），所以**原始碼裡的註解不會出貨**——請放心把理由
寫清楚，那是這個專案的慣例，不是負擔。JS 只逐檔壓縮不 bundle：CSP 是
`script-src 'self'`，產物必須維持一份份 ES module。

省下來的額度沒有留成鬆弛，預算同步收緊過。`node scripts/check-performance-budget.mjs
--report` 可以隨時印出逐頁明細。

字型預算是 0 KiB，這是刻意的閘門：任何人加字型都會撞到它，變成一次正式決定。

### 兩個「不要把它加回來」的決定

這兩件事看起來像漏掉的，其實是刻意移除的，都有守衛擋著：

1. **按鈕上沒有 `aria-busy`。** MDN 明載它是給 live region、複合元件與 feed 的
   ——語意是「這一塊正在改，先別唸」，會**把該元素的子內容對輔助技術隱藏**，
   等於在忙碌期間讓按鈕失去名稱；而且螢幕閱讀器不會立即播報，只有重新聚焦時
   才帶得到。忙碌狀態由按鈕文字（視覺）與 `role="status"` 狀態列（輔助技術）
   表達。`check:ui` 有一條 `refuseText` 擋它回來。
2. **`#appointments` 不是 live region。** 它的內容整批換掉，掛 `aria-live` 會讓
   螢幕閱讀器在每次篩選時把整張表逐列重唸——搜尋框每打一個字就重唸一次。變化
   由 `#appointment-result-summary` 的「N 筆結果」公告。

### 資料表格必須帶 ARIA role

`.data-table` 的手機版用 `display: block` 堆疊，而**改變 display 會讓瀏覽器把
表格語意從無障礙樹上拿掉**（Firefox 至今仍會）。因此標記上要明確寫
`role="table" / rowgroup / row / columnheader / cell`。新增其他表格時照做，
`tests/e2e/workbench-lifecycle.spec.ts` 有釘住這件事。

## 4. 階段 3 的實際範圍

### 表格轉換：全部完成

| 區塊 | 函式 | 表格 | caption |
| --- | --- | --- | --- |
| 櫃台處理清單 | `renderAppointments` | `.appointment-table` | 櫃台處理清單… |
| 排班管理 | `renderSchedule` | `.schedule-table` ×3 | 每週時段／日期例外／固定不開放 |
| 個案管理 | `renderCaseAssignments` | `.case-table` | 完成到診的個案… |
| 月度統計 | `renderWorkload` | `.workload-table` | 個管師月度工作量… |
| 員工權限 | `renderAccounts` | `.account-table` | 員工帳號與權限… |
| 稽核紀錄 | `renderAudit` | `.audit-table` | 稽核事件… |

`renderOutbox`（日曆投影意圖）**刻意維持清單**：它每一列的形狀不規則（錯誤訊息、
重新排入按鈕、補回者），欄位對不齊，做成表格只會多出一堆空格。

轉換時同步做掉的三件事，接手時請沿用：

1. **手機堆疊改成 `.data-table` 通用**。先前那一段綁在 `.appointment-table` 上，
   新表格套不到。現在新增任何 `.data-table` 都自動有堆疊、`data-label` 欄位名與
   每列一張卡片的外觀。
2. **收起來的 `thead` 要真的縮成 1×1**。原本只有 `clip-path` + `position:
   absolute`，版面上仍保有「所有欄名並排」的寬度，個案管理分頁因此在 375px 多出
   31px 的水平捲軸。已改成與 `caption` 相同的隱藏方式，並加了逐分頁量測的迴歸
   測試。
3. **`<form>` 不能包住 `<tr>`**——HTML 剖析器會把它丟到表格外面。個管指派的做法
   是：表單放在「個案管理師」那一格，送出鈕放在「操作」格、用 `form="<id>"`
   屬性關聯回去。這個關聯壞掉時按鈕會完全沒反應且不報錯，所以 e2e 直接驗它送不
   送得出去。

### 欄位排序（`2a4b944`）

照 WAI-ARIA APG 的 sortable table 做，規則要照抄，別自己發明：

- `aria-sort` 掛在 **`th`** 上，值只有 `ascending`／`descending`；沒排序的欄位
  **不寫這個屬性**，而不是寫 `none`。
- **同一時間只有一欄**帶 `aria-sort`。
- 欄名包成 `<button>`，鍵盤操作就交給瀏覽器原生的按鈕行為，不要自己接鍵盤事件。
- 方向箭頭設 `aria-hidden`，否則會被讀進按鈕的可及名稱。
- 「點欄位標題可變更排序」寫在 `caption` 裡（它本來就視覺隱藏），不必在每一顆
  按鈕上重複一次。

兩個實作上的細節：比較用 `localeCompare(…, 'zh-Hant')`，中文才會照筆劃排而不是
UTF-16 碼位；同值時一律回到時間先後，否則每次重畫同分的列會換位。重畫會換掉整個
表頭，所以要把焦點放回剛按的那一欄。

### 批次選取與批次操作（`2a4b944`）

- **「全選」放在表格外面的工具列。** 放進選取欄的表頭，它會變成底下每一個選取
  方塊的欄位名，於是每一列都被唸成「全選」，分不出在勾誰（Adrian Roselli 2025
  〈Check / Uncheck all in a Table〉記錄過這個陷阱）。
- 每一列的方塊要有**逐列不同**的名稱（帶患者與時間）：螢幕閱讀器可以只在表單
  控制項之間跳，那時候看不到同一列的其他格。
- 部分選取時全選方塊設 `indeterminate`（無障礙 API 的 mixed）。這只能用 JS 設，
  HTML 沒有這個屬性。
- **啟用條件是「每一筆選取的都合法」，不是「任一筆合法」。** 後者會讓人以為十筆
  都處理了，其實只動到三筆。
- 批次不新增任何後端路徑：逐筆走既有的 `/bookings/{id}/…`，狀態守衛、權限與稽核
  都不因為批次而放寬。有失敗就照實回報「N 筆成功、M 筆未處理」。

目前開放的批次處置只有**確認取消**與**標記未到**。刪除刻意不做批次——它會讓紀錄
從營運清單消失、只留稽核，逐筆確認理由才是對的。

### 展開細節列

沿用既有機制：改期與備註表單展開在**跨欄的第二列**（`.appointment-forms`，
`colspan` 要跟著欄數走，目前是 7）。只有真的有表單時才產生那一列——空的 `<tr>`
在表格裡仍佔一列，會在每筆之間留下一道看不出原因的縫。

### 改這一區時務必知道的一件事

所有 JS 與 e2e 都掛在 **`data-appointment-card` 屬性**上，不是 `article` 標籤或
版面 class。正因如此，卡片改表格才沒有動到 `admin-bootstrap.js` 一行——事件
委派、筆數統計、週檢視點擊捲動全部照舊。

**沿用這個做法**：新的表格請把識別放在 `data-*` 屬性上，不要讓測試或事件處理
去選 `tr`、`td` 或版面 class。

## 5. 現有的自動化守衛

改視覺時這些會替你抓錯：

| 守衛 | 抓什麼 |
| --- | --- |
| `pnpm check:tokens` | 上面 §3 那一整份清單 |
| `tests/e2e/theme.spec.ts` | 三主題必須產生**三種不同**的深底；深色亮度階層；品牌圖真的載入；標誌在深色下提亮 |
| `tests/e2e/responsive.spec.ts` | 兩頁 × 9 個寬度（含每個斷點與其上方 1px、320px）不得出現水平捲軸 |
| `tests/e2e/workbench-lifecycle.spec.ts` | 表格欄位對齊、表頭正確、ARIA role 齊全、手機堆疊仍帶欄位名；六張表都有 caption 與完整 role；已發布排班沒有操作欄；個管指派的跨格 `form` 關聯送得出去；**每個工作區在 375px 都不得有水平捲軸**；`aria-sort` 一次只有一欄且欄名是按鈕；全選在表格外、每列選取名稱各不相同、批次只動選取的那幾筆；首頁零筆待辦不出現／最急的放大／全清空時安靜；忙碌狀態不設 `aria-busy`；清單不是 live region |
| `pnpm check:ui` | 每個資料清單容器**不得**掛 `aria-live`；HTML 內**不得**有重複 id（兩份客戶端都用 `querySelectorAll('[id]')` 建 elements 表，重複會靜默蓋掉控制項）；新增的 `<input>`／`<select>` 必須登記在允許清單裡 |
| `tests/e2e/accessibility.spec.ts` | axe 掃描無 serious/critical |
| `pnpm check:perf` | 逐頁 gzip 傳輸量與請求數 |

`theme.spec.ts` 那條「三個主題必須不同」特別重要：先前 hero、公告帶、頁尾與環境
標籤的顏色是寫死的深綠，**對比檢查一直是過的**，所以沒有任何守衛發現三個主題
其實只覆蓋了一半頁面。驗「有沒有真的變」才抓得到那類缺陷。

## 6. 已知問題

- **待實機螢幕閱讀器確認**（已寫進
  [無障礙人工測試 runbook](../runbooks/manual-accessibility-test.md) §8-b）：手機版
  表格的 `td::before` 欄位名，在表格語意已由 ARIA role 維持的情況下對讀屏是重複
  的，可能唸成「時間 時間 08:30」。若確認干擾，改法是每格加 `aria-hidden` 的
  `<span>` 取代 `::before`，代價是每列多幾個節點。**這件事現在影響六張表，不再
  只有櫃台清單**，所以實機驗證的價值比先前高。
- ~~其他 `aria-live` 容器仍有同樣的問題~~ **已於 `2a4b944` 全站修好**：
  `#slots`、`#follow-up-list`、`#case-assignment-list`、`#workload`、
  `#account-list`、`#release-list`、`#task-list` 都不再是 live region，改由各自
  的 `.result-summary`（短句、`aria-live="polite"`）公告「N 筆」。MDN 的 live
  region 指引也是這個做法：用一句精簡的狀態訊息，不要把大塊動態區域整個標成
  live。`check:ui` 有一條守衛擋它回來。
- ~~患者頁仍有過多 14px 可見文字~~ **已於 2026-07-25 依語意重分級**：導覽、
  步驟名稱、表單標籤／提示／錯誤、日期篩選、互動文字與頁尾資訊提升到 16px；
  14px 只保留 eyebrow、代碼、徽標、chip、步驟編號與日期筆數等次要資訊。
- favicon 與 `og-booking.png` 還沒換成新標誌。
- 環境：C 槽剩餘空間不足 2 GB，`firebase hosting:channel:deploy` 會在部署**成功
  之後**以「There is not enough space on the disk.」回傳非零離開碼。用
  `firebase hosting:channel:list` 確認實際結果。

## 7. 負責人已拍板的品牌決策（2026-07-25）

- **不載入任何中文字型，字型預算永遠是 0 KiB。** 不得新增 Google／Adobe Fonts、
  思源黑體／宋體、任何 `.woff/.woff2/.ttf/.otf`，也不得為字型加 `preload` 或
  `preconnect`。理由是量級：思源宋體子集化後仍有數百 KiB，**遠大於整個患者頁目前
  的 59 KiB**——那不是「加一個字體」，是把頁面重量翻好幾倍。
  - 因此 `--font-serif` **永久指向 `--font-sans`**。沒有可用的中文系統襯線體時，
    不要用 CSS 去模擬襯線（合成粗體、`transform`）——那只會讓漢字字形變形。
  - 層次改由字級、字重、**字距**與留白承擔，見 §10。
- **香檳金＝Brand Decorative Accent。** 只代表品牌與質感，**永遠不代表**成功、
  警告、錯誤、資訊、選取、啟用、停用、焦點、待處理、優先級、可點擊或系統健康。
  狀態一律走既有的 semantic token。用量與允許位置見 §10。

## 9. 階段 6 的接手起點

### 階段 6：Motion System

`--motion-fast/base/slow` 與兩個 easing 在階段 1 就定義好了，目前只有少數
transition 用到。2026-07-25 的可讀性批次先把既有定位 flash 收回 motion token，
並補齊 reduced-motion 對 animation 的停用；完整的狀態轉場設計仍未開始。要點：

- `check:tokens` 已經禁止寫死動效時長，所以新增動效只能用 token。
- `prefers-reduced-motion` 區塊裡的 `0.01ms` 是**關閉動效**、不是調時長，是刻意
  的例外，別把它「修正」成 token。
- 動效的用途是**解釋狀態變化**（哪一列剛更新、面板從哪裡展開），不是裝飾。資料
  密集的工作臺尤其要克制：每列都會動的表格會讓掃描變慢。

## 8. 階段 4：情境式指揮中心（已完成）

先前的首頁是「功能目錄」：四張待辦卡永遠都在，數量為零也照顯示，於是「0 筆取消
待確認」和「3 筆取消待確認」佔一樣大的版面，畫面沒辦法告訴任何人現在該做什麼。

現在 `#overview` 的 `.command-grid` 分兩欄：左邊固定是「下一位」，右邊是依急迫性
排序的待辦。

### 三條原則（實作時請維持）

1. **數量為零的待辦不出現。** 不是變灰、不是顯示 0，是整張卡不產生。
2. **依急迫性排序，最急的放大**（`.task-lead` 跨滿整列）。急迫性＝「多久沒處理
   會造成傷害」，不是「哪個功能比較重要」：
   - 取消待確認——沒處理就一直佔著時段，別的患者訂不到，傷害每分鐘累積 → 最前
   - 回診尚未決定——患者離開前應知道下次何時回來，拖過今天就得再聯絡
   - 個管尚未指派——影響月度統計與後續追蹤，可以晚一點
   - 日曆投影待處理——只影響提醒事件，預約本身不受影響 → 最後
3. **一切正常時保持安靜**：只留一句「目前沒有待辦事項」，而不是四個綠色的零。

順序寫在 `OPERATIONAL_TASKS`（`modules/admin-view.js`），每一項都帶一句
`why`——**排序的理由必須出現在畫面上**，否則它只存在於程式碼裡，下一個人會以為
可以隨便調。

### 「下一位」

`renderNextUp(state)`：篩 `confirmed` 且 `startsAt` 還沒到的最早一筆。時間字串
自帶 +08:00 偏移，所以直接 `Date.parse` 毫秒比較就好（與 `isUpcomingSlot` 同一個
做法），不要自己拆時區。完成到診之後那一筆就不再是「下一位」——它已經不是
`confirmed` 了，這一點有 e2e 釘著。

資料全部來自既有的 `buildOperationalTasks(state)` 與 `state.appointments`，
**沒有新增任何 domain 邏輯**。

### 尚可再做的

- `.summary-grid` 那四張統計卡仍是等重展示（可預約時段／待處理預約／已完成到診／
  個管月度患者）。它們是「知道就好」的數字，不是待辦，所以這次沒動；若要繼續
  收斂首頁，那是下一個可以檢討的區塊。

## 10. 階段 5：品牌層（已完成）

### 字體：一個位元組都不下載

```css
--font-sans:
  'PingFang TC', 'Microsoft JhengHei', 'Noto Sans TC', system-ui,
  -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
--font-serif: var(--font-sans);
--font-mono:
  ui-monospace, SFMono-Regular, 'Cascadia Mono', 'Roboto Mono', Consolas,
  monospace;
```

**這一階段對「精品感」最有效的一步是補上 `PingFang TC`，而且成本是零。** 先前的
堆疊沒有它，於是 macOS／iOS 上整條鏈是 Noto Sans TC（多數人沒裝）→ Microsoft
JhengHei（Mac 上沒有）→ Inter（沒裝）→ `system-ui`，等於把 Apple 裝置上最好的
中文字體整個跳過去。清單裡的 `Noto Sans TC` 只是「本機剛好裝了就用」，不是下載
目標。

`:root` 先前把同一份堆疊又寫了一次（改一處另一處會默默不同步），已改成
`var(--font-sans)`。404 頁的 `error.css` 刻意不載入 `styles.css`，所以它必須各寫
一份——那份也同步補了 `PingFang TC`，改動時兩邊要一起改。

### 字距：新增 `--tracking-*` 五階

不下載字型，層次就只剩字級、字重、字距與留白，所以字距升格成正式尺度。起點是
**十種散落的字面值**（-0.06 / -0.035 / -0.02 / 0.025 / 0.03 / 0.06 / 0.075 /
0.08 / 0.11…），彼此沒有關係。

| Token | 值 | 用在哪 |
| --- | --- | --- |
| `--tracking-display` | -0.035em | h1、大數字（字級越大，字距越要收） |
| `--tracking-tight` | -0.02em | h2、次級大字 |
| `--tracking-wide` | 0.03em | 中文小標、週檢視表頭 |
| `--tracking-label` | 0.06em | 表頭、legend、筆數摘要 |
| `--tracking-eyebrow` | 0.1em | **全大寫拉丁**眉題 |

規則：字級越大字距越收；全大寫拉丁文字沒有小寫的高低差，必須放寬才讀得動；
**中文正文一律不加字距**——漢字是等寬方塊，加了只會讓詞與詞黏不起來。
`check:tokens` 已把字面值鎖成零（`inherit` 是刻意例外，排序按鈕要沿用表頭字距）。

### 香檳金：四個 token，語意分得很開

```css
--brand-metallic-text        /* 會被讀的金字，三種底上都要過 AA 4.5:1 */
--brand-metallic-on-inverse  /* 深綠底上的亮金 */
--brand-metallic-line        /* 純裝飾細線，不承載資訊 */
--brand-metallic-surface     /* 極淺金底，只給非狀態型療程標籤 */
```

三個主題各自覆寫（`:root` / `:root[data-theme='warm']` / `:root[data-theme='dark']`）。

**提案給的起點值實測後有三處不合格，已調整——這是這一階段最值得記住的部分：**

| 問題 | 實測 | 處置 |
| --- | --- | --- |
| `#826b45` 疊在金色 chip 上 | 4.36:1 ✗ | 壓深到 `#75603c`（最差 5.16:1） |
| 同一支金字放到深綠 hero | 2.47:1 ✗ | 深底需要的是**亮**金，另開 `--brand-metallic-on-inverse` |
| 亮金放到 hero 漸層**最亮那一段** | 2.99:1 ✗ | **hero 眉題的文字不做成金色**，維持 `--on-inverse-accent`；品牌感交給那條裝飾線 |

最後一項是刻意的取捨：眉題實際落在漸層最暗的一端，但那是版面決定的，
**不該把可讀性押在版面永遠不變上**。

`--brand-metallic-line` 在淺色／暖色底上只有約 2.5:1，**這是允許的**——WCAG
1.4.11 的 3:1 針對「理解內容所必需」的非文字元素，而這條線純裝飾、不承載任何
資訊，結構分隔仍由 `--line` 與留白負責。前提是它永遠不能變成唯一的分隔手段。

### 只出現在這些地方

| 位置 | 用什麼 |
| --- | --- |
| 標誌旁的英文小字（兩頁） | `--brand-metallic-text` |
| 品牌眉題 `.eyebrow-brand` 的短分隔線 | `--brand-metallic-line`（深底用 on-inverse） |
| 患者 hero 的品牌眉題文字 | `--brand-metallic-text`（淺底，5.29:1） |
| 患者 hero 右上角裝飾弧線 | `--brand-metallic-line` |
| 預約完成頁的品牌眉題 | 同上 |

實測結果：**工作臺只有兩個金色焦點**（標誌小字、hero 眉題的裝飾線），資料區、
按鈕、狀態、排序箭頭、選取方塊、目前分頁**完全沒有金色**。

`.eyebrow` 是全站所有區段標籤共用的（STEP 01、MY BOOKINGS、DAILY OVERVIEW、
CASE MANAGEMENT…）。**不能把 `.eyebrow` 整個改成金色**——那會讓金色變成「標籤
色」，也就開始承載語意。因此另開 `.eyebrow-brand` 修飾詞，全站只掛在三個真正
講品牌的眉題上。

⚠️ **`.eyebrow-brand` 必須寫在 `.eyebrow` 之後**：兩者權重相同（0,1,0），靠順序
決勝。放前面的話綠色會蓋掉金色，而且沒有任何錯誤訊息——實作時就踩到過兩次。

### 守衛

`check:tokens` 新增一條：**香檳金不得出現在承載狀態或互動語意的選擇器上**
（`:hover` / `:focus` / `:active` / `[aria-current` / `.is-active` / `.is-selected`
/ `status-chip` / `button` / `checkbox` / `sort-` / `badge`）。加這條的當下就用注入
測試確認它真的會紅。

forced-colors 下，兩個純裝飾的金色點綴（`.eyebrow-brand::after`、
`.patient-hero::after`）直接 `display: none`——它們不承載資訊，但留著會被系統
重畫成 `CanvasText` 的實線，反而多出幾條沒有意義的高對比線。

### 成本

CSS gzip **+0.25 KiB**（styles +0.23、error +0.02、workbench ±0）。
字型請求 **0**，字型傳輸量 **0 KiB**。

## 11. 2026-07-25 桌機可讀性與互動尺寸批次

### 權威基準與取捨

- 以 [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/) 為合規基準，特別核對
  1.4.3 對比、1.4.4 文字放大 200%、1.4.10 重排、2.4.11 焦點不被遮住與
  2.5.8 目標尺寸。WCAG 沒有規定正文必須是 16px；本次 16px 下限來自繁中桌機
  使用回饋與本系統既有 body scale，合規仍由縮放、重排、對比與焦點測試證明。
- 長說明依
  [U.S. Web Design System Typography](https://designsystem.digital.gov/components/typography/)
  的 45–90 字元、約 66 字元目標，限制為 `68ch`，並維持至少 1.5 的正文行高。
- 字級只使用既有 rem type scale，符合
  [GOV.UK Design System type scale](https://design-system.service.gov.uk/styles/type-scale/)
  對相對單位、固定尺度與一致垂直節奏的做法；沒有新增任何字型或外部請求。

### 實作界線

- 工作臺：導覽、全域回饋、session 選擇、待辦說明、篩選與結果摘要、批次選取、
  資料表與表頭、表單群組、週曆表頭／時間軸／圖例、通知與登入提示改為 16px。
  週曆事件、代碼、chip、圖示與日期中繼資訊保留 14px，避免時間軸失去掃描密度。
- 患者端：導覽、按鈕、步驟名稱、日期篩選、表單標籤／提示／錯誤、頁尾資訊改為
  16px；主要連結、select、input、返回鍵與時段按鈕採 44px 高度。
- 共用：資料表使用正文行高；主要說明限制 `68ch`；`prefers-reduced-motion`
  同時關閉 transition 與 animation。
- E2E 新增 `typography.spec.ts`，直接檢查兩端代表性文字的 computed font-size 與
  導覽／主題控制項的 44px 目標高度；原有 responsive suite 持續覆蓋
  1280／1025／1024／769／768／481／480／390／320px。

### 驗證結果

- `corepack pnpm verify`：通過；36 個測試檔、389 項單元測試全數通過，並包含格式、
  lint、TypeScript、文件連結、secret、domain sync、design token 與效能預算。
- `corepack pnpm test:e2e`：67/67 通過；包含新增字級守衛、320px／200% 文字重排、
  axe、三主題對比、效能、角色邊界與完整預約生命週期。

## 11. 階段 6：Motion System（已完成）

### 風格：productive，不是 expressive

採 IBM Carbon 的 **productive** 分類——快、克制、**不 overshoot、不回彈**。
Material 3 在 2025 年把預設改成帶彈性的 expressive scheme，這個專案刻意不跟：
櫃台整天在掃描資料表，任何彈跳都會拖慢視線。

> **動效只用來解釋狀態變化，不做裝飾。** 範圍限定在「狀態解釋」，不做頁面或
> 分頁轉場——hash 路由每次切換都動，長期使用會變成干擾。

### 時長分三檔，依「要重新定位多少視線」

| Token | 值 | 類別 | 用在哪 |
| --- | --- | --- | --- |
| `--motion-fast` | 140ms | **效果**（顏色／透明度，不移動） | hover、focus、狀態色切換 |
| `--motion-base` | 200ms | **空間**（移動或展開） | 彈窗進場 |
| `--motion-slow` | 280ms | 大範圍 | 整區換掉 |
| `--motion-attention` | 1600ms | 提示 | 「這一列剛剛變了」 |

「效果 vs 空間」的分法出自 Material 3——把顏色動畫拉到跟位移一樣長只會讓介面
感覺鈍。緩動只有 `--ease-standard` 與 `--ease-decelerate` 兩條。

### 實作的三個時刻

1. **列變更提示**（`.appointment-row.is-flash`）——從週檢視點事件或處置完成後
   捲到某一筆時，讓人知道「剛才動的是哪一列」。
2. **確認彈窗進場**——淡入＋4px 上移。退場刻意不做動畫：`<dialog>` close 後即
   移出流程，硬做退場得延遲關閉，連續操作會變鈍。
3. **狀態列變色**——它的文字是**就地換掉**的，沒有位置線索，顏色漸變是唯一的
   「剛剛更新了」提示。

### 修好的兩個既有缺陷

- **列變更提示自階段 3 起就是壞的**：CSS 選擇器停在 `.appointment-card`，但表格
  化之後列的 class 是 `.appointment-row`（`appointment-card` 只剩 data 屬性名），
  於是動畫再也沒播過，而且不會報錯。原本動的 `box-shadow` 在 `<tr>` 上多數瀏覽器
  也不繪製，改成動背景色。
- **三處寫死的 `ease` 關鍵字**已換成 token。

### reduced-motion：關掉動效，但不能關掉資訊

全域規則把動畫壓成 `0.01ms`，但那只是「跑得極快」，動畫**仍在跑**——列會停在
keyframe 0%（透明），等於提示消失。所以列變更提示在 reduced-motion 下改成
`animation: none` ＋ **靜態底色**：不會動，但「是這一列」仍然看得見。

`check:tokens` 已禁止寫死時長與寫死緩動；`theme.spec.ts` 分別在
`no-preference` 與 `reduce` 兩種環境下驗這兩條路徑。

> 測試上的坑，寫給下一個人：`test.use({ reducedMotion })` 在這個設定檔下**沒有
> 生效**（頁面裡量到的 `matchMedia` 仍是 false），要用
> `page.emulateMedia({ reducedMotion })`。另外加上 class 後要等一次樣式重算再讀
> `backgroundColor`，同一個 tick 裡讀會拿到還沒套用的值。

## 12. 2026-07-25 可用性修正批次

使用者實測回報的四個問題，成因各不相同：

| 症狀 | 根因 |
| --- | --- |
| 「清除選取」看不出是按鈕 | `.text-button` 是 `transparent` ＋ `padding: 0`，與靜態文字沒有形狀差異 |
| 「前往處理清單」同上 | `.summary-action` 的樣式被寫成 `.summary-card .summary-action`，「下一位」面板裡那顆吃不到 |
| 週曆字被切 | 78px/小時 → 事件方塊 36px，但兩行內容實測需要 46px |
| 兩容器黏在一起 | 相鄰元素各自只宣告單邊 margin |
| 選取框太小 | 全站沒有 checkbox 樣式（瀏覽器預設 ~13px），且被 `input, select` 的文字框規則套上 44px 最小高度，拉成 20×44 長條 |
| 患者頁按鈕肥大 | `.service-choice` 的 `min-height: 13rem`，但內容只有約 130px |
| 登入頁單調 | 純色畫布上一張白卡，沒有任何品牌訊號 |

修正原則：
- 互動元素一律要有**形狀**（邊框／底色／底線），不能只靠顏色（NN/g）。
- 元件樣式跟著 **class** 走，不跟著它剛好被放在哪個容器裡走。
- checkbox **不自製外觀**——批次選取靠原生 `indeterminate`（mixed），自製會弄丟
  它。改用 `accent-color` 換品牌色，並用外層 `<label>` 把可點區撐到 44px。
- 週檢視只顯示**有門診的日子**（`isClosed` 對 `extra_open` 回傳 false，所以加開
  的日子仍會出現）；但只要那天有預約就一定顯示——資料不能因為設定改了就消失。

新增 `tests/e2e/affordance.spec.ts`：驗**算出來的樣子**而不是「有沒有寫某條規則」
——上表第二種成因（選擇器沒選到）只有這樣才抓得到。它當場又抓到兩個沒人回報的
（頁尾連結被拿掉底線、通知鈴鐺全透明無邊框）。

## 13. 2026-07-25 第二批可用性修正

### 回診的完整生命週期（**行為變更**）

待安排回診那一列先前只有「調整回診」＋選單裡一個「刪除紀錄」。這是錯的：刪除會
清掉整筆已完成的看診事實、只留稽核，拿它表達「不用回診了」等於把病歷弄丟。

現在是三個直接動作，對應櫃台真正會做的三件事：

| 動作 | 做什麼 |
| --- | --- |
| **確認回診** | 把建立預約表單預先填好（患者、掛號別＝回診、目標日），送出後走既有 `/bookings`。domain 自動連回來源（`scheduledAppointmentId`）、移除「尚待安排」的提醒 |
| **調整回診** | 醫師改了指示 → 放回逐筆登錄再改一次 |
| **取消回診** | 走 `not_required` → **日曆上的回診提醒一併移除**，到診紀錄留著 |

**回診可以發生很多次**：確認回診產生的新預約完成到診後會再登錄一次回診指示，
如此循環。這一點 domain 本來就支援，缺的只是 UI 入口。

**同批修掉的資料可見性問題**：「已完成到診＋不需要回診」先前**整筆從清單移除**
（理由是「後續無動作」），代價是一次真實發生過的看診從畫面上徹底消失——連切到
「全部狀態」都找不回來，管理者也就無法再刪除誤建的紀錄。現在它留在清單上顯示為
「已完成到診」；日常畫面不受影響，因為預設的「當日」「待處理」篩選本來就不列出
已完成的預約。

### 只有一個選項就不要做成下拉

`actionMenu` 現在在只剩一個項目時直接攤平成按鈕。把唯一的動作藏在「更多處置」
後面，多一次點擊卻沒有換到任何整理效果，使用者也看不出裡面有什麼。

### 處置欄不換行

先前 `flex-wrap: wrap` 讓「到診／修改備註」留在第一行、「更多處置」掉到第二行，
整列被撐高又對不齊。改成 `width: 1%` + `nowrap`（表格慣用寫法）：這一欄縮到剛好
容納內容，多餘寬度還給真正需要空間的資料欄。

### 通知鈴鐺改線稿

先前是 emoji `🔔`——彩色字符，顏色由字型決定（多數平台是黃色），既不隨主題變也
和墨綠色系打架。改成 inline SVG 走 `currentColor`。

### 營業時間：把動線寫在畫面上

發布鍵先前在最上面、差異比較在最下面。**把動作和它影響的東西分開放，使用者按下去
之前看不到會發生什麼**（Drupal 的草稿／發布 UX 討論記錄過同一個問題）。現在是
① 編輯草稿 → ② 比較差異 → ③ 發布，發布鍵就放在比較的正下方；草稿面板用虛線框與
「發布後才會生效」和已發布區分。

### 員工權限頁的大片空白

`.governance-grid` 是兩欄格線，而清單摘要被當成第三個子元素 → 表格被擠到第二列
第一欄，右邊整片空白。摘要與清單包進同一個容器即可。**這是先前修 aria-live 時
自己種下的**——新增元素進格線容器前要先確認它會變成第幾格。

### 選取框與按鈕尺寸

- 全站沒有任何 checkbox 樣式（瀏覽器預設 ~13px），而且被 `input, select` 的文字框
  規則套上 44px 最小高度 → 拉成 20×44 長條。排除 checkbox/radio，用
  `accent-color` 換品牌色（**不自製外觀**，否則會弄丟批次選取仰賴的原生
  `indeterminate`），外層 `<label>` 把可點區撐到 44px。
- 患者頁 `.service-choice` 的 `min-height: 13rem`，但內容只有約 130px。

## 14. 2026-07-26 行動版格線與患者表單複查

最新實機截圖確認，上一輪「不溢出」只是最低線，資訊仍可能在沒有整頁捲軸的情況下
被壓縮、留洞或無謂堆高。本輪把手機資訊密度固定成以下元件規則：

- 通知面板在 ≤48rem 不再對齊鈴鐺，而是固定於 viewport 左右安全內距；保持非
  modal，開啟聚焦關閉鍵，Esc／點外／焦點離開皆可收合。
- 預約篩選為「搜尋全寬 → 狀態／掛號別兩欄 → 結果／清除同列」。
- 預約卡處置為「主要動作全寬 → 兩個次要動作兩欄」；手機必須取消桌機處置欄的
  `inline-size: 1%`，否則格線仍會被壓成圖示寬。
- 批次取消／未到／清除選取固定在同一個三欄動作群組；文字可在各按鈕內換行，但
  三個控制項不得掉成上下兩列，且高度不得低於 44px。
- 排班表單的開始／結束時間使用同一列兩欄，兩個原生 time input 等寬滿版。
- 患者姓名、電話、生日與身分證使用同一個單欄格線；欄名與紅色 `*` 包在同一個
  `.field-label`，四個 input 全寬。星號仍在 `<label>` 內，且表單頂端先解釋含義；
  HTML `required` 承擔程式可判定的必填狀態。

依據是
[WCAG 2.2 Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)、
[Focus Not Obscured](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html)、
[W3C WAI 表單標籤](https://www.w3.org/WAI/tutorials/forms/labels/)、
[H90 必填欄位技術](https://www.w3.org/WAI/WCAG22/Techniques/html/H90.html)與
[USWDS 表單必填欄位指引](https://designsystem.digital.gov/components/form/)。
WCAG 2.5.8 的 AA 下限仍是 24×24 CSS px；44px 是本專案為高頻觸控操作採用的較嚴
慣例，不把它錯稱為 WCAG AA 要求。

`tests/e2e/mobile-layout.spec.ts` 以 375×812 與 320×568 的真實 computed layout
量測上述規則，並逐一切換六個工作區與患者預約前三步檢查整頁 reflow。

## 相關文件

- [Roadmap](../roadmap.md) — 專案整體狀態
- [Web 品質閘門](../architecture/web-quality-gates-2026-07-24.md) — 預算、SBOM、
  設計 token 檢查與品牌資產產生流程
- [無障礙人工測試 runbook](../runbooks/manual-accessibility-test.md)

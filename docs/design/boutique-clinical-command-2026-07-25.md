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

兩個頁面**刻意不統一密度**。工作臺資料維持 14px、患者頁正文提升到 16px。看到
兩邊字級不同不是漏改，那是方向本身。

## 2. 實施順序（負責人指定）

順序經負責人調整過，理由是**先處理影響效率的問題，再處理品牌感**，而且每一階段
都能獨立驗收與回滾，不把視覺、效能與互動問題混在一起。

| 階段 | 內容 | 狀態 |
| --- | --- | --- |
| 1 | Design Tokens 2.0（CSS） | **完成** `bc975be` |
| 2 | 瑞士資訊骨架（Grid／Spacing／Type Scale） | **完成** `68fa08b` |
| 3 | 工作臺卡片重構為資料表格 | **表格轉換完成**；排序與批次操作未做（見 §4） |
| 4 | 首頁改為情境式指揮中心（資訊架構重構） | **未開始**（已完成前期調查，見 §8）**←下一位從這裡開始** |
| 5 | 品牌層（配色、香檳金、子集化中文字體） | 未開始 |
| 6 | Motion System 與互動細節 | 未開始 |

品牌資產（診所標誌、健保署署徽）已先行置入：`a36274e`。無障礙與效能的修正：
`01bb7dd`、`d4fe827`。

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

### 階段 3 還缺的功能（原提案有列，仍未做）

- 欄位排序（做的話請用 `aria-sort`，值只有 `ascending`／`descending`／`none`，
  且**同一時間只有一欄**帶非 none 的值）
- 批次選取與批次操作
- 展開細節列（目前只有改期／備註表單會展開）

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
| `tests/e2e/workbench-lifecycle.spec.ts` | 表格欄位對齊、表頭正確、ARIA role 齊全、手機堆疊仍帶欄位名；六張表都有 caption 與完整 role；已發布排班沒有操作欄；個管指派的跨格 `form` 關聯送得出去；**每個工作區在 375px 都不得有水平捲軸**；忙碌狀態不設 `aria-busy`；結果清單不是 live region |
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
- **其他 `aria-live` 容器仍有同樣的問題，而且階段 3 之後更嚴重**：
  `#task-list`、`#slots`、`#follow-up-list`、`#workload`、`#case-assignment-list`、
  `#account-list`、`#release-list` 都是整批置換內容的 live region，會被逐項重唸。
  `#appointments` 已修，因為它本來就有一個簡短的筆數摘要可以接手公告；其餘
  **沒有對應的摘要元素**，直接拿掉 aria-live 會讓「內容變了」這件事完全沒有
  公告。正確做法是先給每個清單一個簡短摘要，再把 aria-live 移過去。

  **這是目前最值得先處理的無障礙缺陷**：其中三個容器（`#workload`、
  `#case-assignment-list`、`#account-list`）現在裝的是**整張表格**，重唸一次的
  長度比原本的卡片更長。轉表格沒有製造這個問題（aria-live 本來就在），但把它
  放大了。
- 患者頁仍有 50% 的可見文字在 14px（原本 69%）。剩下的多數是導覽、eyebrow、
  chip、步驟編號，該小；但值得再看一輪。
- favicon 與 `og-booking.png` 還沒換成新標誌。
- 環境：C 槽剩餘空間不足 2 GB，`firebase hosting:channel:deploy` 會在部署**成功
  之後**以「There is not enough space on the disk.」回傳非零離開碼。用
  `firebase hosting:channel:list` 確認實際結果。

## 7. 需要負責人決定的事

- **要不要載入中文字體。** 階段 5 的宋體標題需要它，會撞到 0 KiB 字型預算，
  必須先做子集化並正式調整預算。
- 香檳金的用量。原提案的規則是：只放 Logo 細節、品牌分隔線、少量圖示與高級療程
  標籤，**不可拿來表示狀態，也不要大量用於按鈕**。

## 8. 階段 4 的前期調查（尚未動工）

方向已確認但**沒有寫任何程式**。以下是給接手者的起點：

### 業界共識

2026 年營運 dashboard 的設計共識是「**每一個畫面對齊一個具體的營運決策**」，
依急迫性組織，而不是把功能模組平均展示。

### 現況的問題（已實際讀過程式）

首頁目前是 `#overview` 裡的兩塊：

1. `.summary-grid` — 四張等重的 `summary-card`（可預約時段／待處理預約／
   已完成到診／個管月度患者），數字由 `renderSummary()` 填。
2. `#task-list` — `renderTasks(state)` 產生四張固定的 task card（取消待確認／
   回診尚未決定／個管尚未指派／日曆投影待處理）。

**四張待辦卡永遠都在，數量為零也照顯示。** 於是「0 筆取消待確認」和「3 筆取消
待確認」佔一樣大的版面，畫面沒辦法告訴任何人現在該做什麼——這就是「功能目錄」
而非「工作臺」。

### 建議的最小可行改法

資料都已經有了，不需要新的 domain 邏輯：

- 任務計數來源是 `buildOperationalTasks(state)`（`modules/case-management.js`），
  已回傳四種待辦的清單／數量。
- 「下一位」可由 `state.appointments` 篩 `confirmed` 且 `startsAt` 在現在之後，
  取最早一筆；時間比較可沿用 `isUpcomingSlot` 的做法（`Date.parse` 毫秒比較，
  時間字串自帶 +08:00 偏移）。

三個原則：

1. **數量為零的待辦不出現。**
2. **依急迫性排序，最急的放大。** 急迫性＝「多久沒處理會造成傷害」：取消待確認
   會卡住一個時段（別的患者訂不到），排最前；日曆同步只影響提醒，排最後。
3. **一切正常時保持安靜**，而不是顯示四個綠色的零。

另外建議新增「下一位」——那是櫃台最常問的問題，目前首頁完全沒有。

**注意**：`#task-list` 目前是 `aria-live="polite"`，見 §6 的 live region 問題；
改這一區時一併處理，讓摘要負責公告。

## 相關文件

- [Roadmap](../roadmap.md) — 專案整體狀態
- [Web 品質閘門](../architecture/web-quality-gates-2026-07-24.md) — 預算、SBOM、
  設計 token 檢查與品牌資產產生流程
- [無障礙人工測試 runbook](../runbooks/manual-accessibility-test.md)

# 2026 網頁規範稽核與修復 — 2026-07-26

## 這份文件是什麼

2026-07-26 對前後端做了一次 2026 網頁規範稽核，找到 19 項問題，全部修復完成。

這份文件最初是**計畫書**：每張任務卡帶著檔案位置、實測證據、目標狀態與驗收指令，
好讓另一位開發者可以單獨接手一張卡。所有卡片完成之後，逐張的實作細節已經沒有讀者
——它們現在活在程式碼的註解、測試，以及每一次 commit 的訊息裡。因此本文改為**結果
紀錄**：留下發現了什麼、決定了什麼、代價是什麼，以及還沒解決的是什麼。

要看某一項的完整推理，`git log` 找對應的 commit；訊息刻意寫得完整。

這仍然是合成資料的測試平台，不是正式醫療資訊系統。本輪**未解除任何 Phase 1
決策閘門**。

## 稽核當時已經通過的部分

這些先寫，因為 19 條 finding 很容易被誤讀成「這個專案很糟」。實際不是：

- axe 在 WCAG 2.0／2.1／2.2 的 A 與 AA 加上 best-practice 全開下，患者頁
  （375×812）與工作臺（1280×720、375×812）皆為 **0 violations**。
- `escapeHtml` 覆蓋完整，29 處 `innerHTML` 的每一個插值都逸出過。
- CSP 嚴格（無 `unsafe-inline`／`unsafe-eval`），`<dialog>` 用原生 `showModal()`。
- Firestore 交易的 read-before-write、冪等重播、患者預約守衛設計正確。

## 兩項決策（記錄於決策登記簿）

| ID | 問題 | 結果 |
| --- | --- | --- |
| X1 | 是否改為 per-entry bundling？ | **否決**。`dist` 必須與 `public` 逐檔對應，出貨程式碼才能被讀、被對照檢查。 |
| X2 | 預約頁的對外網址？ | **`/booking`**。`canonical` 早就這樣宣告，但沒有 rewrite，實際會 404。 |

X1 的否決有一個必須寫下來的後果：**`modulepreload` 因此是永久解法而非過渡手段**，
所以守住模組往返深度的閘門（D2）從選配升為必要。

正式網域是否為 `beauessence.com.tw` **仍未定案**，上線前要由診所確認。

## 修復內容

| 項目 | 結果 |
| --- | --- |
| A1 | 建置注入 `modulepreload`：模組往返 **5 趟 → 1 趟**（實測 25／27 支 JS 同時開始下載） |
| A2 | vendor barrel 拆成深層 import：vendor 請求 **14 → 7** |
| A3 | 修正 `build-web.mjs` 裡「CSP 要求不能 bundling」這個不成立的理由 |
| B1 | 兩個進入點加 `<noscript>`；患者頁在 JS 失效時仍給得出電話、地址與門診時間 |
| B2 | HTML `no-store` → `no-cache`：不再放棄 bfcache（實測上一頁 19,983 bytes → 0） |
| B3 | 預約頁改由 `/booking` 提供（rewrite + 301），對外網址與 canonical 一致 |
| C1 | 補 COOP／CORP |
| C2 | CSP 導入 Trusted Types，逸出從紀律變成瀏覽器強制 |
| C3 | Permissions-Policy 兩份設定對齊，並退出 Privacy Sandbox |
| C4 | 本地 server 提供 `.json`；`asset-manifest.json` 不再出貨 |
| D1 | a11y 閘門補上 WCAG 2.2（`target-size` 自此真的會執行） |
| D2 | 效能預算納入模組圖往返深度與 preload 完整性 |
| E1 | outbox 領取改為依到期時間排序：佇列不再有排隊死角 |
| E2 | 租約與結算改用各自的時刻，不再整批共用凍結的 `now` |
| E3 | 時間戳只接受規範定義的 ISO-8601（`"Jul 25 2026 Z"` 不再通過） |
| E4 | rate limiter 回收過期視窗，且每個視窗最多清掃一次 |
| E5 | 429／503 帶 `Retry-After` |
| E6 | api-client 逾時改用 `AbortSignal`，真的取消請求；重試加退避與抖動 |
| F1 | `uuid` 鎖到已修補版本；其餘三筆 CLI-only advisory 記錄在案；Actions 釘 commit SHA |
| G1 | 移除週檢視內層那條無用的垂直捲軸 |
| G2 | 手機版週檢視改為行程表：**橫向捲動完全消失**（832px 內容塞進 331px 容器 → 不再需要） |

## 手機版版面修復（同日稍晚）

規範修復完成後，業主回報手機版仍有嚴重問題。實機逐項排查（375×812、320×568，
兩個頁面、六個工作區、完整預約流程）找到五項：

| 嚴重度 | 問題 | 修法 |
| --- | --- | --- |
| 🔴 | **預約清單把頁面推出水平捲軸**：375px 溢出 52px，展開「更多處置」112px，320px 107px | `.appointment-table .appointment-controls` 在手機斷點沒有收回桌機的 `flex-wrap: nowrap`；改為換行 |
| 🔴 | **患者姓名被排成直書**：同格的「電話 · 生日 · 身分證」把姓名擠到 27px，中文逐字換行 | 堆疊表格的儲存格改為可換行，姓名 `white-space: nowrap` |
| 🟡 | **患者頁首佔掉首屏 80%**：頁首 260px，第一個問題在 651px 處 | 品牌副標與健保標章縮小、環境徽章併列；頁首 260 → 201px，內容起點 651 → 592px |
| 🟡 | **導覽 7 項有 4 項在畫面外**，無捲動提示、最後一項切在半個字上 | 右緣淡出遮罩 + `scroll-snap-type: x proximity` |
| 🟢 | 處置選單按鈕 41.6px，低於全站 44px 慣例 | 對齊 2.75rem |

**為什麼既有測試全部沒抓到**：`responsive.spec.ts` 只量登入後的預設分頁；
`workbench-lifecycle.spec.ts` 的水平捲軸測試雖然逐一切過工作區，但清單裡**沒有
`#appointments-section`**，而且在**沒有任何預約資料**的狀態下執行。「有資料的預約
清單 × 手機寬度」這個組合——也就是櫃台每天實際看的畫面——從來沒被檢查過。

`tests/e2e/mobile-layout.spec.ts` 補上這個組合，8 項。以修復前的 CSS 回跑，**7 項
失敗**，確認它們是真的迴歸守門員而不是恆真斷言。

一項自我修正：報告初稿說 41.6px 的按鈕「低於 44px 標準」。查證後
**WCAG 2.2 SC 2.5.8（AA）要求的是 24×24**；44×44 是 SC 2.5.5（AAA）與本專案自訂的
較嚴標準。那些按鈕**沒有違反 WCAG**，只是不符合自家慣例——仍然值得對齊，但不該
被說成無障礙缺陷。

## 截圖複查與表單修復（同日第三輪）

第二批實機截圖指出的不是單一元件美化，而是五種可重複出現的格線／定位缺陷；逐一
追到 CSS 根因後，也多找出兩項截圖沒有直接標出的問題：

| 畫面 | 根因 | 修正與回歸守衛 |
| --- | --- | --- |
| 手機通知左側被截、標題不見 | 面板以 `right: 0` 對齊靠右鈴鐺，面板寬度大於鈴鐺右側可用空間 | ≤48rem 改為固定在 viewport 安全內距；補 `role="dialog"`、開啟聚焦關閉鍵、Esc／點外／焦點離開收合 |
| 預約篩選第三欄右側留白 | 「最後一個奇數子項目」選擇器失效：結果／清除列是第四個子項目 | 搜尋全寬，狀態與掛號別並排，結果與清除維持同列 |
| 卡片處置全部逐列堆疊 | 手機仍繼承全域 `flex-basis: 10rem`；**另發現處置儲存格仍繼承桌機 `inline-size: 1%`** | 手機取消 1% 欄寬；主要動作全寬，兩個次要動作並排 |
| 批次操作呈兩列且清除按鈕落單 | `flex-wrap` 依文字固有寬度換行，沒有工具列格線 | 三個動作使用等寬三欄，375px 同列且每項維持 44px 高 |
| 每週起訖欄位只佔左半 | `.inline-fields` 只定義於建立預約表單，排班表單沒有佈局規則 | 排班起訖使用兩欄格線，原生 time input `min-width: 0; width: 100%` |
| 患者必填星號各自換行 | `label` 是 grid；文字節點、星號與 input 被當成三個格項 | 欄名與星號包成 `.field-label`；紅色星號仍配合表單頂端文字說明與原生 `required` |
| 患者生日欄位比其他欄短 | 原生 `date` input 保留 intrinsic width | 四個病患資料 input 全部跟隨 label 滿寬；375px 幾何量測同寬 |

採用的權威基線：

- [WCAG 2.2 Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)：
  320 CSS px 不得因二維捲動造成資訊或功能損失。
- [WCAG 2.2 Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)：
  AA 最低 24×24 CSS px；本專案對主要控制項繼續採更嚴的 44px 慣例。
- [WCAG 2.2 Focus Not Obscured (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html)：
  浮層不得完全遮住鍵盤焦點；非 modal 通知在焦點離開時收合。
- [W3C WAI 表單標籤](https://www.w3.org/WAI/tutorials/forms/labels/)與
  [H90 必填欄位技術](https://www.w3.org/WAI/WCAG22/Techniques/html/H90.html)：
  可見標籤需與控制項保持清楚關係，必填符號必須在 label 內，並在首次使用前說明。
- [USWDS Form](https://designsystem.digital.gov/components/form/)：
  必填欄使用紅色星號、表單頂端文字解釋與 HTML `required` 三層訊號；不得只靠顏色。
- [USWDS Button Group](https://designsystem.digital.gov/components/button-group/)：
  相關動作應形成可辨識的群組；此處以等寬格線維持操作順序與觸控面積。

`mobile-layout.spec.ts` 從 8 項增為 12 項，直接量測 viewport 邊界、格線列位置、欄位
寬度與 44px 控制高度，不以「CSS 裡有某條規則」代替瀏覽器實際結果。

順帶做的三項清理：

- 四份互相矛盾的 E2E `login` helper 收斂成一份（其中一份在手機寬度必定逾時）。
- 門診時間的漂移改由 `check:ui` 擋下，不再只靠註解提醒。
- 本文件由計畫書改為結果紀錄。

## 驗收

```
corepack pnpm verify     → 通過（39 個測試檔、469 項；稽核前 36 檔、389 項）
corepack pnpm test:rules → 通過（61 項；稽核前 60 項）
corepack pnpm test:e2e   → 通過（94 項；截圖複查前 90 項、稽核前 73 項）
```

同日以新增的部署驗證器檢查現行 Hosting preview：

```text
URL       https://beauessence-clinic-staging--synthetic-review-gpt86j36.web.app/
commit    9690e4674ed1f196a844b9cbea4ed80b0268ade8
time      2026-07-26T08:48:08.330Z
result    395 / 395 checks passed
```

這份證據驗的是當時已部署的 UI commit，包括兩個 HTML 入口、synthetic-only
內容標記、安全標頭、同源內容雜湊資產與 immutable cache policy；它不是正式環境
證據，也不涵蓋本紀錄後來新增的文件／CI 腳本 commit。

## 代價與已知限制

這一節比上面的表格重要：它記的是「做了之後才知道的事」。

- **`nextAttemptAt` 成為 outbox 工作的必填欄位。** Firestore 的文件明確指出
  `orderBy()` 會過濾欄位是否存在，而不等式篩選隱含以該欄位排序。所以 E1 的查詢
  一旦上線，缺這個欄位的工作不是被排到後面，是**整個看不見**。三條建立路徑與
  `requeue` 都已補上；目前沒有雲端資料庫所以不需回填，但第一次部署前要確認。
- **索引檔無法在本機驗證。** `firestore.indexes.json` 已宣告 E1 需要的兩個複合
  索引，但**測試通過不代表索引正確**：Firestore Emulator 不強制複合索引——餵給它
  一份刻意寫壞的索引檔，它照樣啟動、測試照樣全綠。第一次雲端部署前必須人工複查。
- **Trusted Types 用的是 default policy，不是具名 policy。** 代價已實測確認：
  原始字串會被**檢查**，不會被**拒絕**。保證是「沒有任何字串能未經檢查寫進
  `innerHTML`」，不是「開發者被迫顯式宣告」。把 29 個 sink 改成顯式呼叫是獨立的
  後續工作（見下）。
- **這個 policy 不是消毒器。** CSP 禁止外部資源，引入 DOMPurify 是另一個決定。
  它做的是結構檢查：擋掉 script／iframe／object／embed、行內事件處理器與
  `javascript:` URL。
- **`/index.html` 的 document 預算 10 → 11 KiB。** A1 注入的 28 條 preload 讓
  document 的 gzip 量變成 10.4 KiB。這不是重複下載（已確認 budget checker 以
  `Set` 計算閉包），而是 preload 清單本身的成本：約 0.4 KiB 換掉 4 趟往返。
  **這是刻意放寬，不是為了讓紅燈變綠。**
- **三筆 moderate advisory 刻意不鎖**（`@opentelemetry/core`、`@hono/node-server`、
  `tar`）。它們只存在於 firebase-tools 這條 CLI 線上：不打包、不出貨、不處理外部
  輸入。硬鎖跨 major 的傳遞相依風險更高。解除條件記在 `pnpm-workspace.yaml`。
- **本機通過不等於遠端 CI 已驗證這次提交。** Repository 現在已有 `origin`；
  `verify.yml` 與 `codeql.yml` 仍要在本次提交 push 後確認成功，才能把遠端 gate
  算進本次證據。

## 後續工作

沒有阻擋項，以下都是可以獨立開卡的改善：

1. **把 Trusted Types 的 sink 改成顯式呼叫**——以具名 policy 取代 default policy，
   讓 29 處 `innerHTML` 各自經過明確的 `createHTML`。稽核面更清楚，但那是一次橫跨
   多行呼叫點的大改，機械改寫會弄壞語句邊界（已實測），值得單獨排。
2. **第一次雲端部署前**：人工複查兩個 Firestore 複合索引定義；確認 outbox 沒有
   缺 `nextAttemptAt` 的舊資料。
3. **確認正式網域**，然後把 `patient.html` 的 `canonical`／`og:url` 與 `noindex`
   一起處理。
4. Push 本次提交後確認 `verify.yml` 與 `codeql.yml` 成功；本機驗證不能取代遠端
   branch protection。

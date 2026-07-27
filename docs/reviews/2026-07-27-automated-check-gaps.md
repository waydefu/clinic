# 自動檢查的缺口盤點與修復 — 2026-07-27

**狀態：** 進行中（隨業主需求批次 1–5 一起做）
**起因：** 負責人指示「把自動檢查補齊；有檢查到問題就先寫進 md 再修掉」。

這份文件記錄的是**把關本身的缺口**，不是功能缺陷。判準只有一條：某件事若默默壞掉，
現有的 `verify` / `test:e2e` 會不會紅？答案是「不會」的，就是一個缺口。

每一項都照同一個順序處理：先寫進這裡（含發現方式與後果），再修，修完把「修法與
證據」補回同一列。

## 缺口清單

| 編號  | 缺口                                              | 後果                                       | 狀態     |
| ----- | ------------------------------------------------- | ------------------------------------------ | -------- |
| F-1   | 建置只壓 CSS 與 JS，**HTML 註解原封不動出貨**     | 作者註解變成每位訪客都要下載的位元組         | 已修     |
| F-2   | `check:tokens` 只掃三份樣式表，三份完全在範圍外   | 新樣式表可以隨便寫死色、斷點、字重而全綠     | 待修     |
| F-3   | `check:ui` 的患者控制項允許清單只掃 HTML 字面標記 | JS 注入的輸入欄位完全不受「新增欄位」把關     | 待修     |
| F-4   | 對外頁面清單在五處各抄一份                        | 新頁面只要漏登記其中一份，該類掃描就靜默略過 | 待修     |
| F-5   | `check:perf` 的預算調整沒有任何機器可讀的理由欄位 | 調高預算與「記錄理由」之間沒有強制關係       | 待修     |

## F-1　HTML 註解被原封不動送給每一位訪客

**發現方式：** 批次 2 加了幾段說明用的 HTML 註解之後，`check:perf` 報
`/patient.html: document 傳輸量 8.9 KiB 超過預算 8 KiB`。追下去發現
`scripts/build-web.mjs` 有 `minifyStylesheets()` 與 `minifyModules()`，**沒有**任何
處理 HTML 的步驟。

**為什麼會發生：** 2026-07-25 曾修過一次同一類問題——當時發現「建置把 CSS 註解原封
不動出貨」，於是替 CSS 與 JS 加上 esbuild 壓縮。HTML 那一份沒有一起處理，而且沒有
任何檢查會指出它。

**後果：** 這個專案的註解密度很高（那是刻意的：規則與理由寫在程式旁邊）。註解對
瀏覽器毫無用處，卻是每一次載入都要傳的位元組。更糟的是它製造了一個**錯誤的取捨**
——「想多寫一段說明就會撞到效能預算」，長期會讓人少寫註解或調高預算，兩個都是錯的
方向。

**修法：** `build-web.mjs` 在改寫 HTML 參照之前先移除註解（`stripHtmlComments`）。
只移除註解，不動空白與屬性引號——那些「壓縮」會讓產物難以比對，而收益遠小於風險。

**證據：** 五個進入點的 document 傳輸量（gzip，`check:perf --report` 實測）：

| 進入點        | 修前     | 修後    | 新預算 |
| ------------- | -------- | ------- | ------ |
| /404.html     | 0.8 KiB  | 0.7 KiB | 2 KiB  |
| /clinic.html  | 1.6 KiB  | 1.6 KiB | 3 KiB  |
| /index.html   | 11.2 KiB | 9.2 KiB | 10 KiB |
| /patient.html | 8.9 KiB  | 6.6 KiB | 7 KiB  |
| /privacy.html | 3.7 KiB  | 3.2 KiB | 4 KiB  |

`apps/web/src/build-web.test.ts` 新增兩項：產物不得含 `<!--`，且註解移除不得動到
`<!doctype>` 與 JSON-LD 內容。四個進入點的 document 預算同時**收緊**到實測值加餘裕
——省下來的空間不留給未來隨手加東西。

（/clinic.html 幾乎沒變，因為它的內容是由 `clinic-site.js` 產生的，HTML 本體只是
外殼。）

## F-2　`check:tokens` 只掃三份樣式表

**發現方式：** 批次 1 為診所官網加樣式時注意到 `clinic-booking.css` 有
`@media (max-width: 62rem)`——而 `check:tokens` 明明把斷點硬鎖在 64/48/30rem。
讀 `scripts/check-design-tokens.mjs` 的 `main()` 才發現它只讀
`styles.css`、`workbench.css`、`error.css` 三份。

**在範圍外的檔案：** `clinic-site.css`（28 KB）、`clinic-booking.css`、`privacy.css`。

**後果：** 這三份可以寫死顏色、字重、圓角、陰影、斷點、字體堆疊與動效時長，
`check:tokens` 一律綠。它報出來的「寫死色 0、斷點 0」因此是**只涵蓋一半的事實**，
比沒有檢查更容易誤導——實際上 `clinic-booking.css` 當下就有一個範圍外的斷點。

**修法：** 三份都納入，但**分級**：

- `privacy.css`：與 `error.css` 同級（自成一頁、不載入 styles.css），只檢查
  「有沒有用到自己沒定義的 token」。
- `clinic-booking.css`：與 styles.css 一起載入，因此走完整規則。修掉它唯一的違規
  ——斷點 62rem 改為 64rem。
- `clinic-site.css`：診所官網刻意是**另一套** `--clinic-*` token 系統（白／霧綠／
  深林），與工作臺的 token 無關。全套規則會產生數百筆噪音，因此只套用「未定義
  token」與「斷點」兩條，並在腳本裡具名記下理由與解除條件。

## F-3　JS 注入的患者輸入欄位不受允許清單管轄

**發現方式：** 批次 2 要加「如何得知診所訊息」的複選標籤時，發現
`check-web-ui.mjs` 的 `allowedPatientControls` 是用正規式掃 `patient.html` 的
`<input|select|textarea id="...">` 字面標記。由 `patient-app.js` 寫進 `innerHTML`
的輸入欄位，它一個都看不到。

**後果：** 「新增任何欄位都必須是刻意的決定」這條規則只對寫在 HTML 裡的欄位成立。
一段 `innerHTML` 就能繞過整個把關——而那正是這個專案畫清單的預設做法。

**修法：** 允許清單改為同時掃 `patient.html` 與 `patient-app.js` 注入的標記，並要求
注入的輸入必須帶 `data-request-tag` / `data-source-tag` 這類**具名的**繫結屬性；
出現任何未登記的繫結屬性就紅。同時擋下「JS 注入帶 `id` 的輸入」——一頁上兩組標籤
若各自給 id 會撞名，而兩份客戶端都用 `Object.fromEntries(querySelectorAll('[id]'))`
建 elements 表，撞名會靜默覆蓋掉控制項（2026-07-25 已經發生過一次）。

## F-4　對外頁面清單在五處各抄一份

**發現方式：** 介面規則書 §4.1 自己就寫著「對外頁面清單應收斂成單一
machine-readable inventory」，並註明「完成前，逐檔登記仍是必要的過渡程序」。
盤點時確認那五份抄本仍然各自獨立：`accessibility.spec.ts`、`affordance.spec.ts`
的 `CLINIC_ROUTES`、`responsive.spec.ts`、`performance-budget.json`、
`apps/web/server.mjs` 的 `PRETTY_PATHS`。

**後果：** 新增一個對外頁面時，漏掉其中一份不會有任何錯誤——那一類掃描只是**安靜地
不涵蓋新頁面**。這正是 2026-07-27 併站時 `/clinic` 漏掉 affordance 掃描的成因，
當時是靠人工複查發現的。

**修法：** 新增 `apps/web/public-pages.json` 作為單一來源（每頁：路徑、是否可收錄、
要跑哪幾組掃描），並新增 `check:pages` 比對它與上述抄本是否一致。抄本本身不強行
合併——e2e 與建置腳本各有各的載入方式——但**不一致會紅**。

## F-5　效能預算調整沒有機器可讀的理由

**發現方式：** F-1 追查時讀 `performance-budget.json`，發現它只有數字。
「預算調高必須留下理由與實測」寫在 `web-quality-gates` 文件的表格裡，靠人記得去補。

**後果：** 調高預算與記錄理由之間沒有任何強制關係。想讓 CI 變綠，改一個數字就好。

**修法：** 每個 budget 條目要求一個 `justification` 欄位（字串，說明這個數字是怎麼
來的），`check-performance-budget.mjs` 缺欄位就紅。這不能阻止有人隨手寫一句話，
但它讓「改數字」與「說明為什麼」變成同一個動作，且會出現在 code review 的 diff 裡。

## 這份文件沒有處理的

- **CodeQL 是否真的有結果**仍取決於私有 repo 的 Advanced Security 授權（D-010）。
  `codeql.yml` 存在，但本機無法確認雲端是否啟用。
- **分支保護**是否 required `Verification evidence` 需要 GitHub token 才驗得到
  （`pnpm check:branch-protection` 無 token 時回離開碼 2，不是 0）。屬 D-013。
- 人工驗收矩陣（實機、報讀器、forced-colors）本來就不是自動檢查能取代的，
  程序在 `docs/runbooks/manual-accessibility-test.md`。

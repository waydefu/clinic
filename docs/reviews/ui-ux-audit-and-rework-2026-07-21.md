# 逐頁 UI／UX 稽核與改版 — 2026-07-21

依 UI／UX／功能／SEO／效能五個面向，對工作臺與患者端各做一次量測式稽核，
再依 2026 企業級設計準則改版。所有數字皆為瀏覽器實測，非估計。

## 稽核發現與處置

### 字級失控（最嚴重）

| | 改版前 | 改版後 |
| --- | --- | --- |
| 不同字級數 | **17 種** | **6 種** |
| 低於 14px 的元素 | 工作臺約 140 個、患者端 43 個 | **0** |
| 最小字級 | 10.88px | 14px |

成因不是 `em` 巢狀相乘，而是 CSS 裡直接寫了 24 種任意 rem 值
（`0.68`、`0.72`、`0.77`、`0.83`…）；`0.78rem` 一種就出現 105 次。

改為單一比例 1.2（Minor third）、基準 16px 的 token 尺度。`--text-micro`
(14px) 是唯一低於基準的一階，也是刻意的下限：嚴格套用 1.2 往下會得到 13.3px，
低於可讀下限。小字區的階層改由字重與顏色承擔，而非再切更多尺寸。

### 色彩：對比合格，但 token 被繞過

**對比度實測零失敗。** 第一次量到 7 筆失敗是假陽性——hero 使用深綠漸層背景配
淺色字，而量測函式只讀 `background-color` 便一路往上找到白底。人工驗算 hero
實際為 **5.19:1**，通過 WCAG AA。此項無需修改。

真正的問題是 `:root` 有完整 token 卻被大量硬編碼色值繞過，其中包含前一輪加入的
`rgb(15 20 40 / …)`（藍灰）與 `var(--line, #d5d8e0)`（灰）——與本專案的綠調
palette 不同色系。已收回 token。

### 可選項沒有選取樣式（bug）

`service-choice.is-selected` 在 JS 中被設定，但 **CSS 從未定義**。患者選了
「止鼾」或「醫美」、「初診」或「回診」，畫面上看不出來。已補上，並與
`slot-chip` 統一為同一組可選項語彙：邊框粗細 + 底色 + 勾號 + `aria-pressed`，
不單靠顏色。

### 死樣式

前一輪改用 `slot-chip` 後，`.slot-card`、`.patient-slot-option` 等 15 條規則
已無任何 JS 會產生。已刪除。

### 載入瀑布

工作臺原本是三段串行：`index.html` → `admin-bootstrap.js` + 12 個模組 →
**99ms 才開始載入 `admin-shell.html`**，然後整個抽換 `document.body`。使用者在
此之前看到的是 19KB 的 v1 靜態骨架，接著畫面跳動。

已將 shell 併入 `index.html` 並刪除該檔：少一次往返、消除畫面跳動、少 19KB
死標記。`workbench.css` 由 99ms 提前到 39ms 並行載入。

**附帶效果**：先前的 CSP 事故（`connect-src` 缺 `'self'` 導致整頁掛掉）正是這個
`fetch` 造成的。移除 `fetch` 等於消除該類問題的成因。

### 按鈕語彙

初判「8 種樣式該併成 4 種」，複查後修正判斷：那是 **3 個元件類別**——動作
（4 個變體）、可選項（`slot-chip`／`service-choice`）、行內與選單
（`text-button`／`action-menu-list`）。硬併會傷語意，因此改為統一可選項的選取
表現並在此記錄分類，不強行合併。

## 新增功能

**行事曆匯出**（`modules/calendar-export.js`）：患者可下載 `.ics` 或開啟預填的
Google 日曆連結。這與階段 C 的 Google Calendar 投影是兩件事——那一邊寫的是
診所的日曆、需要 OAuth 與 worker；這裡只是把畫面上已有的資訊換一種格式交給
患者，沒有後端、沒有憑證、沒有外部請求。

內容刻意最小化：只放診所名稱、掛號別、時間與地址，**不放身分證、看診項目或
備註**——與日曆投影同一套原則，因為許多人的行事曆與家人共用。

實測：CRLF 行尾符合 RFC 5545、含 2 小時提醒、無任何 PII，且 `blob:` 下載在
本專案的嚴格 CSP（`default-src 'self'`）下確認可行。

**送出中的忙碌狀態**：按鈕改為「送出中…」並帶 `data-busy`。本機儲存於 60ms 內
完成因此難以觀察，但接上真實 API 後即為必要回饋。

## SEO

| 項目 | 改版前 | 改版後 |
| --- | --- | --- |
| Title | 含「（測試專用）」等過時字樣 | 已更新為「線上預約｜一森渼診所」 |
| Description | 工作臺仍寫「本機合成資料測試介面」 | 已更新 |
| OG / Twitter | **無** | 7 個 OG 標籤 + summary_large_image |
| JSON-LD | **無** | `MedicalClinic`，含地址、電話、門診時間、`ReserveAction` |
| canonical | 無 | 有 |
| theme-color | 無 | `#155c48` |

工作臺為內部工具，**刻意不提供 OG 與結構化資料**，並維持 `noindex`。

患者端目前仍為 `noindex`（測試版）。正式上線時需移除該行，並將 `og:url` 與
canonical 換成正式網域。JSON-LD 的 `openingHoursSpecification` 必須與
`modules/state-schema.js` 的 `defaultSchedule` 保持一致。

## 效能

**圖片最佳化與 lazy load 不適用**：整個網站沒有任何圖片，只有 248 bytes 的
favicon.svg。此處不編造建議。

已量測：無 render-blocking 第三方資源、無外部請求、行動版無水平溢出。

尚未處理、留待正式化：
- 12 個模組未打包，等同 12 次請求；正式版需要 bundler。
- `styles.css` 35KB 兩頁共用，患者端用不到工作臺樣式。
- 全站 `Cache-Control: no-store`。測試版正確，正式版需改為 hashed 檔名 +
  長期快取。
- `Noto Sans TC` 從未以 webfont 載入（`document.fonts` 為空），實際落到系統
  字型。需決定要載入或從字串移除。

## 檔案整理

`-v2` 後綴在 v1 刪除後已無意義，一併更名：

| 原名 | 新名 |
| --- | --- |
| `staging-store-v2.js` | `store.js` |
| `patient-app-v2.js` | `patient-app.js` |
| `admin-v2.css` | `workbench.css` |
| `scripts/check-test-only-ui-v2.mjs` | `scripts/check-web-ui.mjs` |
| `admin-shell.html` | （併入 `index.html`） |

`docs/reviews/` 內的歷史紀錄保留當時檔名，不追溯修改。

## 驗證

`corepack pnpm verify` 通過（77 個必要檔案、51 份文件、74 項測試）。
瀏覽器於桌面與 375px 各驗證一次：字級 6 種、無 14px 以下文字、無水平溢出、
觸控目標 44px、選取狀態可見、逐欄錯誤與焦點管理正常、`.ics` 內容正確。

## 來源

- [Time Picker UX: Best Practices, Patterns & Trends](https://www.eleken.co/blog-posts/time-picker-ux)
- [Accessible Typography Guide — WCAG 2.2 + Modular Type Scale](https://www.accessibility.build/guides/accessible-typography-wcag)
- [WCAG 2.2 Enterprise Web Accessibility Requirements](https://almcorp.com/blog/wcag-2-2-enterprise-web-accessibility-requirements-2026/)
- [Design Token Architecture 2026](https://timgraf.com/ui/design-token-architecture-2026-the-strategic-blueprint-for-scalable-design-systems/)

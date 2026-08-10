# 診所首頁重構與 SEO 交接紀錄（2026-08-10）

**狀態：** 已實作於合成預覽；不是正式發布核准。本輪只改 `/clinic` 首頁與共用
SEO shell，沒有啟用真實患者資料、正式索引或任何醫美療程。

## 1. 交付結果

首頁改為「鼻功能／打鼾／睡眠呼吸」的混合式導覽頁：

- Hero 以官網既有的止鼾插圖取代固定寬高的深綠圓球。舊圓球在手機欄寬與文字放大
  下會把自身絕對定位邊界推出 viewport；相關 renderer、CSS、動效 token 與 enhancement
  已一併移除，不留兩套首頁。
- 症狀導覽使用五個原生 `<button>`、`aria-pressed` 與 live status，將訪客帶到四項
  衛教頁。措辭固定為「可以先了解」，不把互動結果寫成診斷或療程適應性判定。
- 首頁只出現止鼾五合一、下鼻甲手術、鼻中隔手術、止鼾好眠牙套。首頁資料模型的
  gate 會拒絕醫美、微整、隆鼻、抽脂、玻尿酸、肉毒與雷射等詞進入 `HOME_*` 內容。
- 四步驟評估流程、兩位醫療團隊、門診／交通、FAQ 與預約 CTA 都保留，但首頁醫師
  卡使用功能性評估文案，不顯示來源履歷中的醫美頭銜。

## 2. 內容與圖片來源

本輪沒有新增未知來源素材。首頁沿用已經過 crop-loss gate 與人工複核的本地 WebP，
來源與雜湊見 [診所療程卡影像修復](2026-08-07-clinic-service-imagery.md)。每項服務在
`NASAL_SERVICES.sourceUrl` 保留正式來源頁，測試要求 HTTPS 且 host 必須是
`beauessence.com.tw`：

- [止鼾五合一](https://beauessence.com.tw/snoring-solution-five-in-one/)
- [下鼻甲手術](https://beauessence.com.tw/inferior-turbinate-surgery/)
- [鼻中隔手術](https://beauessence.com.tw/septoplasty/)
- [止鼾好眠牙套](https://beauessence.com.tw/snore-relief-sleep-mouthguard/)

線上 WordPress 官網其他醫美內容、追蹤碼、遠端字型、外部 script 與未經核准的成效
數字都沒有搬入專案。

## 3. 維護邊界

- `clinic-content.js` 是首頁文案、症狀、流程、醫師首頁摘要、FAQ 與四項服務來源的
  單一資料層；`clinic-site.js` 只建立語意 DOM 與綁定互動。
- renderer 不使用 HTML 字串注入，維持 Trusted Types／CSP 邊界。
- static JSON-LD 必須留在 `clinic.html`，因為目前 CSP 禁止 runtime 填入 inline
  script 內容；單元測試會解析它並與 `CLINIC` 的名稱、電話、地址與 `sameAs` 比對，
  避免兩份資料靜默漂移。
- 新首頁樣式只使用既有 `--clinic-*` token。舊 hero、orb、aurora、ticker selector 與
  JavaScript enhancement 已刪除，避免下一位維護者誤改一套不會被渲染的介面；
  token debt ratchet 也隨實測現況由間距字面值 11→9、間距 clamp 端點 16→13 下修。

## 4. SEO 現況與上線條件

已完成：

- 每個 clinic route 的 `<title>`、description、canonical、Open Graph 與 Twitter
  metadata 由 `setMeta()` 依路由更新。
- shell 提供 `MedicalClinic` JSON-LD，含名稱、電話、PostalAddress、門診時間與
  `sameAs`；測試負責防止它與資料模型漂移。
- 首頁只有一個描述主題的 H1，四項服務各有真實 HTML 文字與內部連結，重要資訊不只
  存在圖片像素裡。

仍刻意不做：

- `/clinic` 保持 `indexable: false`、HTML robots `noindex, nofollow` 與 Hosting
  `X-Robots-Tag`。原因是正式公開網域、絕對 canonical、發布責任與醫療內容核准尚未
  完成。
- Open Graph 在目前預覽由 JavaScript 補齊；部分社群 crawler 不執行 JavaScript。
  正式發布前必須在 build 階段產生絕對 canonical 與靜態 OG URL／image，再移除
  noindex。不可只翻 `indexable` 一個欄位。
- FAQ 沒有加 `FAQPage` structured data；它是一般首頁說明，不宣稱能取得 Google
  rich result。

## 5. 無障礙與響應式結果

- 320px、375px、1280px；Chromium 與 WebKit；一般字級與 200% 根字級均無水平
  overflow。門診卡的 grid 使用 `min(100%, 17rem)`，不再讓 17rem 在 200% 時變成
  超出螢幕的 544px 最小欄寬。
- 症狀選擇支援鍵盤、可辨識 pressed state 與 live result；CTA 仍是連結，沒有把連結
  偽裝成按鈕。
- 減少動態偏好仍停用進場動畫；圖片有固有寬高／比例與替代文字。
- 自動化不能取代真人報讀器、forced-colors 與實體 iPhone／Android 驗收；正式發布前
  仍須依 [人工無障礙 runbook](../runbooks/manual-accessibility-test.md) 留下證據。

## 6. 驗證與視覺基準

2026-08-10 本機證據：

- `pnpm verify`：structure、architecture、UI、pages、tokens、docs、types、lint、sync、
  performance 全數通過；60 個 test files、958 個 unit tests 通過。
- `clinic-site.spec.ts`：Chromium＋WebKit 共 34 個流程／語意／症狀互動測試通過。
- `responsive.spec.ts`：Chromium＋Pixel 7 device profile 共 88 個 320～1280px 檢查通過。
- `mobile-layout.spec.ts`：Chromium＋Pixel 7 device profile 共 56 個版面／可點面積檢查通過。
- `/clinic` 的 axe serious／critical 違規為 0；首頁字級門檻、200% reflow、短標籤與
  motion checks 通過。WebKit 也另以 320px／375px、一般與 200% 字級確認無 overflow。

現行畫面與完整驗證結果收在
[2026-08-10 UI 視覺基準](ui-visual-baseline-2026-08-10.md)。舊的 2026-08-07 基準
保留為歷史證據，不回寫或覆蓋。

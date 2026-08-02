# 官網動效與素材壓縮交付紀錄 — 2026-08-02

**狀態：** 交付紀錄（dated evidence）。分支 `agent/clinic-motion-and-social`。
**範圍：** `/clinic` 的首頁動效擴充、12 張官網素材壓縮，以及過程中發現的三個缺陷。

這份文件記的是**做了什麼、為什麼那樣取捨、什麼仍然沒做**。C2 的授權那一半沒有
因為壓縮完成而前進——那需要業主具名確認，不是這裡能解決的。

## 1. 首頁動效 14 → 24 種

參考 Stripe、Apple、Linear、Vercel、Framer、Nike 的做法，各取一個能在**沒有
WebGL、沒有動畫函式庫、20 KiB script 預算**下成立的版本。全部以 CSS
`transform`／`opacity` 為主，`prefers-reduced-motion` 下三個無限循環的效果直接
`animation: none`（不是用 0.01ms 播完一輪——那仍會閃一下），磁吸位移歸零。

兩個值得單獨記的取捨：

**流動網格漸層（效果 15）改動 `background-position`，是全檔唯一不走 transform／
opacity 的效果。** 原本用 `inset: -20%` 外擴再位移旋轉，視覺更飽滿，但
`responsive.spec.ts` 會逐一量每個元素的右邊界——那正是 WCAG 1.4.10 Reflow 在意的
事：版面不得被推寬。被 `overflow: hidden` 裁掉不算數，那道守衛擋的是「有東西伸
出去」，不是「捲軸有沒有出現」。改成 `inset: 0` 加動 `background-position`，代價
是那一層每幀重繪，可接受的理由寫在 CSS 註解裡（22 秒的環境動畫、減少動態時整個
關掉）。

**對角切邊只斜切裝飾底色帶，不斜切內容。** 斜切內容會讓文字基線歪掉、圖片被切出
斜角。

## 2. 逐字浮現差點造成的無障礙災難

效果 21（標題逐字浮現）原本把 `<h1>` 拆成一個字一個 `display: inline-block` 的
`span`。單元測試失敗訊息看起來只是找不到標題，真正的原因是：

**可及名稱的計算會在每個 `inline-block` 之間插入一個空白**，於是中文標題變成
「從 順 暢 呼 吸 開 始」——螢幕閱讀器會逐字唸出主標題。

那不是測試的怪癖，是真的聽不懂。修法是視覺層整段 `aria-hidden`，另外保留一份完整
文字給報讀器。**這件事看畫面永遠不會發現**，畫面上完全正常。

## 3. 官網素材：2210 KiB → 129 KiB

`scripts/build-clinic-assets.mjs` 沿用 `build-brand-assets.mjs` 的做法——Playwright
的 Chromium canvas 編 WebP，不引入 sharp（native binary、要為每個平台各拉一份預編譯
檔；多一個供應鏈相依只為了縮圖，代價不對稱）。原圖移到不出貨的
`apps/web/clinic-source/`，產物進版控。

| 類別 | 張數 | 來源 | 產物 | 目標尺寸的依據 |
| --- | --- | --- | --- | --- |
| 品牌圖標 | 1 | 107 KiB | 12.0 KiB | `.clinic-brand img` 最寬 200px，取 2 倍 |
| 照護底圖 | 1 | 415 KiB | 2.8 KiB | 上面壓著 90–92% 不透明色塊，幾乎看不見 |
| 醫師照 | 2 | 1020 KiB | 47.4 KiB | 卡片約 416px，取 1.83 倍（2 倍會超過原圖寬度） |
| 療程圖 | 4 | 642 KiB | 52.8 KiB | 卡片約 268px，取 2 倍 |
| 照護圖示 | 4 | 25 KiB | 14.2 KiB | 圖示 65.6px，取 2 倍 |

`service-snoring` 的來源只有 1024×281，裁成 4:3 後最寬只能到 375px（1.4 倍），
沒有放大——放大只會讓檔案變大而畫面不會更清楚。

每一張的來源檔、尺寸、位元組數與 SHA-256 記在 `apps/web/clinic-assets.manifest.json`。

## 4. `check:perf` 的盲點：JS 字串常數指到的圖是隱形的

**發現方式：** 壓縮前跑 `check:perf --report`，`/clinic.html` 顯示 image 2 個
522 KiB，全綠。但同一頁實際會下載 12 張共 2210 KiB。

**為什麼會發生：** 預算的傳遞閉包只追 HTML 的 `src`／`href`、CSS 的 `url()` 與 JS 的
**相對匯入**。12 張裡有 9 張只被 JS 用字串常數指到（`image: '/clinic-assets/…'`），
那種參照走不到閉包裡。

**後果：** 1.7 MB 的下載量對預算完全隱形，而且 gate 是綠的。任何人明天把一張 3 MB
的醫師照塞進 `clinic-content.js`，所有把關仍然全綠——這比預算不存在更危險，因為
綠燈會被當成「量過了」。

**修法：** `referencesOf` 對 `.js` 追加 `SCRIPT_ASSET_REFERENCE`，只認**帶影像副檔名**
的 root-absolute 路徑。`/booking`、`/clinic/doctors` 這類導覽字串沒有副檔名，不會被
誤當成資源（有一支反面測試釘住這一點）。補上之後 gate 第一次量到整頁：13 檔
127.3 KiB。

**預算隨之調降** 560 KiB／3 檔 → 180 KiB／14 檔。檔數上升不是放寬：那 9 張本來就
會被下載，只是先前量不到。已記入 `web-quality-gates` 的預算調整紀錄。

## 5. 品牌圖標的版面跳動

`clinic.html` 上的 `width="420" height="131"`（3.2:1）與檔案本身的 1.8:1 對不起來。
`height: auto` 之下，瀏覽器在載入前依屬性保留 200×62，載入後變成 200×112——每次
進站跳一次，而 CLS 預算是 0.1。

轉檔時依 alpha 邊界裁掉透明留白（實測墨跡 1384×771），屬性改成裁切後的真實比例
400×223。**版面本身沒有變**，變的只是載入前那一格佔位。

## 6. Token gate 認不得 `@property`

`@property` 宣告的自訂屬性被 `check:tokens` 報成「未定義」。但 `@property` 是唯一
能讓自訂屬性做動畫的方式——沒有型別，瀏覽器不知道 `0deg` 到 `360deg` 之間怎麼內插。
只認 `:root` 會把正確的現代寫法報成錯誤，或逼人在 `:root` 再寫一次同一個初始值、
讓同一件事有兩個來源。已教會 gate 認得 `@property`，補兩支測試（現 15 項）。

## 7. 門診時間定案

OR-07 由 ❓ 改為 ✅：**12:00–20:00**，2026-08-01 業主定案，較早筆記寫的 20:30 作廢。
「需業主釐清的四件事」第 1 項標記已解決；D-004 的正式收錄仍待辦。

## 沒有做的事

- **C2 圖片授權**。素材推定取自 beauessence.com.tw（業主 2026-07-27 指示「缺圖直接
  抓官網的」），但「診所擁有或已獲授權」要業主具名確認。manifest 的
  `licenceStatus` 維持 `pending-owner-confirmation`，PUB-03 不因壓縮完成而前進。
- **C1 業主實機接受**。技術結構已對齊，主觀驗收仍待業主在代表性桌機／手機確認。
- **`og-booking.png`（806 KiB）沒有處理。** 它由 `<meta property="og:image">` 參照，
  不在任何頁面的預算閉包裡，也不會被一般訪客下載（只有社群平台的爬蟲抓）。這不是
  頁面重量問題，另案處理。
- **螢幕閱讀器實機驗證**。第 2 節的修法有單元測試釘住可及名稱，但實際聽起來如何仍
  需人工驗證（見 `docs/runbooks/manual-accessibility-test.md`）。

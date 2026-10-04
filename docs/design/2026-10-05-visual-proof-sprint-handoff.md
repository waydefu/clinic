# Visual Proof Sprint 交接（2026-10-05）

**類型：** 原型交接紀錄。**不是**部署、合併或正式施工；也不是 Design System migration 的核准。
**狀態：** 以**草稿 PR** 送審（供負責人與業主檢視），不可合併；已登記 `docs/README.md`。
本文件所在的 PR 無法引用自己的 commit，以 `git log -- docs/design/2026-10-05-visual-proof-sprint-handoff.md` 取得。

**並排對照（現況→提案）：**
[1440 首頁首屏](../reviews/assets/visual-proof-2026-10-05/compare-1440-clinic-hero.png)、
[1440 首頁→症狀區交界](../reviews/assets/visual-proof-2026-10-05/compare-1440-clinic-transition.png)、
[1440 預約頁＋第一題](../reviews/assets/visual-proof-2026-10-05/compare-1440-booking-top.png)、
[390 三格並排](../reviews/assets/visual-proof-2026-10-05/compare-390.png)。
**上游文件：** [Clinic Digital Experience Redesign Decision](2026-10-05-clinic-digital-experience-redesign-decision.md)（方向已獲負責人批准，附 Visual Proof gate）。

---

## 1. 一句話

依負責人逐步指示，在本機做出首頁首屏、首頁→症狀區交界、預約頁頁首＋第一題的原型，
1440／390、淺色、減少動態下截圖對照，並完成自評。結論：**有條件過關**，條件見 §8。

## 2. 位置

| 項目 | 位置 |
| --- | --- |
| 原型分支 | `agent/clinic-visual-local-20261005`（草稿 PR），worktree `F:\診所專案\cal-pilot\.claude\worktrees\clinic-visual`，起點 `origin/main` `1e26d3b` |
| 並排對照圖（入版控） | `docs/reviews/assets/visual-proof-2026-10-05/` |
| 本機預覽 | `F:\診所專案\.claude\launch.json` 的 `clinic-visual-local`（埠 3211，提案）、`clinic-main-baseline`（埠 3213，乾淨 main 對照）、`official-assets-viewer`（埠 3212，官網素材檢視） |
| 乾淨 main 網頁檔 | `F:\診所專案\tmp\visual-proof-2026-10-05\main-web\`（由 `git archive origin/main` 解出，只供對照） |
| 截圖與數據 | `F:\診所專案\tmp\visual-proof-2026-10-05\`：`current\`、`proposal\`、`compare-1440-*.png`、`compare-390.png`、`current-metrics.json`、`proposal-metrics.json`、`verify-results.txt`、`lineart-sheet.png` |
| 量測／轉檔腳本 | `F:\診所專案\tmp\visual-proof-2026-10-05\scripts\`（Playwright 取自 `cal-pilot\.claude\worktrees\shots\node_modules`，不新增相依） |
| 官網原始素材 | `F:\診所專案\tmp\official-site-images-2026-10-05\`（63 張，`manifest.json` 記來源網址、位元組、sha256） |
| 研究期截圖 | `F:\診所專案\tmp\redesign-evidence-2026-10-05\`（25 張，正式官網與現行 repo） |

## 3. 原型用到的素材（全部來自正式官網 beauessence.com.tw 的付費素材）

原始檔都在 `F:\診所專案\tmp\official-site-images-2026-10-05\`，下表路徑相對於該資料夾；
產出檔在 worktree 的 `apps/web/public/clinic-assets/`。共 17 檔、308 KiB（輪播採延遲載入，首屏只下載第一張）。

| 產出檔 | 原始檔 | 處理 | 用在 |
| --- | --- | --- | --- |
| `clinic-photo-logo-{1400,800}.webp` | `2025/06/1-1-scaled-1.webp`（標誌牆） | 縮圖 q0.70／0.68 | 首頁輪播第 1 張（預先載入） |
| `clinic-photo-lounge-*` | `2025/02/5-1-1.jpg`（候診區） | 同上 | 輪播 2 |
| `clinic-photo-consult-*` | `2025/06/3-1-scaled-1.webp`（診間） | 同上 | 輪播 3 |
| `clinic-photo-reception-*` | `2025/06/4-1-1-scaled-1.webp`（櫃台） | 同上 | 輪播 4 |
| `clinic-photo-treatment-*` | `2025/02/6-1.jpg`（處置室） | 同上 | 輪播 5 |
| `clinic-photo-desk-*` | `2025/06/2-1-scaled-1.webp`（診桌） | 同上 | 輪播 6，**畫面含「仙女玻尿酸」宣傳氣球，待負責人決定** |
| `hero-forest.webp` | `2025/06/new產品底圖14.webp`（左霧右林） | q0.72 | 預約頁頁首氛圍帶（桌機） |
| `horizon-mist.webp` | `2024/12/止鼾五合一newest-1.png`（絲光＋樹線） | q0.72 | 預約頁頁首氛圍帶（手機） |
| `icon-nose.webp` | `2024/12/ic7new.png`（白色線稿） | 依筆畫連通區塊裁切，**移除原圖的手術刀** | 症狀區「鼻子不通」 |
| `icon-mouthguard.webp` | `2025/02/2025new.png` | 裁切 | 症狀區「打鼾與睡眠」 |
| `icon-doctor.webp` | `2024/12/87new.png` | 裁切 | 症狀區「不確定是哪一種？」 |

既有 repo 素材沿用：`clinic-logo.webp`（預約頁頁首改用與官網同一個標誌）、`soft-green-bg.webp`。

## 4. 參考網站

| 網站 | 參考了什麼 | 沒有沿用什麼 |
| --- | --- | --- |
| [太田耳鼻咽喉科医院](https://jibika.info/)（負責人指定） | 結構：上半部大視覺、下方寬版「診療時間」表格卡壓在交界、症狀區用一塊色底 | 白色大弧框、青綠配色、彩色直立按鈕、耳／鼻／喉圖示（負責人：不照抄風格、圖示用自己的） |
| [大通り耳鼻咽喉科クリニック](https://www.odori-jibika.com/) | 首屏就放受付時間表 | 醫療儀器照片 |
| [ごとう耳鼻咽喉科](https://goto-ent.com/)（實訪 403，依介紹文） | 首屏放症狀入口按鈕 | — |
| [耳鼻科參考設計集 138 站](https://mihoncho.com/jibika/) | 確認日本耳鼻喉科首屏的常見做法（醫師照、診間照、吉祥物、時間表） | — |
| [Lofta](https://lofta.com/pages/why-lofta)、[Neko Health](https://www.nekohealth.com/)、[Tia](https://asktia.com/) | 不用醫師照的醫療品牌首屏 | — |
| [WeAreBrand](https://wearebrand.io/) | 先前決策文件的 art direction 方法 | 版型、動畫、品牌 |
| 文章：[maru-nagoya 耳鼻咽喉科 6 選](https://www.maru-nagoya.jp/blog/jibika_design/)、[itreat 耳鼻咽喉科 11 選](https://itreat.co.jp/blog/ent)、[MediPeak おといろ耳鼻咽喉科案例](https://medipeak.jp/medipeak-journey/otoiro-ent-project-4/) | 首屏型態分類；手機版把診療時間排在消息之前 | — |

## 5. 負責人在本次的決定（依時間順序）

1. 方向「霧林呼吸」批准，但先做 Visual Proof Sprint，過關才核准整站 Design System migration。
2. 首屏不放醫師照。
3. 單張候診區照片放首頁不適合 → 先研究參考。
4. 文案太抽象 → 改具體（現行：「鼻塞、打鼾，先找出原因。」＋看診時會做什麼）。
5. 首屏放門診時間面板（三案中選定）。
6. 太田可參考；圖示用一森渼自己的、不照抄；風格不照抄。
7. 桌機：門診時間表加寬、下移；上半部可學太田，可用圖片輪播。
8. 手機：霧林帶直接放標題後，不另占空間。
9. 背景太淡 → 減少遮罩。
10. 輪播改用 6 張診所實景。
11. 完成後寫交接，含參考網站與素材位置（本文件）。

**與決策文件不同之處（以負責人最新指示為準，正式施工前要回寫決策文件）：**
決策文件原寫「首屏放醫師去背照」「環境照只當信任證據、不當主視覺」；現改為首屏以診所實景輪播為主視覺、醫師照移到醫師區。
另新增：門診時間卡（含今日狀態）、症狀區三組＋白色線稿、首屏照片輪播（附暫停）。

## 6. 改了哪些檔

| 檔案 | 內容 |
| --- | --- |
| `apps/web/public/clinic-content.js` | 首屏文案改具體；新增 `CLINIC_WEEKLY_HOURS`（每週門診結構化資料） |
| `apps/web/public/clinic-site.js` | 首屏改成照片輪播＋霧＋呼吸弧線（SVG）；門診時間卡（今日狀態、一週表格、電話、地圖）；症狀區分三組配線稿；移除主標逐字浮現 |
| `apps/web/public/clinic.html` | 載入 `clinic-proof.css`；預先載入第一張輪播照片（寬窄各一） |
| `apps/web/public/clinic-proof.css` | 原型樣式（正式施工時併入 `styles.css` token，不保留此檔） |
| `apps/web/public/patient.html` | 預約頁改用官網同一標誌；主題選單移到頁尾並改名「顯示模式」；頁首加一句說明 |
| `apps/web/public/booking-proof.css` | 預約頁淺色主題的霧林氛圍帶、實心白卡（護眼、深色不套圖） |
| `apps/web/public/clinic-assets/*.webp` | §3 的 17 個檔 |
| `docs/design/…decision.md`、本文件 | 決策與交接 |

## 7. 驗證

**條件：** Chromium（Playwright 1.61.1）、Windows、`colorScheme: light`、`reducedMotion: reduce`（真實模擬，不是猜）、1440×900 與 390×844。
LCP 是本機 lab 數據、各跑 3～5 次取中位數；不是 field 數據。

| 指標 | 現況（main） | 提案 |
| --- | --- | --- |
| 首頁 LCP 中位數 1440／390 | 1308／1220 ms | 1448／1340 ms |
| 預約頁 LCP 中位數 1440／390 | 1568／1668 ms | 1040／2004 ms（元素是文字，屬量測波動） |
| CLS（全部頁面、全部寬度） | 0 | 0 |
| 首頁載入圖片 1440／390 | 74.4／65.0 KiB | 85.8／62.8 KiB |
| 預約頁載入圖片 | 5.2 KiB | 25.1／20.8 KiB（超出現行預算 6 KiB） |
| 首頁「依症狀查詢」起點 390 | 1386 px | 1089 px |
| 預約頁第一題位置 390 | 630 px（75%） | 561 px（66%）；扣掉測試專用提示 438 px（52%） |
| 首屏文字最差對比（6 張照片 × 2 寬 × 3 段文字） | — | 6.32:1（標準 4.5） |
| 水平捲軸 | 無 | 無 |

| Gate | 狀態 | 原因 |
| --- | --- | --- |
| `pnpm verify`（含 `check:ui`、`check:tokens`、`check:perf`、`check:pages`、clinic freeze、單元測試） | `NOT_RUN` | 本 worktree 無 node_modules；且原型**預期會讓** freeze 檢查與預算檢查紅燈（尚未解凍、預算未調整） |
| e2e（axe、responsive、affordance、booking） | `NOT_RUN` | 同上；原型範圍只到首屏 |
| CI | 見 PR | 草稿 PR 的 CI 結果以 GitHub 為準；凍結與預算檢查預期失敗 |
| 鍵盤、讀屏器、實機、護眼／深色主題、1024 平板 | `NOT_RUN` | 不在本次 proof 範圍 |

**證據等級：** `CODE-ONLY`，加上本機 Playwright 截圖與量測（不是 repo gate）。

## 8. 自評（current → proposal，1～5 分）

| 面向 | 現況 | 提案 | 依據 |
| --- | --- | --- | --- |
| 品牌辨識 | 2 | 4 | 首屏就看到古銅標誌牆、診所實景；症狀區用舊官網白色線稿；預約頁換成同一標誌。扣分：輪播第 2 張以後才有診所空間感，手機照片露出面積小 |
| 資訊層級 | 3 | 4 | 大標在 Windows 不再退成細明體；先講症狀再講做法；主要按鈕排第一；時間卡一眼看懂今天有沒有看診 |
| 視覺獨特性 | 2 | 4 | 照片從霧裡浮出、呼吸弧線、深綠線稿區，和一般白底診所頁差異明顯。風險：照片輪播本身是常見手法，靠「霧」的處理區隔 |
| 醫療信任 | 3 | 4 | 真實空間＋門診表＋今日狀態＋電話＋地圖；醫師照移到下方。扣分：療程文案未經醫師審 |
| CTA 清楚度 | 3 | 4 | 線上預約（主）／依症狀找療程（次）／撥打電話（替代）分工清楚，頁首另有預約鍵 |
| 手機可用性 | 3 | 4 | 首屏就看到今日門診狀態；症狀區提早約 300px。扣分：預約頁第一題仍在 66%（正式環境約 52%），未達 50% 目標 |
| AI 套路風險 | 3 | 4 | 移除英文等寬小標、逐字浮現；圖示全用自家線稿。仍有：白卡＋陰影、12px 圓角、症狀區分組卡片 |
| 效能 | 4 | 4 | 首頁 LCP +0.12～0.14 秒、CLS 0、照片延遲載入、無新相依。扣分：預約頁圖片超出預算（主要是 12 KiB 標誌圖） |

**判決：有條件過關。** 作為 Design Director，我會核准進入整站 Design System migration，但下列條件要先處理或明確延後：

1. **診桌照（第 6 張）**畫面上的醫美宣傳氣球：換掉、修圖，或確認保留。
2. **文案**（首屏、症狀分組、門診卡說明）請診所醫師確認；療程頁文案另案。
3. **預約頁預算**：標誌改用更小的圖（或 SVG），或依實測調整 `/patient.html` 圖片預算並寫入理由。
4. **門診資料單一來源**：`CLINIC_WEEKLY_HOURS`、`CLINIC.hours`、JSON-LD 三處要納入既有一致性檢查；「今日狀態」不知道國定假日，已加註說明。
5. **線稿 SVG 化**（決策文件建議的投資）：目前靠白色描邊加粗，SVG 化後可移除。
6. **預約頁氛圍帶**目前仍是霧林；首頁已改實景輪播，要不要跟著換成標誌牆照片，待負責人決定。
7. **輪播的鍵盤與讀屏器實測**、護眼／深色主題、1024 寬度、實機。
8. 回寫決策文件（§5 的差異），並取得 `/clinic` 日期化的解凍指示。

## 9. 下一位從這裡開始

1. 開 `clinic-visual-local` 與 `clinic-main-baseline` 兩個預覽，對照看。
2. 先處理 §8 的條件 1～3（負責人決定與文案），再依決策文件 §17 的階段開始正式施工；
   施工從乾淨的 `origin/main` 開新分支，把 `clinic-proof.css`／`booking-proof.css` 的值併入 `styles.css` token，不要直接 commit 原型檔。
3. 重跑量測：`F:\診所專案\tmp\visual-proof-2026-10-05\scripts\` 的 `proof-shots.mjs`（截圖＋位置）、`verify.mjs`（LCP 中位數＋對比）、`compare.mjs`（並排圖）。需先啟動 3211、3213、3212 三個預覽。

## 10. 本機環境注意

- 內建瀏覽器截圖會縮成約 500px 寬，也不能模擬減少動態；要用 Playwright（腳本已附）。
- Playwright 在 `cal-pilot\.claude\worktrees\shots\node_modules`；本 worktree 沒有 node_modules。
- 頁面 CSP 擋 `data:` 圖片，像素計算要在另一個空白分頁做（`verify.mjs` 已處理）。
- 本機 LCP 波動很大（同一頁 1.5～2.7 秒都出現過），至少跑 3 次取中位數，必要時 5 次。
- 手動轉抄 base64 會出錯（實際發生過），轉檔一律用 `make-webp.mjs`／`make-icon.mjs` 由瀏覽器直接寫檔。
- **圖示被壓扁（負責人回報，已修）：** 症狀分組是直排 flex，子元素預設撐滿整列寬度，固定高度的圖示被橫向拉長。
  `.clinic-symptom-group__icon` 加 `align-self: flex-start`＋`object-fit: contain` 後，顯示比例與原圖一致
  （例：鼻子 280×160 → 桌機 140×80、手機 105×60）。正式施工時，任何放在直排 flex 裡的圖片都要檢查這一點；
  可用 `scripts\icon-shot.mjs` 列出每個圖示的顯示尺寸與原圖尺寸比對。

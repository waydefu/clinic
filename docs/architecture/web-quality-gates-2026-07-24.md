# 前端與供應鏈品質把關（2026-07-24）

**狀態：** Stage 0 內完成，未解除任何決策 gate。

> **2026-08-11 實作查核更正：** 本次為唯讀靜態盤點，未重跑任何 gate。CodeQL 已被
> Semgrep CE 取代；SAST required-check、clinic timing mapping 與 axe lower-severity
> evidence 的限制依下文修正。歷史數字不得當作目前 HEAD 通過證據。

這份文件說明「品質」在這個專案裡是怎麼被**強制**的：哪些由 CI 擋、哪些只能靠
人工、哪些必須等決策核准。文件本身不是把關；把關是 `corepack pnpm verify`、
`.github/workflows/` 與 runbook。

## 1. 把關全景

| 面向 | 把關方式 | 位置 | 阻斷 CI？ |
| --- | --- | --- | --- |
| 結構、UI 邊界、文件連結 | 腳本 | `scripts/check-*.mjs` | 是 |
| 設計 token（未定義 token、寫死色、字重、圓角、陰影、斷點） | 腳本 | `scripts/check-design-tokens.mjs` | 是 |
| 三主題覆蓋率與深色亮度階層 | Playwright | `tests/e2e/theme.spec.ts` | 是 |
| 水平 overflow／reflow 回歸預檢（支援 WCAG 1.4.10，不等於完整符合性） | Playwright | `tests/e2e/responsive.spec.ts` | 是 |
| 格式與 lint | Prettier、ESLint | `eslint.config.mjs` | 是 |
| 型別與單元測試 | tsc、Vitest | `verify` | 是 |
| Firestore 交易／規則 | Emulator 測試 | `pnpm test:rules` | 是 |
| 端到端流程 | Playwright | `tests/e2e/` | 是 |
| 無障礙自動規則子集 | axe-core | `tests/e2e/accessibility.spec.ts` | 是（僅 serious／critical；moderate／minor 未留存，不等於 WCAG 完整符合） |
| 無障礙（螢幕閱讀器、高對比） | 人工 | [人工無障礙測試 runbook](../runbooks/manual-accessibility-test.md) | 否——人工，需留紀錄 |
| 頁面重量 | 靜態預算 | `scripts/check-performance-budget.mjs` | 是 |
| 合成首屏時間與版面位移 | 瀏覽器實測 | `tests/e2e/performance.spec.ts` | 部分：目前只映射 `/` 與 `/booking`；clinic timing 宣告會被略過 |
| 已提交的密鑰 | 腳本 | `scripts/check-tracked-secrets.mjs` | 是 |
| 相依漏洞（出貨面） | `pnpm audit --prod` | `audit:prod` | 是（**moderate 起**） |
| 相依漏洞（含 dev 工具鏈） | `pnpm audit` | `audit:all` | 是（high／critical） |
| 依賴方向、未接線清單、domain 規則單一來源 | 腳本 | `scripts/check-architecture.mjs` | 是 |
| 分支保護含 `evidence` | 腳本（需 token） | `scripts/check-branch-protection.mjs` | 否——不在 `verify`，無 token 時回離開碼 2 |
| SBOM 與授權政策 | CycloneDX 產生器 | `scripts/generate-sbom.mjs` | 是 |
| SAST（規則式；非跨檔 data-flow 等價方案） | Semgrep CE | `.github/workflows/sast.yml` | workflow 會因 finding／scanner／rule test 失敗變紅；尚未納入唯一 required `Verification evidence` |

## 2. 效能預算

預算檔是 `apps/web/performance-budget.json`，用的是 **Lighthouse `budget.json`
的格式**（`path`／`resourceSizes`／`resourceCounts`／`timings`，大小單位 KiB），
因此之後真的接上 Lighthouse CI 時可以直接沿用，不必重寫。

它被兩個地方讀取，刻意分工：

- **位元組**（`resourceSizes`／`resourceCounts`）由 `pnpm check:perf` 對
  `apps/web/dist` 靜態計算，走 HTML → CSS／JS → 相對匯入的傳遞閉包，**以 gzip
  後的大小**計——Hosting 對文字資產會壓縮，使用者下載的是壓縮後的量。這一半是
  確定性的：同樣的產物永遠得到同樣的數字，所以適合當硬性 gate。
- **時間**（`timings`）由 `tests/e2e/performance.spec.ts` 在 Chromium 量測，但只會
  執行 `URL_BY_BUDGET_PATH` 有映射的項目。截至 2026-08-11，映射只含
  `/index.html` 與 `/patient.html`；`/clinic.html` 的 timings 會被 `continue` 靜默
  略過。FCP 是輔助 lab metric，LCP／CLS 才是 Core Web Vitals；目前也沒有 INP、
  mobile timing 或 p75 真實使用者資料。這些門檻只能稱為 synthetic regression
  guard，不是 Core Web Vitals field-data 達標證據。

歷史量測快照（2026-07-26，gzip；不是目前 HEAD 基線）：患者頁 53.5 KiB／32 個請求，工作臺 77.9 KiB／
34 個請求，404 頁 1.9 KiB。預算仍保留 runner 與小幅內容變動的餘裕。

2026-07-25 有兩項變動：

- **建置開始壓縮 CSS 與 JS**（`scripts/build-web.mjs` 的 `minifyStylesheets`／
  `minifyModules`，用 esbuild）。先前註解原封不動出貨——而這個專案的原始碼帶著
  大量解釋「為什麼這樣寫」的中文註解。等於在懲罰把理由寫清楚：註解愈完整，
  使用者付的錢愈多。

  | | 壓縮前 | 壓縮後 |
  | --- | --- | --- |
  | 患者頁樣式表 | 14.6 KiB | 6.9 KiB |
  | 工作臺樣式表 | 21.3 KiB | 11.5 KiB |
  | 患者頁 JS | 70.0 KiB | 41.4 KiB |
  | 工作臺 JS | 86.6 KiB | 53.2 KiB |
  | 患者頁總計 | 94.9 KiB | **58.6 KiB** |
  | 工作臺總計 | 117.6 KiB | **74.7 KiB** |

  JS **不做 bundling**，只逐檔壓縮，理由是保留 `public/` → `dist/` 的逐檔可讀
  對應；這是可稽核性決定，不是 CSP 限制（同源 bundle 也符合
  `script-src 'self'`）。內容雜湊靠 import 語句改寫，模組發現瀑布則由
  `modulepreload` 攤平。另外開了 `keepNames`——若有程式靠 `constructor.name`
  或 `error.name` 判斷分支，改名會靜默走錯。

  省下來的額度沒有留成鬆弛：預算同步收緊（患者頁 script 80→50、總計 100→70；
  工作臺 script 100→64、總計 135→90）。

  `node scripts/check-performance-budget.mjs --report` 可以隨時印出逐頁明細。
- **患者頁影像預算從 5 KiB／2 個放寬到 6 KiB／3 個**，因為放進了診所自己的標誌
  與健保署署徽（見下）。這正是預算該有的作用——它沒有阻止這件事，它逼這件事
  變成一次有紀錄的決定。同時工作臺影像預算從 5 收到 4 KiB。

### 品牌資產

`pnpm build:brand` 從 `apps/web/brand-source/`（高解析原稿，不出貨）產生
`apps/web/public/assets/` 底下的 WebP，**產物有進版控**，所以正式建置不需要
瀏覽器；只有換標誌時才重跑。

沒有用向量：兩張都是點陣稿，沒有向量原始檔，而健保署署徽是官方標章，必須原樣
重現，不能描邊重畫。原稿 143 KiB／66 KiB 縮到 2.4 KiB／2.9 KiB（顯示尺寸的
2 倍）。標誌的裁切框來自實測墨跡邊界——標誌與字標之間有一道 115px 寬的空白帶，
從那裡切開，字標留給 HTML 文字（可選取、可翻譯、會跟著主題走）。

兩個刻意的設計：

- **字型預算是 0 KiB。** 早期 roadmap 曾把 `Noto Sans TC` 列為待決定；2026-07-25
  已決定保留系統字型，2026-07-27 再確認零字型預算是正式設計方向。任何人加字型
  都會撞到 gate，必須先有新的明確決定，不能悄悄多出幾百 KB。
- **沒有預算的頁面直接失敗。** 新增 HTML 進入點時必須明確替它定預算，不會因為
  「沒設定」而免除檢查。

### Open Graph 分享圖：刻意不在預算閉包裡（2026-08-02 決議）

`og-booking.jpg` 由 `<meta property="og:image">` 參照，而 `check:perf` 的
`HTML_REFERENCE` 只認 `src=`／`href=`，所以它**不會**進入任何一頁的傳遞閉包。

這是刻意的排除，不是
[2026-08-02 交付紀錄](../reviews/2026-08-02-clinic-motion-and-assets.md) 第 4 節那個
盲點的另一個實例。兩者表面一樣——「一個出貨的檔案，沒有任何預算看得見它」——
差別在**誰下載它**：

- 第 4 節那 9 張圖是**每個訪客都真的下載**。位元組不會因為參照方式是 JS 字串常數
  就消失，所以那是必須補進閉包的漏洞。
- OG 圖**訪客的瀏覽器從不請求**。抓它的是 Facebook／LINE／X 的爬蟲，在頁面之外抓，
  抓完快取在平台那邊。

把它算進 `image` 桶會怎樣：`/patient.html` 的影像預算是 6 KiB，OG 圖一進來就爆，
而唯一的解法是把一個**面向訪客**的數字調高到足以容納沒有訪客會下載的位元組——那個
數字從此不代表任何事。第 4 節的毛病是綠燈沒有意義；這樣做是紅燈沒有意義，而紅燈
沒有意義的下場是有人把預算調鬆，真正的迴歸跟著被蓋掉。

**為什麼也不另開一個 resourceType**（例如 `social-image`）：這份預算檔刻意沿用
Lighthouse `budget.json` 的格式以便日後直接餵進 Lighthouse CI，而 Lighthouse 的
`resourceType` 是封閉列舉；自創型別會讓整份檔案失去那個相容性，為一個檔案付這個
代價不划算。何況這道預算的形狀是「從一個 HTML 進入點走傳遞閉包」，OG 圖是整個站台
的社群識別、不屬於任何一頁的載入，就算給它專屬的桶子，掛在 entry point 底下仍然是
歸錯類。**本次沒有任何一條預算數字變動。**

**體積改由 `pnpm check:ui` 守。** 那道 gate 本來就管著這個檔案的合約（JPEG 簽章、
1200×630、SHA-256 對上 `apps/web/brand-source/og-booking.metadata.json`），2026-08-02
再加一條 `maxBytes` 上限（120 KiB，實測 53.7 KiB 的兩倍出頭）。排除不代表沒人看著：
2026-07-28 的 ImageGen 修字把這個檔案從約 100 KiB 變成 **806 KiB**、成為全專案最大的
出貨檔，而當時沒有任何閘門發現——這條上限就是補那個缺口。

不追這條參照也不會讓打錯的路徑溜過去：`check:ui` 逐字比對
`<meta property="og:image" content="/og-booking.jpg" />` 並且真的去讀那個檔。

### Open Graph 分享圖的重新編碼（2026-08-02）

同日把 806 KiB 的 PNG 重編成 **53.7 KiB 的 JPEG**（1200×630 不變，少掉 93%）。
產生器是 `pnpm build:brand`，原始 PNG 移到不出貨的 `apps/web/brand-source/`，與
品牌資產、官網素材同一套做法。

| 取捨 | 決定 | 依據（2026-08-02 實測） |
| --- | --- | --- |
| 格式 | JPEG | 這張圖是平滑漸層加文字、相異顏色 24420 種，漸層正好打死 PNG 的逐列過濾。用 canvas 重編 PNG 是 **981 KiB，比原檔還大**；要留在 PNG 就得引入 pngquant／oxipng 這類量化器，也就是一個 native 相依——那正是 `build-clinic-assets.mjs` 為了同一件事否決 sharp 的理由。 |
| 不是 WebP | 放棄 19.7 KiB | WebP q0.8 只要 19.7 KiB，但分享圖的讀者是各家爬蟲，WebP 在那條路徑上支援不齊。省下的 34 KiB 完全不在訪客的載入路徑上，拿它換「某個平台抓不到預覽圖」不划算。 |
| quality 0.9 | 而非 0.85 | 這張圖不在任何頁面的傳輸預算裡，位元組壓力本來就弱，所以取捨偏向畫質。文字帶 PSNR 0.85→0.9 是 33.5→34.5 dB、單通道最大誤差 76→62；再往上（0.94）多花 27 KiB 只換 0.8 dB。分享卡最容易壞的地方是深色底上的白字與金字振鈴。 |
| 壓平透明 | 填品牌深綠再畫 | 原始 PNG 是 RGBA 且實測最低 alpha 為 220，帶著一層沒人要的半透明。平台會把分享圖合成在自己也不告訴你的底色上，那是潛在的顯示錯誤；JPEG 沒有 alpha，先鋪底等於把它壓成確定的結果。 |

兩個附帶決定：

- **檔名不做內容雜湊。** 平台的預覽快取以 URL 為鍵，雜湊檔名會讓每次重新產圖都
  變成一個新網址、舊的分享卡指向 404。`/og-booking.jpg` 維持穩定路徑。
- **`og:image:type` 刻意不宣告。** 爬蟲從回應的 `Content-Type` 判斷格式，這個標籤
  純屬冗餘，而它 gzip 後 9 個位元組會讓 `/patient.html` 的 document 預算**超出 1 個
  位元組**（7169 > 7168）。為一個冗餘標籤調高預算，正是這份文件不希望發生的事。

### 預算調整紀錄

預算是棘輪：**調高必須是一次寫下理由的決定**，不是為了讓 CI 變綠而改的數字。

| 日期 | 項目 | 由 | 至 | 理由 |
| --- | --- | --- | --- | --- |
| 2026-07-27 | `/index.html` document | 11 KiB | 12 KiB | 帳號區新增權限委派的表單與授權碼清單。工作臺是登入後的內部工具，且只有 document 這一項越線（11.2 KiB），指令碼與樣式表用量未變。 |
| 2026-07-27 | `/privacy.html` | 新增 | 7 KiB total | 新的對外頁面。無指令碼、自成一份 3 KiB 的樣式表，實測 4.1 KiB。 |
| 2026-07-27 | `/privacy.html` image／total | 1 KiB／1 檔／7 KiB | 3 KiB／2 檔／8 KiB | 頁首加入診所標誌（與預約頁同一份 2.4 KiB 的 WebP，多數訪客已在預約頁快取過）。實測 total 7.4 KiB。 |
| 2026-08-01 | `/clinic.html` script／stylesheet | 12 KiB／7 KiB | 20 KiB／14 KiB | 首頁動效與門診時間／交通資訊補全，業主當日同意擴充首頁預算。動效限用 CSS transform／opacity，`cumulative-layout-shift` 維持 0.1 不放寬。（補記：這一列在當時的變更裡漏了，2026-08-02 補上。） |
| 2026-08-02 | `/clinic.html` image／total | 560 KiB／3 檔／595 KiB | 180 KiB／14 檔／200 KiB | **這是調降，不是調高。** 12 張官網素材轉 WebP 後由 2210 KiB 降到 129 KiB，實測整頁 13 檔 127.3 KiB／total 146.3 KiB。檔數 3 → 14 是因為同日修好 `check:perf` 的盲點：它先前不追 JS 字串常數指到的圖，12 張裡有 9 張因此對預算隱形——那 1.7 MB 一直都會被下載。 |

## 3. SBOM 與授權政策

`pnpm sbom` 產出 `sbom.cdx.json`（**CycloneDX 1.6**，git 忽略、CI 上傳為
artifact），取代先前只有我們自己看得懂的 `dependency-inventory.json`。每個元件
都有 purl，可直接餵給漏洞比對與授權稽核工具。

這是目前實作格式，不是 2026-08-11 的正式規格終態：CycloneDX 目前 formal 版本為
1.7。現有 artifact 只保留 90 日、未綁 deploy artifact digest，也沒有 provenance、
signature 或 dependency-completeness 聲明；不得把它單獨稱為 release assurance。

同一個腳本同時是**授權 gate**：

- 允許清單是本 repository 經審視的政策，不可統稱全部為 permissive；例如
  MPL-2.0 是 weak copyleft。GPL／AGPL 或未知義務不得直接進入相依樹，任何例外都要
  有 owner、法務核准、適用 scope、理由與 expiry。
- SPDX 運算式是**被解析的**，不是字串比對：`(MIT OR CC0-1.0)` 會通過，
  `MIT AND GPL-3.0-only` 不會，看不懂的字串一律不通過。
- 沒有宣告授權、或宣告了非 SPDX 字串的套件，必須列入 `REVIEWED_EXCEPTIONS`
  並附理由，否則 CI 紅。目前有三筆（`deep-freeze`、`url-template`、
  `valid-url`，皆為 dev-only），每次執行都會印出來，不會靜靜地長期存在。

**已知限制（刻意記錄）**：`pnpm list` 對重複子樹會標 `deduped` 並省略其相依，
因此相依「邊」可能不完整；元件清單則是完整的。漏洞比對與授權稽核靠的是元件與
purl，不受影響。若之後需要完整相依圖，來源要改成鎖檔。

另一個限制：其他作業系統的 optional binary（`@esbuild/*`、`@rollup/*`、
`fsevents`）在本平台不會安裝，也就讀不到 manifest。它們仍列入 SBOM 並標記
`beauessence:resolution: not-installed`，但不納入授權判定——沒安裝也不會出貨。

## 4. SAST

分兩層，另有一個尚未補完的 required-check 邊界：

1. **ESLint**：阻擋單檔可判定的動態求值與危險語法。
2. **Semgrep CE**：使用固定 engine image、固定 upstream rules revision、
   repository-owned rules 與正反 fixture，產出同一 commit 的 JSON／SARIF／summary
   artifact。它是規則式分析，**不等同 CodeQL 的跨檔 taint/data-flow**。
3. **Required-check 限制（2026-08-11）**：`.github/workflows/sast.yml` 是獨立
   workflow；唯一 required `Verification evidence` 只依賴 `verify`、`rules`、
   `e2e` 與 `supply-chain`。因此 SEC-02 政策已核准，但 merge-blocking enforcement
   尚未被證明；`SCM-R01` 必須讓精確、同 commit 的 SAST 結果成為 required。
4. **`SCM-R01` 的前置是 `SCM-R05`**：`supply-chain` 目前在稽核基準 `cf597af` 就是
   紅的（見 §3 的 `nanoid` high），連帶讓 `Verification evidence` 變紅。aggregate
   沒先轉綠，`SCM-R01` 的「故意失敗 PR」驗收就分不出擋住 PR 的是 SAST 還是
   dependency audit，等於驗不出 required boundary。

上線證據包仍須附實際 run、commit SHA、掃描結果與 artifact；YAML 存在、獨立 workflow
變紅或本機掃描成功，都不能單獨證明 branch merge 被阻擋。

## 4-b. 設計 token

`pnpm check:tokens` 把「樣式表裡沉默失效的東西」變成建置失敗。它存在的直接原因
是一個實際發生過的缺陷：`--text-sm` 被用了五次，卻從來沒有定義過。CSS 對此完全
沉默——整條宣告失效，字級默默退回繼承值，畫面看起來「差不多對」。

硬性檢查（目前全部為零，再出現一個就紅）：

| 類別 | 為什麼是錯的 |
| --- | --- |
| 未定義的 `var(--x)` | 宣告靜默失效 |
| `:root` 之外的寫死顏色 | 主題切換不會影響它——三個主題只會覆蓋一半的頁面 |
| 數字字重 | 先前有八階，但字體家族只有兩檔，六階在螢幕上完全一樣 |
| 寫死的圓角／陰影 | 先前 20+ 種圓角、21 種不重複的 rgba 陰影 |
| 非正式尺度的斷點 | 兩份樣式表曾各用一套，44–48rem 之間是沒人設計過的半成品狀態 |

上限式檢查（ratchet，數量只能減不能增）：離開字級尺度的 `font-size` 字面值
（31）與離開 4px 間距網格的字面值（199）。這些收斂會改變版面節奏，屬於選定視覺
風格時的工作，所以現在只鎖住「不准變多」，並在每次執行時把數字印出來。

## 3-b. 相依修補與已審視的 audit 例外

`check:supply-chain` 依序跑**兩層** audit，會擋 CI。它查的是**線上的 advisory
資料庫**，所以就算一行程式都沒改，它也可能某天開始變紅——這是刻意的，不是雜訊。

2026-07-30，私有 canonical repository `waydefu/clinic` 已啟用 dependency graph
與 Dependabot alerts，初始顯示 4 筆 development-scope open alerts（1 high／3
moderate）。Automatic dependency submission、malware alerts、security updates、
grouped updates、version updates 與 self-hosted-runner support 均未一併開啟。
Dependabot 是額外的持續可見性，不取代下面會阻斷 CI 的兩層 audit，也不會自動核准
修補或例外；完整設定證據見
[2026-07-30 啟用紀錄](../reviews/2026-07-30-private-dependabot-alert-enablement.md)。

**2026-08-11 14:32 +08:00 遠端唯讀快照：** GitHub Dependabot API 對 `main`
回報 9 筆 open development-scope alerts（8 medium、1 low）。這不推翻
2026-08-01 當時批次已修補的史實，也不能由「source tree 沒有 audit exception」推論
遠端沒有新 alert。Draft PR #14 的 `Tracked secrets、dependency audit 與 inventory`
及 required `Verification evidence` 在稽核基準 `cf597af` 為失敗；本次沒有重跑或
修改 dependency。

**失敗原因（同日唯讀讀取 Actions log）：** `corepack pnpm audit --audit-level high`
回報 `10 vulnerabilities found — 1 low | 8 moderate | 1 high`；該筆 high 是
`nanoid`（vulnerable `<3.3.17`、patched `>=3.3.17`、`GHSA-2v37-7h3g-55p8`），經
`postcss@8.5.20` 進入 dev 工具鏈，`audit:prod` 那一層仍是 0 筆。Dependabot 的 9 筆
不含 high，與 CI 的 10 筆不一致——以 CI 為準。後續依 `SCM-R05` 修綠並逐筆核對
affected path、reachability、patched version、owner 與 SLA；長期 patch SLA 與
automated update 為 `SCM-R04`。`SCM-R03` 是密鑰掃描（Gitleaks），與本節無關。

**2026-08-17 重新驗證（commit `fc15bfd`、CI run `31994942617`）：** 同一筆 high 仍在，
數字仍是 `10 vulnerabilities found — 1 low | 8 moderate | 1 high`，`audit:prod` 仍是
0 筆。兩點與上述 2026-08-11 讀數不同，**上面那段保留為當日快照，不回頭改寫**：

1. **advisory 門檻已上移。** 現在是 vulnerable `<3.3.18`、patched `>=3.3.18`。
   `SCM-R05` 若照原記的 `>=3.3.17` 提版，gate 不會轉綠。
2. **相依路徑以 CI 輸出為準為 `vitest > vite > postcss > nanoid`**（三條，含
   `@vitest/mocker` 與 `vite-node` 分支），仍全部落在 dev 工具鏈，因此
   `audit:prod` 乾淨、只有 `audit:all` 紅。

同一次 run 的其餘 job 全綠（六組 e2e、Rules、結構/文件/格式/lint/型別/單元測試，
以及獨立的 Semgrep workflow）；紅的只有 supply-chain 與它連帶的
`Verification evidence`。這是有日期的證據，不構成任何核准。

Detection 也不等於 patch management。正式維護須有具名 owner，並以 Critical
24～48 小時、High 7 日、Moderate 30 日內完成修補或風險判斷為初始 SLA；逾期只能
使用具 owner／expiry 的例外，不能只保留一個 alert。

2026-07-31 的修補批次已將可相容處理的三筆 moderate 路徑升到安全版：
`tar@7.5.22`、`@hono/node-server@2.0.12` 與
`@opentelemetry/core@2.8.0`；同時把 `firebase-tools` 升到 `15.25.0`、
`@modelcontextprotocol/sdk` 升到 `1.30.0`。`audit:prod`、`audit:all`、Firebase
CLI／MCP 載入、Pub/Sub＋OpenTelemetry propagator 與 Hono public API smoke 均
通過。OpenTelemetry 目前仍是精確的 cross-major override，因為父套件仍宣告
`^1.30.1`；解除條件是 `@google-cloud/pubsub` 正式允許 2.8+ 後刪除 override，
重建 lockfile 並重跑 supply-chain／Emulator gate。

| 指令 | 範圍 | 門檻 |
| --- | --- | --- |
| `audit:prod` | `--prod`，只看會出貨的相依 | **moderate 就擋** |
| `audit:all` | 全部，含 dev 工具鏈 | high／critical 才擋 |

**為什麼分兩層**（2026-07-26 決定）：把全部拉到 moderate，會被 firebase-tools
（CLI，不出貨）的傳遞相依長期壓在紅燈，最後一定演變成整條 audit 被關掉或被
ignore 洗到失效；維持單一 high 則相反——**出貨程式**多一筆 moderate 也不會有人
發現。分層之後，「哪一種漏洞會擋下發布」是寫在指令裡、可被檢驗的決定。

現況（2026-08-04 更新）：`audit:prod` 無任何 advisory；`audit:all` 剩 5 筆 moderate，
全在 high 門檻之下，且**沒有任何 audit 例外**。Dependabot 是看 default branch，
因此 PR 分支上的修補要等 merge 並重新分析後才會關閉 alert；不得把「已準備修補」
寫成「GitHub alert 已關閉」。

修補一律寫進版控（`pnpm-workspace.yaml` 的 `overrides`），不靠「本機剛好裝到新版」：

| 套件 | 問題 | 處置 |
| --- | --- | --- |
| `find-my-way` ≤9.6.0 | HTTP/2 DDoS。路徑 `apps/api > @nestjs/platform-fastify > fastify` | override 到 `^9.6.1`（實際解析為 9.7.0） |
| `brace-expansion` ≤5.0.7 | 不受限展開導致 OOM（GHSA-mh99-v99m-4gvg） | 5.x 那條線 override 到 `^5.0.8`，2026-08-04 因下一列的續修提高到 `^5.0.9` |
| `brace-expansion` <5.0.9 | 以不受限的中間陣列繞過 CVE-2026-14257 的緩解（GHSA-rgw5-rvv9-x895）。dev-only，路徑 `eslint > minimatch` | `^5` 那條線提高到 `^5.0.9`；1.x／2.x 不在此 advisory 範圍 |
| `fast-uri` <3.1.5 與 <4.1.2 | backslash authority introducer 造成 host confusion（GHSA-7p8r-x3mc-p8w7）。**出貨面**，路徑 `apps/api > @nestjs/platform-fastify > fastify` | **兩個 major 同時中且樹上都在**，逐 major 鎖到 `^3.1.5` 與 `^4.1.2` |
| `undici` ≥8.0.0 <8.9.0 | degenerate private cache directive 造成跨使用者資訊洩漏與 parse-time crash（GHSA-4cwx-7wf7-3272）。dev-only Firebase CLI 路徑 | 鎖 `^8` 那條線到 `^8.9.0`；樹上的 `undici@6` 不在範圍內 |
| `ip-address` ≤10.3.0 | 前導零位元組被當十進位解析、resolver 當八進位，造成 SSRF 與信任邊界繞過（GHSA-mwp4-54f8-5fhr）。dev-only Firebase CLI 路徑 | 鎖 `^10` 那條線到 `^10.3.1`（實際解析為 10.4.0） |
| `tar` ≤7.5.20 | crafted archive member selection 可觸發 stack overflow；dev-only Firebase CLI 路徑 | 既有 7.x range 精確鎖到 `7.5.22` |
| `@hono/node-server` <2.0.5 | Windows encoded-backslash path traversal；dev-only MCP SDK 路徑 | MCP SDK 升到 `1.30.0` 並精確鎖 `2.0.12` |
| `@opentelemetry/core` <2.8.0 | W3C baggage propagation 可造成不受限記憶體配置；dev-only Pub/Sub 路徑 | 精確鎖 `2.8.0`；保留 cross-major removal condition |

**目前沒有任何 audit 例外**（`auditConfig.ignoreGhsas` 為空）。上面那段文字在
2026-08-04 之前描述了一筆 `brace-expansion` 的具名例外為現行狀態，但那筆例外在
2026-08-01 就已經被移除——advisory 於 2026-07-31T19:37Z 修訂後補上了各 major 的
patched 版本，解除條件成立，於是它被修掉而不是被續期。**例外的正確結局是被移除，
不是被延長。** 完整脈絡保留在 `pnpm-workspace.yaml` 的註解裡。

要新增例外時，`scripts/check-audit-exceptions.mjs` 會強制它帶核准編號、核准狀態與
`YYYY-MM-DD` 到期日，並在到期後讓 gate 變紅。`pnpm audit` 也會把被忽略的筆數印成
`N ignored`，所以例外不會安靜地爛掉。

**上線證據包必須附一次沒有任何 ignore 的完整 audit 輸出**，並逐筆說明當時的狀態。

`scripts/check-tracked-secrets.mjs` 只掃目前 tracked tree 與有限 pattern，不涵蓋完整
Git history、所有 provider token 格式或已刪 object。Canonical repository 須另以 pinned
scanner 執行 PR diff/tree 與受控 full-history scan；fixture 必須合成，輸出不得包含
secret 原文。管理者 bypass push 也不得被描述為已受 required gate 強制。

## 4-c. 標記與無障礙結構（`pnpm check:ui`）

這個守衛擋的是「HTML 看起來對、但語意或接線是壞的」那一類——axe 與單元測試都不會
抓到，因為它們各自只看渲染結果或函式。三條規則各自對應一個實際發生過的缺陷：

| 規則 | 為什麼是錯的 |
| --- | --- |
| 清單容器不得掛 `aria-live` | 內容整批置換時，螢幕閱讀器會把整份清單逐項重唸——搜尋框每打一個字就重唸一次結果集。正解是給一個簡短的 `.result-summary` 並把 `aria-live` 掛在它上面（MDN 的 live region 指引亦然）。 |
| HTML 不得有重複 id | 兩份客戶端都用 `Object.fromEntries(querySelectorAll('[id]'))` 建 elements 表，**後出現的會靜默蓋掉前一個**：某個控制項被換成另一個元素，沒有錯誤訊息，只有讀到 undefined 或寫錯地方。加這條守衛的當下就抓到一個真的——清單摘要用了 `release-summary`，撞到發布表單裡同名的 `<textarea>`。 |
| 新增的 `<input>`／`<select>` 必須登記 | 允許清單是刻意的摩擦：每一個會碰到資料的控制項都要有人明確說明它動到什麼。 |

另有一條反向守衛（`refuseText`）擋 `aria-busy` 回到按鈕上——那是 live region 與
複合元件的屬性，掛在按鈕上會把它自己的子內容對輔助技術隱藏，等於忙碌期間讓按鈕
失去名稱。

## 4-d. 可點擊性（`tests/e2e/affordance.spec.ts`）

**全專案規則：能按的東西，不可以只是一段有顏色的文字。**

這條先後被違反過三次（2026-07-25 的「清除選取」與「前往處理清單」、2026-07-27
政策頁底部的「回到線上預約」），所以寫成掃描而不是慣例。掃描量的是**畫面上算
出來的樣子**，不是「有沒有寫某條 CSS」——因為最常見的成因是選擇器沒選到，那時
CSS 沒有壞、也不會報錯。

| 規則 | 說明 |
| --- | --- |
| 互動元素必須有形狀 | 邊框、底色、外框、陰影或底線至少一種。只靠文字顏色不算（WCAG 1.4.1；NN/g〈Beyond Blue Links〉）。 |
| 導覽列可以只靠位置 | `nav`／`.workspace-nav`／`.patient-nav` 豁免——位置本身就是訊號。 |
| 標誌可以只靠圖像 | 掛 `brand` class 的連結豁免；「標誌＝回首頁」是網頁上最強的既有慣例。**新頁面要沿用這個 class**，不要另創名字，否則會被掃描判為違規（政策頁就踩過）。 |
| 短標籤不得被逐字斷行 | 中文沒有空格，容器一窄就會一個字一行。獨立控制項（導覽、頁尾、按鈕）一律 `white-space: nowrap`，寧可整列換行；**行文中的連結不受此限**，它本來就該跟著句子走。 |

**新增任何對外頁面時，要把它加進這個 describe。** 政策頁一開始不在掃描範圍內，
所以它底部那句底線文字沒有被任何測試看見。

## 5. 無障礙的分工

axe 只能判定機器可判定的那一部分準則。焦點順序、播報是否聽得懂、高對比下狀態
是否還看得出來，只能人工測——步驟、通過條件與紀錄模板見
[人工無障礙測試 runbook](../runbooks/manual-accessibility-test.md)。

**採用的權威模式**（實作前查過，不是憑印象）：可排序表格照 WAI-ARIA APG 的
sortable table（`aria-sort` 只掛在當前排序欄的 `th`、欄名包成 `<button>`）；批次
選取的「全選」放在表格外面（放進表頭會汙染每一列選取方塊的可及名稱）；live region
用簡短狀態訊息而非整塊動態區域。細節與出處記在
[設計方向文件](../design/boutique-clinical-command-2026-07-25.md) §4。

**「axe 全綠」不得作為人工測試的替代品。** 這句話寫在這裡，是因為它是最容易被
省略的一步。

## 6. 尚未做的

| 項目 | 為什麼還沒做 |
| --- | --- |
| Lighthouse CI 完整報告與真實使用者 CWV | 目前只有靜態資源預算，以及 `/`、`/booking` 的 FCP／LCP／CLS synthetic gate；clinic timing mapping、INP 與 p75 RUM 尚未涵蓋。D-010 target 已核准，仍待 runner／RUM 對應 authority |
| 依賴簽章／來源證明（provenance、sigstore） | 需要 CI 身分與金鑰管理；D-010 target 已核准，實作仍待對應 CI identity／provenance slice 的 request 與 authority |
| 行動裝置螢幕閱讀器實測 | 需要實機，見 runbook §9 |
| 負載／soak／交易競爭測試 | Stage 6 項目；D-010 target 已核准，仍須另行授權並建立 cloud staging |

## 相關文件

- [正式化後續實作規劃](../product/production-readiness-delivery-plan-2026-07-23.md) — Web／Quality backlog 與 gate
- [正式環境目標架構](production-target-architecture-2026-07-23.md) — 架構邊界
- [人工無障礙測試 runbook](../runbooks/manual-accessibility-test.md)
- [基礎設施與維運計畫](infrastructure-and-operations-plan-2026-07-24.md) — 環境、備份、監控與部署把關

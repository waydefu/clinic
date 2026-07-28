# 前端與供應鏈品質把關（2026-07-24）

**狀態：** Stage 0 內完成，未解除任何決策 gate。

這份文件說明「品質」在這個專案裡是怎麼被**強制**的：哪些由 CI 擋、哪些只能靠
人工、哪些必須等決策核准。文件本身不是把關；把關是 `corepack pnpm verify`、
`.github/workflows/` 與 runbook。

## 1. 把關全景

| 面向 | 把關方式 | 位置 | 阻斷 CI？ |
| --- | --- | --- | --- |
| 結構、UI 邊界、文件連結 | 腳本 | `scripts/check-*.mjs` | 是 |
| 設計 token（未定義 token、寫死色、字重、圓角、陰影、斷點） | 腳本 | `scripts/check-design-tokens.mjs` | 是 |
| 三主題覆蓋率與深色亮度階層 | Playwright | `tests/e2e/theme.spec.ts` | 是 |
| 版面重排（WCAG 1.4.10） | Playwright | `tests/e2e/responsive.spec.ts` | 是 |
| 格式與 lint | Prettier、ESLint | `eslint.config.mjs` | 是 |
| 型別與單元測試 | tsc、Vitest | `verify` | 是 |
| Firestore 交易／規則 | Emulator 測試 | `pnpm test:rules` | 是 |
| 端到端流程 | Playwright | `tests/e2e/` | 是 |
| 無障礙（自動可判定） | axe-core | `tests/e2e/accessibility.spec.ts` | 是（serious／critical） |
| 無障礙（螢幕閱讀器、高對比） | 人工 | [人工無障礙測試 runbook](../runbooks/manual-accessibility-test.md) | 否——人工，需留紀錄 |
| 頁面重量 | 靜態預算 | `scripts/check-performance-budget.mjs` | 是 |
| 首屏時間與版面位移 | 瀏覽器實測 | `tests/e2e/performance.spec.ts` | 是 |
| 已提交的密鑰 | 腳本 | `scripts/check-tracked-secrets.mjs` | 是 |
| 相依漏洞（出貨面） | `pnpm audit --prod` | `audit:prod` | 是（**moderate 起**） |
| 相依漏洞（含 dev 工具鏈） | `pnpm audit` | `audit:all` | 是（high／critical） |
| 依賴方向、未接線清單、domain 規則單一來源 | 腳本 | `scripts/check-architecture.mjs` | 是 |
| 分支保護含 `evidence` | 腳本（需 token） | `scripts/check-branch-protection.mjs` | 否——不在 `verify`，無 token 時回離開碼 2 |
| SBOM 與授權政策 | CycloneDX 產生器 | `scripts/generate-sbom.mjs` | 是 |
| SAST（跨檔案資料流） | CodeQL | `.github/workflows/codeql.yml` | 設定完成；遠端執行結果須以 run 證據確認，見 §4 |

## 2. 效能預算

預算檔是 `apps/web/performance-budget.json`，用的是 **Lighthouse `budget.json`
的格式**（`path`／`resourceSizes`／`resourceCounts`／`timings`，大小單位 KiB），
因此之後真的接上 Lighthouse CI 時可以直接沿用，不必重寫。

它被兩個地方讀取，刻意分工：

- **位元組**（`resourceSizes`／`resourceCounts`）由 `pnpm check:perf` 對
  `apps/web/dist` 靜態計算，走 HTML → CSS／JS → 相對匯入的傳遞閉包，**以 gzip
  後的大小**計——Hosting 對文字資產會壓縮，使用者下載的是壓縮後的量。這一半是
  確定性的：同樣的產物永遠得到同樣的數字，所以適合當硬性 gate。
- **時間**（`timings`）由 `tests/e2e/performance.spec.ts` 在 Chromium 實測 FCP、
  LCP 與 CLS。門檻取 Core Web Vitals 的「良好」界線（1.8s／2.5s／0.1），不是貼著
  本機現值——共用 CI runner 的時間本來就會抖動，貼著現值訂只會製造假紅燈。這個
  測試要抓的是「有人讓首屏慢了一個數量級」。

目前值（2026-07-26，gzip）：患者頁 53.5 KiB／32 個請求，工作臺 77.9 KiB／
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

### 預算調整紀錄

預算是棘輪：**調高必須是一次寫下理由的決定**，不是為了讓 CI 變綠而改的數字。

| 日期 | 項目 | 由 | 至 | 理由 |
| --- | --- | --- | --- | --- |
| 2026-07-27 | `/index.html` document | 11 KiB | 12 KiB | 帳號區新增權限委派的表單與授權碼清單。工作臺是登入後的內部工具，且只有 document 這一項越線（11.2 KiB），指令碼與樣式表用量未變。 |
| 2026-07-27 | `/privacy.html` | 新增 | 7 KiB total | 新的對外頁面。無指令碼、自成一份 3 KiB 的樣式表，實測 4.1 KiB。 |
| 2026-07-27 | `/privacy.html` image／total | 1 KiB／1 檔／7 KiB | 3 KiB／2 檔／8 KiB | 頁首加入診所標誌（與預約頁同一份 2.4 KiB 的 WebP，多數訪客已在預約頁快取過）。實測 total 7.4 KiB。 |

## 3. SBOM 與授權政策

`pnpm sbom` 產出 `sbom.cdx.json`（**CycloneDX 1.6**，git 忽略、CI 上傳為
artifact），取代先前只有我們自己看得懂的 `dependency-inventory.json`。每個元件
都有 purl，可直接餵給漏洞比對與授權稽核工具。

同一個腳本同時是**授權 gate**：

- 允許清單只收寬鬆授權；強 copyleft（GPL／AGPL）不得進入相依樹，需法務判斷。
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

分兩層：

1. **ESLint（已生效）**：`no-eval`／`no-new-func`／`no-script-url`／`no-proto`
   套用到所有檔案，`no-implied-eval` 在 JS 側明示、TS 側由型別感知版本涵蓋。
   擋的是單一檔案裡一眼可辨的動態求值 sink。
2. **CodeQL（設定完成，遠端狀態需看實際 run）**：`.github/workflows/codeql.yml`，
   `javascript-typescript` ＋ `security-extended`。它做的是跨檔案污染追蹤——例如
   「使用者輸入是否在沒有經過 `escapeHtml` 的情況下流進 `innerHTML`」，正是這個
   平台（瀏覽器層大量用樣板字串產生 HTML）最需要的分析。

Repository 已有 GitHub remote，workflow 會在 push／pull request／每週排程執行。
但私有 repository 是否能寫入 code-scanning results 仍取決於 repository 方案與
GitHub Advanced Security 權限；本機無法由 YAML 推論遠端是否成功。workflow 會在
每次 run 產生綁定 commit SHA 的 `codeql-verification-evidence` artifact（90 天）與
job summary。**上線證據包必須附實際 run 與掃描結果，而不只是設定檔的存在。**

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

| 指令 | 範圍 | 門檻 |
| --- | --- | --- |
| `audit:prod` | `--prod`，只看會出貨的相依 | **moderate 就擋** |
| `audit:all` | 全部，含 dev 工具鏈 | high／critical 才擋 |

**為什麼分兩層**（2026-07-26 決定）：把全部拉到 moderate，會被 firebase-tools
（CLI，不出貨）的傳遞相依長期壓在紅燈，最後一定演變成整條 audit 被關掉或被
ignore 洗到失效；維持單一 high 則相反——**出貨程式**多一筆 moderate 也不會有人
發現。分層之後，「哪一種漏洞會擋下發布」是寫在指令裡、可被檢驗的決定。

現況：`audit:prod` 只剩下面那筆已審視的 high 例外；三筆 moderate 全部落在
firebase-tools 這條 CLI 線上，逐筆覆核與解除條件記在 `pnpm-workspace.yaml`。

修補一律寫進版控（`pnpm-workspace.yaml` 的 `overrides`），不靠「本機剛好裝到新版」：

| 套件 | 問題 | 處置 |
| --- | --- | --- |
| `find-my-way` ≤9.6.0 | HTTP/2 DDoS。路徑 `apps/api > @nestjs/platform-fastify > fastify` | override 到 `^9.6.1`（實際解析為 9.7.0） |
| `brace-expansion` ≤5.0.7 | 不受限展開導致 OOM（GHSA-mh99-v99m-4gvg） | 5.x 那條線 override 到 `^5.0.8` |

**一筆已審視的例外**（`auditConfig.ignoreGhsas`）：同一個 GHSA 仍會標記
`brace-expansion@1.1.16` 與 `2.1.2`，但那兩個**已經是各自 major 上最新的維護版**
（dist-tag `maintenance-v1`／`maintenance-v2`）；advisory 的 patched 只寫
`>=5.0.8`，於是每一個較舊的 major 都被算進去，即使那條線根本沒有別的版本可升。
硬鎖到 5.x 會直接壞掉：`minimatch@3` 要 `^1`、`minimatch@5`／`6` 要 `^2`。殘留路徑
是 `firebase-admin > … > glob > minimatch`（apps/api 目前未部署）與
`firebase-tools > minimatch`（CLI，不出貨），而攻擊面是「把攻擊者控制的 glob 字串
丟進去展開」——這兩條路徑都不會。**解除條件寫在 `pnpm-workspace.yaml` 的註解裡。**

`pnpm audit` 會把它算成 `1 ignored` 印出來，所以這個例外不會安靜地爛掉。

**上線證據包必須附一次沒有任何 ignore 的完整 audit 輸出**，並逐筆說明當時的狀態。

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
| Lighthouse CI 完整報告（含 SEO／best-practices 分數） | 需要在 CI 跑完整 Lighthouse；目前以預算檔＋實測指標覆蓋最關鍵的部分；D-010 target 已核准，仍待 Stage 2 runner/change review |
| 依賴簽章／來源證明（provenance、sigstore） | 需要 CI 身分與金鑰管理；D-010 target 已核准，實作仍待 Stage 2 change review |
| 行動裝置螢幕閱讀器實測 | 需要實機，見 runbook §9 |
| 負載／soak／交易競爭測試 | Stage 6 項目；D-010 target 已核准，仍須另行授權並建立 cloud staging |

## 相關文件

- [正式化後續實作規劃](../product/production-readiness-delivery-plan-2026-07-23.md) — Web／Quality backlog 與 gate
- [正式環境目標架構](production-target-architecture-2026-07-23.md) — 架構邊界
- [人工無障礙測試 runbook](../runbooks/manual-accessibility-test.md)
- [基礎設施與維運計畫](infrastructure-and-operations-plan-2026-07-24.md) — 環境、備份、監控與部署把關

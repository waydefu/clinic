# 產品卓越稽核 v1（Product Excellence Audit v1）

**狀態：** 一次性、read-only、owner-authorized 的 dated 產品卓越稽核。**不是**
新的 Product Canon、產品實作 authority、D-series 決策或 Roadmap ID。
**日期：** 2026-09-02（Asia/Taipei）
**授權：** `waydefu/clinic` repository owner 於 2026-09-02 的明確 owner
authority（PVR Closeout → Product Excellence Audit v1）。
**基準：** `origin/main` `65d77ee`（含已合併的 Cloud Agent 開發環境設定 PR #45）。
**方法：** 從乾淨 Cloud Agent 環境（Node 24.18.0 / pnpm 11.9.0 / JDK 21）啟動已建置
的 `apps/web/dist` 與 `apps/api`，直接 render 目前產品、跨 5 個 viewport 取代表性
screenshots、以瀏覽器實際操作核心流程、並執行適用的 engineering-evidence gate。
未部署、未接真實資料、未收集任何真人使用者資料。
**證據等級（evidence rung，見 CLAUDE.md）：** 本稽核的自動化 gate 為
`GATE-VERIFIED`（本機）；產品品質判斷依下方 §3 的證據狀態逐項標示，未跑此 commit
的 `Verification evidence`（`NOT_RUN`）。

## 0. 一句話

目前已實作的合成產品在**工程品質與介面工藝**上明顯高於一般 pre-release 水準：
booking 三步流程、operations workbench、design token、鍵盤焦點與自動化無障礙證據
都紮實；但**產品卓越**受三件事壓低——(1) 目前完全沒有真人使用者證據（研究、實機、
報讀器、成效指標皆為 `NOT_EVIDENCED`）；(2) 核心服務依 Phase 1 gate 仍為未接線的
合成前端，functional suitability 因此受限；(3) 官網 surface 與 workbench 有一批
可修的 UX 缺口（clinic 版面稀疏與導覽無回饋、workspace 分頁無法 deep-link、多處缺
empty/loading 狀態）。嚴格評分 **63 / 100**。

## 1. 授權、範圍與方法

本稽核依 owner 2026-09-02 的明確授權執行，範圍與界定完全採用該訊息：一次性、
read-only、dated。它**不**建立新的 governance layer，也不假裝自己是既有 Roadmap
ID；依 document lifecycle，僅以本 dated review + 最小 index linkage 記錄為 dated
evidence。它不修改任何產品 code / CSS / feature / gate。

本稽核**不能**：關閉或推進任何 D-series、變更 Stage、授權 route 或 cloud backend、
授權真實資料、或改變 [decision register](../product/phase-1-decision-register.md)
與 [roadmap](../roadmap.md) 的狀態。既有 [企業級現代化稽核（2026-08-11）](2026-08-11-enterprise-modernization-audit.md)
仍是 security / infra / 架構軸的權威；本稽核刻意聚焦**產品／UX／視覺**軸，避免重複其
findings。

## 2. 稽核 surfaces 與執行環境

| Surface | 路徑 | 說明 |
| --- | --- | --- |
| 營運工作臺登入 | `/` | 合成測試登入（非真實身分驗證）。 |
| 官網首頁 | `/clinic` | 鼻功能／睡眠呼吸照護行銷站，含醫師與衛教頁。 |
| 線上預約 | `/booking` | 合成患者三步預約流程 + 查詢／取消。 |
| 隱私權政策 | `/privacy` | 告知草稿與「已閱讀」認證。 |
| 營運工作臺（登入後） | `/#…` | 主管 7 分頁 / 櫃台 3 分頁，含排班草稿發布、帳號、公告、稽核等。 |

執行環境：Cloud Agent VM，Node 24.18.0、pnpm 11.9.0、JDK 21；`WEB_ROOT=dist` 的
test-only server（`127.0.0.1:3100`）與 health-only API（`127.0.0.1:3000`）。所有輸入
均為明顯合成值；未輸入或依賴任何真實個資。

## 3. 證據等級 legend

每項重要判斷只標下列之一；`NOT_EVIDENCED` 不得計為 PASS。

- `VERIFIED` — 以自動化 gate 或可重跑測試在本 commit／本環境實測通過。
- `OBSERVED` — 由實際 render／互動的直接觀察（screenshots／操作）得到。
- `INFERRED` — 由 source 或行為推得，未直接量測。
- `NOT_EVIDENCED` — 目前沒有可接受證據；不得當作通過。
- `NOT_APPLICABLE` — 於目前 scope 不適用。

## 4. 外部 benchmark（2026-09-02 重新查證）

未宣稱任何 ISO／NHS／GOV.UK／Apple 認證；下列僅作為評估參照。

| 來源 | 執行當下狀態（已查證） |
| --- | --- |
| ISO 9241-210:2019 | 人本設計（HCD）第 2 版，2025 覆審確認為現行。 |
| ISO/IEC 25010:2023 | 產品品質模型第 2 版（2023-11）；九特性，usability→interaction capability、portability→flexibility，新增 safety。 |
| W3C WCAG 2.2 | W3C Recommendation，2024-12-12 發布；為現行建議採用版本。 |
| GOV.UK Service Standard | 依 PSBAR 2018／Equality Act 2010，要求 WCAG 2.2 AA，private／public beta 各需 accessibility audit。 |
| NHS service manual | 要求 WCAG 2.2 AA，並與 Accessible Information Standard 並行。 |
| Nielsen Norman Group | 10 項 usability heuristics（1994，近版仍現行）作為 heuristic 檢核基準。 |
| Apple HIG | 現行統一版，作為 secondary visual／interaction craft 參照。 |
| 台灣數位發展部（MODA）網站無障礙規範 | **現行為 110.07（對齊 WCAG 2.1、12 指引／78 準則）**；新版 **115.11（對齊 WCAG 2.2、13 指引／87 準則）自 2026-11-30 施行標章檢測**，既有標章效期三年不受換版影響。此為台灣本地無障礙的官方參照時點。 |

台灣本地時點對本專案的意義：以「執行當下」而言，本地官方標章基準仍是 WCAG 2.1 AA
（110.07）；WCAG 2.2 AA（115.11）將於 2026-11-30 成為標章檢測基準。此稽核以較高的
WCAG 2.2 為評估目標，與 GOV.UK／NHS 一致。

## 5. Anti-bias 聲明

下列**僅證明 engineering quality，不得直接加分**於產品卓越：CI 全綠、測試數量、
SAST、SBOM、provenance、branch protection、governance 文件完整、Agent 環境可啟動。
並且：axe PASS ≠ 真人 accessibility PASS；44px 命中 ≠ mobile UX 頂級；design token
存在 ≠ 視覺設計頂級；feature 存在 ≠ feature 有用；AI persona 觀察 ≠ user research。
本稽核據此把「工程證據」與「產品證據」分開計分，且對缺真人證據處一律標 `NOT_EVIDENCED`。

## 6. 視覺稽核證據

- **Viewport matrix（VERIFIED render）：** `/`、`/clinic`、`/booking`、`/privacy` 於
  narrow-mobile 360、standard-mobile 390、tablet 768、laptop 1366、wide-desktop
  1920 共 20 張全頁 screenshots（HTTP 200）；另擷取登入後 workbench（主管
  overview／appointments／schedule／accounts、櫃台 mobile）5 張。附於本稽核 PR。
- **互動 walkthrough（OBSERVED）：** 以瀏覽器實際操作 clinic 捲動、booking 三步 +
  成功頁 + 查詢／取消 modal、privacy 認證，及 workbench 主管／櫃台雙角色、主題切換與
  鍵盤 Tab；影片附於本稽核 PR。
- **自動化證據（VERIFIED，本機）：** `check:ui`、`check:pages`（5 進入點／8 資料驅動
  路由）、`check:tokens`（寫死色／字重／圓角／斷點皆 0）、`check:perf`（5 進入點 gzip
  預算內）、`test:unit`（1200/1200）、accessibility e2e group（17/17；axe serious／
  critical＝0 於 `/`、`/booking`、`/privacy`、`/clinic`、鼻功能內頁與登入後預約清單；
  forced-colors 焦點保留；skip-link；登入後焦點落點；通知 popover Esc；週檢視可聚焦
  具名群組；no-JS 後備：電話／地址／門診時間可得、工作臺說明自己為何為空、
  `/patient.html` 301→`/booking`）。

## 7. 逐維度評估（18 dimensions）

| # | 維度 | 分數/5 | 證據 | 摘要 |
| --- | --- | ---: | --- | --- |
| 1 | User needs／service definition | 3.0 | INFERRED | 服務定位（鼻功能／睡眠呼吸）與內容邊界清楚且刻意；但真實 user needs 未經研究驗證。 |
| 2 | Core journey effectiveness | 3.5 | OBSERVED | booking 三步 + 成功 + 查詢／取消完整可用、自動前進流暢；clinic→booking CTA 串接良好。 |
| 3 | Efficiency／cognitive load | 3.5 | OBSERVED | 步驟切分合理、鍵盤快捷（`/` 搜尋、Alt+N）；workbench 資訊密度偏高但有分頁。 |
| 4 | Interaction quality | 3.0 | OBSERVED | 按鈕層級一致、pending/disabled 有處理；clinic 導覽項點擊缺明確回饋。 |
| 5 | Error prevention／recovery | 3.0 | OBSERVED | booking 生日欄 inline 警示、雙 consent 必填、批次動作 disabled；但 network/failure error 態未見。 |
| 6 | Visual hierarchy／visual craft | 3.5 | OBSERVED | 標題、eyebrow、卡片層級清楚、品牌綠一致；clinic 於寬螢幕偏稀疏。 |
| 7 | Typography／spacing／density／composition | 3.5 | OBSERVED/VERIFIED | 排版與量表克制、token 化間距（`check:tokens` 綠）；section padding（clamp 至 7.5rem）在大螢幕略空。 |
| 8 | Design-system consistency | 4.0 | VERIFIED | `check:tokens` 0 寫死值；patient 與 workbench 共用色彩/元件/主題語彙一致。 |
| 9 | Mobile／responsive task quality | 3.5 | OBSERVED | 5 寬度皆合理堆疊、mobile 主題改為齒輪、櫃台 mobile 3 分頁；實機/虛擬鍵盤未驗。 |
| 10 | WCAG 2.2 engineering evidence | 4.0 | VERIFIED | axe serious/critical＝0（4 對外頁 + 內頁 + 登入後清單）、forced-colors 焦點、skip-link、no-JS 後備皆自動化通過。 |
| 11 | Human accessibility evidence | 0.0 | NOT_EVIDENCED | 無真人報讀器、實機、放大、真實對比硬體量測。**不計為通過。** |
| 12 | Content／terminology | 3.0 | OBSERVED | 用語專業、測試/草稿標示清楚；工作臺首頁公告有一句語意粗糙、像除錯字串。 |
| 13 | Functional suitability | 2.5 | INFERRED | 依 Phase 1 gate，核心服務為未接線合成前端（無真後端/身分/持久化），故 real-world 功能適用性受限；這是 blocked-by-authority，非缺陷。 |
| 14 | Authorized-but-missing vs blocked-by-authority | 3.0 | INFERRED | 多數缺口（route、真資料、Calendar、payroll）為 D-series/Phase 1 gate 之 blocked-by-authority；authorized-but-missing 主要落在 UX polish（見 §10）。 |
| 15 | Performance／perceived responsiveness | 3.0 | VERIFIED/NOT_EVIDENCED | `check:perf` gzip 預算內、主題切換即時；但無 RUM/CrUX/INP field 資料。 |
| 16 | Missing empty/loading/error/success/permission states | 2.5 | OBSERVED | booking 成功態與部分 empty 態佳、no-JS 有解釋；workbench 多區缺 loading skeleton 與友善 empty，account 建立後缺回饋。 |
| 17 | Product outcome metrics | 0.0 | NOT_EVIDENCED | 無轉換率、完成率、放棄率、任務時間等成效指標。**不計為通過。** |
| 18 | Human usability research | 0.0 | NOT_EVIDENCED | 無真人可用性測試/訪談/現場觀察。**不計為通過。** |

## 8. 嚴格評分（strict scoring）

分數為本專案「目前已實作合成產品」的產品卓越適配度，非市場排名；嚴格反映缺真人與
成效證據。

| 面向 | 分數/100 | 權重 | 依據 |
| --- | ---: | ---: | --- |
| UI 介面實作品質 | 76 | 15% | 結構清楚、元件/狀態處理成熟、token 化。 |
| UX 使用者旅程有效性 | 68 | 20% | booking 強；clinic 導覽回饋與 workbench 狀態缺口拉低。 |
| Visual 視覺工藝 | 72 | 12% | 一致克制；clinic 寬螢幕稀疏、登入頁大量留白。 |
| Function 功能適用性 | 55 | 18% | 合成流程可用，但核心服務未接線（gate 所致）。 |
| Accessibility 無障礙 | 66 | 15% | 工程證據強（~80），真人證據為 0 → 綜合下修。 |
| Mobile 行動/響應式 | 70 | 10% | 響應式良好；實機/AT 未驗。 |
| Product Evidence 產品證據 | 24 | 10% | 研究/成效/真人可用性幾乎全缺。 |

**加權總分 ≈ 62.8 → Overall 63 / 100。**

上限主要被兩件事壓住：`NOT_EVIDENCED` 的真人與成效面（維度 11、17、18），以及
Phase 1 gate 造成的功能未接線（維度 13）。若補齊真人證據且核心服務在授權後接線，
同一介面品質可支撐明顯更高的分數。

## 9. Top 5 gaps

1. **完全缺真人證據**（研究、實機、報讀器、成效指標）——最大 ceiling。`NOT_EVIDENCED`。
2. **官網 `/clinic` 視覺密度與導覽回饋**：寬螢幕 section 間距過空（reveal-on-scroll +
   大 padding），導覽項點擊缺明確 wayfinding 回饋。`OBSERVED`。
3. **workbench 缺 empty/loading 狀態與動作後回饋**（如個管 0 筆、授權碼、建立帳號後
   未顯示產生的憑證與成功訊息、無 loading skeleton）。`OBSERVED`。
4. **workspace 分頁無法 deep-link／重新整理不還原**：直接載入 `#appointments`/
   `#schedule` 會落回營運首頁（三張主管截圖內容相同）。影響可分享連結、重新整理與
   上一頁。`OBSERVED`。
5. **功能適用性受未接線限制**：核心服務目前為合成前端；這是 blocked-by-authority，
   但也代表真實產品價值尚未能量測。`INFERRED`。

## 10. P0／P1 findings

P0（需先處理才談得上真實產品卓越；多為證據或授權層）：

- **P0-1 真人可用性與無障礙證據**：至少一輪 moderated usability + 真人報讀器/實機
  AT，覆蓋 booking 與 workbench critical flows。`NOT_EVIDENCED`。
- **P0-2 成效量測基線**：定義並埋設（合成 staging 上）任務完成率、放棄點、任務時間、
  Web Vitals field 樣本的量測方法（不含 PII）。`NOT_EVIDENCED`。
- **P0-3 功能適用性受 gate 限制**：核心 route/真資料為 D-series/Phase 1 gate 所擋；屬
  blocked-by-authority，非本稽核可解。`INFERRED`。

P1（authorized-but-missing 的 UX polish，屬前端、可在不動 gate 下改善）：

- **P1-1 `/clinic` 版面密度**：收斂寬螢幕 section 垂直留白、確保 reveal-on-scroll 在
  reduced-motion / 無捲動時仍有內容（目前 fallback 已直接顯示，惟大 padding 使其顯空）。
- **P1-2 clinic 導覽回饋**：導覽項需明確 active/前往回饋（目前點擊如同無回饋）。
- **P1-3 workspace 分頁 deep-link/還原**：由 URL hash 還原目前分頁，支援重新整理與
  分享連結。
- **P1-4 workbench empty/loading 狀態**：補 loading skeleton 與友善 empty；建立帳號後
  以成功回饋顯示產生憑證（附複製與妥善保存提示）。
- **P1-5 週檢視水平捲動 affordance**：加邊緣漸層或 ‹ › 提示。
- **P1-6 文案**：修正工作臺首頁像除錯字串的公告句。
- **P1-7 skip-link 聚焦時與 logo 重疊**（與已知 NHS 服務的同類問題相同）：聚焦態需不
  遮蔽品牌標記。

## 11. 目前無法證明（缺真人 evidence）

以下維度目前一律 `NOT_EVIDENCED`，本稽核明確不宣稱通過：

- 真人可用性（任務成功率、困惑點、滿意度）。
- 真實輔具（報讀器、放大、語音控制）與實體行動裝置、虛擬鍵盤行為。
- 真實硬體對比度量測（axe 的對比檢查不等於真機量測）。
- 產品成效指標（轉換、完成、放棄、留存）。
- 真實負載下的感知效能與 Web Vitals field 資料。

## 12. Transformation sequence（建議順序，非授權）

1. **建立產品證據能力**（合成 staging，不含 PII）：埋設任務層級遙測與 Web Vitals
   field 量測方法 → 讓後續每次改動可被量測（呼應 2026-08-11 稽核 SRE-R02／WEB-30-02）。
2. **一輪真人可用性 + AT 稽核**：以 booking 與 workbench critical flows 取得 P0-1 證據。
3. **P1 前端 polish 批次**（不動 gate）：clinic 密度/導覽回饋、workspace deep-link、
   workbench empty/loading/回饋、水平捲動 affordance、文案、skip-link 聚焦。
4. **無障礙對齊 WCAG 2.2 / MODA 115.11**（2026-11-30 生效）：把新 SC（如 2.4.11 焦點
   不被遮、2.5.8 目標尺寸）納入自動化與人工檢核。
5. **功能適用性**：待 D-series/Phase 1 gate 授權後，依既有 Roadmap（GOV-R01 →
   correctness → identity/RBAC → synthetic vertical slice）接線核心服務並重量測。

## 13. 下一個建議 implementation slice（唯一，且本稽核不實作）

**只推薦一個**：**在 `apps/web` 為 operations workbench 補齊 workspace 分頁的
URL-hash deep-link 與重新整理還原（P1-3）**。

理由：它是純前端、可逆、不動任何 gate/合約/gate 授權；影響日常操作者的實際體驗
（分享連結、重新整理、上一頁）；驗收明確（載入 `#appointments`/`#schedule` 應還原對應
分頁而非落回營運首頁，並保有既有的 role-based 分頁可見性與焦點行為）；且與 booking
之外的既有 UI 一致，風險最小。此為建議，非授權；實作仍須依 repository 一般流程開獨立
PR、加對應測試並跑 UI 相關 gate。

## 14. 未涵蓋與限制

- 未部署、未接真資料、未觸任何 production/cloud/Calendar/Firestore。
- 未跑此 commit 的遠端 `Verification evidence`（CI）；自動化為本機 `GATE-VERIFIED`。
- 未評估 security/infra/架構軸的既有 findings（見 2026-08-11 稽核）。
- 視覺 screenshots 的 mid-page 空白部分為 reveal-on-scroll 之靜態擷取假影，已於 §6/§9
  與實際互動觀察區分。

## 15. 下一位接手者的第一步

1. 本稽核為 dated evidence；不改變 Stage、D-series、Roadmap 或任何 gate 授權。
2. 若要推進 §13 的 slice，開獨立 `cursor/…` 分支、加測試、跑 UI 相關 gate，並依一般
   流程開 PR；本稽核不授權任何實作。
3. PVR Closeout 於本輪為 `BLOCKED — execution environment lacks authorized GitHub
   Administration write`（owner authority 具備、僅執行環境無 Administration write）；
   待具 Administration write 的環境或由 owner 於 GitHub 介面啟用後再收束，且不得於
   committed docs 寫死一次性 API snapshot。
4. 目前 Stage 位置是否改變：**否**。

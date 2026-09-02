# 產品卓越稽核 v1（Product Excellence Audit v1）

**狀態：** 一次性、read-only、owner-authorized 的 dated 產品卓越稽核，並為兩份獨立
產出（PR #47 與 PR #48）的 **reconciliation／證據整合**單一權威版本。**不是**新的
Product Canon、產品實作 authority、D-series 決策或 Roadmap ID。
**日期：** 2026-09-02（Asia/Taipei）
**授權：** `waydefu/clinic` repository owner 於 2026-09-02 的明確 owner authority
（PVR Closeout → Product Excellence Audit v1；以及 #47/#48 reconciliation）。
**基準（current main）：** `origin/main` `b180082`（含已合併的 PR #45 環境設定與
PR #49 SECURITY.md PVR intake）。
**證據來源分工：** current main 是 runtime／source 查證的唯一真實；PR #47
（`cursor/product-excellence-audit-v1-a4ac`）與 PR #48 前身僅為證據來源。所有 #47
獨有 finding 均已對 current main 重新查證後才納入或拒絕。
**方法：** 由乾淨 Cloud Agent 環境（Node 24.18.0 / pnpm 11.9.0 / JDK 21）啟動已建置
的 `apps/web/dist` 與 `apps/api`，直接 render、跨 5 個 viewport 取代表性 screenshots、
以瀏覽器實際操作核心流程、read-only 檢視 source，並跑適用 gate。未部署、未接真實
資料、未收集任何真人使用者資料。
**證據等級：** 自動化 gate 為本機 `GATE-VERIFIED`；產品判斷依 §3 逐項標示。

## 0. 一句話

已實作的合成產品在**工程與介面工藝**上明顯高於一般 pre-release：booking 三步、
operations workbench、design token、鍵盤焦點與自動化無障礙證據都紮實。但把兩份獨立
稽核的證據整合後，**產品卓越**被四件事壓低——(1) 完全沒有真人證據（研究／實機／
報讀器／成效指標皆 `NOT_EVIDENCED`）；(2) 一組已對 current main 證實的 **P0 使用者
傷害**：公開「找不到頁面／回到首頁」把迷路的公開使用者導向印有測試帳密的員工登入頁
（且 repo 為 public），患者自助取消直接呼叫 `cancel`、與 domain/RBAC 的
`request_cancellation` 契約牴觸；(3) 一批受 D-series/domain authority 卡住的
語意矛盾（20 分鐘 vs D-005「10:00」、60 天 vs D-004「1 個月」、`止鼾/醫美` vs 鼻科
內容邊界）；(4) 一批可修的前端缺口（workbench 分頁無法 deep-link、多處缺
empty/loading/成功回饋、clinic 版面稀疏與導覽無回饋）。**重算後嚴格評分 59 / 100。**

## 1. 授權、範圍與方法

本稽核依 owner 2026-09-02 授權執行：一次性、read-only、dated；同時是 PR #47 與
PR #48 的 reconciliation，產出**單一** `docs/reviews/2026-09-02-product-excellence-audit-v1.md`。
不建立新的 governance layer，不假裝是既有 Roadmap ID，僅以本 dated review + 最小 index
linkage 記錄。**不修改任何產品 code／CSS／feature／gate**。

不能：關閉或推進任何 D-series、變更 Stage、授權 route／cloud backend／真實資料、或改變
[decision register](../product/phase-1-decision-register.md) 與
[roadmap](../roadmap.md) 狀態。既有
[企業級現代化稽核（2026-08-11）](2026-08-11-enterprise-modernization-audit.md)仍是
security／infra／架構軸權威；本稽核聚焦**產品／UX／視覺**軸。

**Reconciliation 原則：** 不以「哪份報告好看」取捨，而以證據取捨；#47 與 #48 皆非
自動勝方。#48 提供較廣的 rendered-product 證據（跨 viewport／workbench／互動影片、
明確 evidence state、維度分數）故作為結構基底；#47 提供數個 #48 遺漏且已證實的
P0/P1 findings（見 §7）。分數重算，不取平均。

## 2. 稽核 surfaces 與執行環境

| Surface | 路徑 | 說明 |
| --- | --- | --- |
| 營運工作臺登入 | `/` | 合成測試登入（非真實身分驗證）；卡片印有測試帳密。 |
| 官網首頁 | `/clinic`（+ `/clinic/doctors`、`/clinic/nasal/*`） | 鼻功能／睡眠呼吸照護行銷站。 |
| 線上預約 | `/booking` | 合成患者三步流程 + 查詢／取消。 |
| 隱私權政策 | `/privacy` | 告知草稿與「已閱讀」認證。 |
| 找不到頁面 | `/404.html` | 品牌化錯誤頁（recovery surface）。 |
| 營運工作臺（登入後） | `/#…` | 主管 7 分頁 / 櫃台 3 分頁。 |

環境：Cloud Agent VM，Node 24.18.0、pnpm 11.9.0、JDK 21；`WEB_ROOT=dist` test-only
server（`127.0.0.1:3100`）與 health-only API（`127.0.0.1:3000`）。輸入皆合成。

## 3. 證據等級 legend

每項判斷標下列之一；`NOT_EVIDENCED` 不得計為 PASS。並保留 confidence
（`HIGH` / `MEDIUM` / `LOW`）。獨立雙稽核同時觀察到同一問題只提高 confidence，
**不會**把 observed UX 問題升級為真人可用性證據。

- `VERIFIED` — 自動化 gate／可重跑測試／source 在 current main 實證。
- `OBSERVED` — 由實際 render／互動直接觀察。
- `INFERRED` — 由 source 或行為推得，未直接量測。
- `NOT_EVIDENCED` — 無可接受證據；不得當通過。
- `NOT_APPLICABLE` — 於目前 scope 不適用。

## 4. 外部 benchmark（2026-09-02 重新查證）

未宣稱任何 ISO／NHS／GOV.UK／Apple／MODA 認證。

| 來源 | 執行當下狀態 |
| --- | --- |
| ISO 9241-210:2019 | 人本設計（HCD）第 2 版；2025 覆審確認為現行（stage 90.93）。 |
| ISO/IEC 25010:2023 | 產品品質模型第 2 版；九特性，usability→interaction capability、portability→flexibility，新增 safety。 |
| W3C WCAG 2.2 | W3C Recommendation，TR 頁 2024-12-12；亦以 ISO/IEC 40500:2025 發布；WCAG 3 仍為 Working Draft。axe ≠ conformance。 |
| NHS Service Standard | 2026-01 更新；GOV.UK 14 點 + 3 健康點（15 culture of care、16 clinically safe、17 interoperable）；要求 WCAG 2.2 AA。健康 lens，非台灣法規。 |
| GOV.UK Service Standard | 14 點（point 14 於 2026-01-29 更新）；point 2「圍繞 user needs 設計，而非既定實作」。 |
| Nielsen Norman Group | 10 usability heuristics（2024-01 覆審；自 1994 未變）。 |
| Apple HIG | 現行統一版設計原則；secondary craft lens，不得把站台做成 iOS。 |
| 台灣 MODA 網站無障礙規範 | **現行 110.07（WCAG 2.1、12 指引／78 準則）**；新版 **115.11（WCAG 2.2、13 指引／87 準則）自 2026-11-30 施行標章檢測**；既有標章效期三年。以 forward-looking 對待，不宣稱標章。 |

## 5. Anti-bias 聲明

下列**僅證明 engineering quality，不得加分**於產品卓越：CI 全綠、測試數量、SAST、
SBOM、provenance、branch protection、governance 文件完整、Agent 環境可啟動。並且：
axe PASS ≠ 真人 AT PASS；44px 命中 ≠ mobile UX 頂級；design token 存在 ≠ 視覺頂級；
feature 存在 ≠ feature 有用；AI persona／Playwright 模擬 ≠ user research／實機。
本稽核不因「多了一份 Agent 報告同意」而升級證據等級——獨立觀察只提高 confidence。

## 6. 視覺與互動證據

- **Viewport matrix（VERIFIED render）：** `/`、`/clinic`、`/booking`、`/privacy` 於
  360／390／768／1366／1920 共 20 張全頁 + 登入後 workbench 5 張，附於本稽核 PR。
- **互動 walkthrough（OBSERVED）：** booking 三步 + 成功 + 查詢／取消、clinic 捲動、
  privacy 認證、workbench 主管／櫃台雙角色、主題與鍵盤，影片附於 PR。
- **#47 rendered 證據（來源）：** PR #47 另提交了 `findings.json` 與跨 viewport／
  workbench／404／login PNG（`docs/reviews/assets/…`）。本 reconciliation 以其為證據
  來源，資訊併入本文件；為維持 #48 最小 diff（僅 md + index），未把該 assets 複製進來。
- **自動化證據（VERIFIED，本機）：** `check:ui`、`check:pages`（5 進入點／8 路由）、
  `check:tokens`（0 寫死值）、`check:perf`、`test:unit`（1200/1200）、accessibility e2e
  （17/17；axe serious／critical＝0 於四對外頁 + 鼻科內頁 + 登入後清單；forced-colors
  焦點；skip-link；no-JS 後備）。

## 7. Reconciliation 矩陣（#47 每個 material finding 的處置）

處置碼：`ALREADY_IN_48` / `UNIQUE_VALID` / `DUPLICATE_STRONGER_IN_48` /
`CONFLICTS_WITH_48` / `REQUIRES_REVALIDATION` / `INVALID`。所有 `UNIQUE_VALID` 均已對
current main 重新查證。

| #47 ID | 摘要 | current-main 查證 | 處置 | 併入後 ID |
| --- | --- | --- | --- | --- |
| PX-INT-004 | 未知 URL → 空白 404（本機 `bytes=0`）；Hosting 是否自動送 `404.html` 待生產證據 | VERIFIED（`curl /not-a-real-page`→404/0）；Hosting 段 `REQUIRES_PRODUCTION_EVIDENCE` | UNIQUE_VALID | R-P0-1 |
| PX-JRN-001 | 品牌 404「回到首頁」→ `/` 員工登入；`/` 印測試帳密；repo public | VERIFIED（`404.html` href="/"；`index.html` 帳密；visibility public） | UNIQUE_VALID | R-P0-1 |
| PX-INT-001 | 患者自助取消呼叫 `cancel`（釋放時段），與 RBAC/契約 `request_cancellation` 牴觸 | VERIFIED（`patient-booking-management.js:125` 'cancel'；`rbac.ts` patient=request_cancellation） | UNIQUE_VALID | R-P0-2 |
| PX-INT-002 | `SELF_CANCEL_CUTOFF_MINUTES=20` vs D-005 記錄業主方向「10:00」 | VERIFIED；D-005 **pending**（業主方向非核准 Canon） | UNIQUE_VALID（blocked） | R-P0-3 |
| PX-FUNC-001 | `SYNTHETIC_WINDOW_DAYS=60` vs D-004 記錄業主方向「1 個月」 | VERIFIED；D-004 **pending** | UNIQUE_VALID（blocked） | R-P1-4 |
| PX-CONTENT-001/003 | booking `止鼾/醫美` vs 鼻科官網四頁；官網明確排除醫美類別頁 | VERIFIED（`constants.js` PATIENT_SERVICES） | UNIQUE_VALID | R-P1-5 |
| PX-CONTENT-002 | 櫃台 `療程` 欄呈現 `appointment.id`（來源 <id>） | VERIFIED（`admin-view.js`） | UNIQUE_VALID | R-P1-6 |
| PX-JRN-002 | 無患者自助改期，只能取消+重訂 | VERIFIED | UNIQUE_VALID | R-P1-7 |
| PX-JRN-003 | overview「900/899 可預約時段」是 60 天存量，非今日工作 | OBSERVED（#48 亦見 900/899） | UNIQUE_VALID | R-P1-8 |
| PX-A11Y-002 | 醫療術語與英文 eyebrow（DAILY OVERVIEW/NEXT UP）與患者中文並置 | OBSERVED/INFERRED | UNIQUE_VALID | R-P2 |
| PX-MOB-002 | 320 booking 首屏在 初診 選擇前被 banner 佔滿 | OBSERVED | UNIQUE_VALID | R-P2 |
| PX-VIS-001 | clinic C6 視覺 baseline 未刷新（stale approval） | OBSERVED | UNIQUE_VALID | R-P2 |
| PX-VIS-002 / PX-DS-002 | 三個 surface 兩套視覺語彙、primitives 未收斂為單一產品 | OBSERVED | UNIQUE_VALID（與 #48 clinic 視覺部分重疊） | R-P2 |
| PX-FUNC-002 | `physician` 空權限、consultant 未實作 | VERIFIED；blocked（D-006） | UNIQUE_VALID（blocked） | R-P2 |
| PX-INT-003 | 安全 banner 疊加與 Step 1／查詢取消競爭注意力 | OBSERVED | UNIQUE_VALID | R-P2 |
| PX-DS-001 | CSS 字面值 ratchet debt | VERIFIED | UNIQUE_VALID | R-P3 |
| PX-NEED-001 | 無 user research | VERIFIED（缺口） | ALREADY_IN_48 | 併入 §12 |
| PX-A11Y-001 / A11Y-003 | 無真人 AT／人工矩陣未跑 | VERIFIED（缺口） | ALREADY_IN_48 | 併入 §12 |
| PX-METRIC-001 | 無產品成效指標 | NOT_EVIDENCED | ALREADY_IN_48 | 併入 §12 |
| PX-PERF-001 | 無 RUM/CrUX field | NOT_EVIDENCED | ALREADY_IN_48 | 併入 §11 |

**#48 獨有、#47 未涵蓋（保留）：** workspace 分頁無法 deep-link／重新整理不還原
（VERIFIED，見 §11 R-P1-9）；workbench 多區缺 empty/loading/成功回饋（OBSERVED，
R-P1-10）；skip-link 聚焦時與品牌標記重疊（OBSERVED，R-P3）；週檢視水平捲動缺
affordance（OBSERVED，R-P2）；工作臺首頁公告文案粗糙（OBSERVED，R-P2）。

## 8. 逐維度評估（capped scorecard，12 維）

沿用 #47 的上限（caps）：無 user research → A ≤ 6；無受控可用性 → B ≤ 8；無真人 AT →
G ≤ 8；無成效指標 → L ≤ 3.5。rendered 視覺證據存在（C6 + 本次），E 不封頂於 7。相對
#47，本 reconciliation 僅調整 **D（互動與復原）6.0 → 5.5**，反映併入的 #48 互動/旅程
債（分頁無法 deep-link、workbench 缺 empty/loading/成功態、skip-link 聚焦重疊）。

| ID | 維度 | 分數 | Cap | 說明 |
| --- | --- | --- | --- | --- |
| A | User needs & service definition | 5.0 / 10 | 6 | 角色切分是真決策；需求證據為業主敘事。 |
| B | Core journey effectiveness | 7.0 / 12 | 8 | book/lookup 完整；recovery/reschedule/front-door 失敗。 |
| C | Efficiency & cognitive load | 6.0 / 10 | — | 櫃台密度為意圖；900 存量誤導；banner 疊加。 |
| D | Interaction quality & recovery | 5.5 / 10 | — | 本地回饋強；cancel/404 語意錯；deep-link/empty-state/ skip-link 債。 |
| E | Visual design & craft | 6.5 / 10 | — | booking 工藝真實；clinic baseline stale；兩套語彙。 |
| F | Design-system maturity | 5.5 / 8 | — | token/gate 強；多 CSS 世界。 |
| G | Accessibility & inclusion | 6.5 / 10 | 8 | 自動化強；無真人 AT；健康識讀。 |
| H | Mobile / responsive | 4.5 / 7 | — | booking 佳；workbench 375、320 擁擠；無實機。 |
| I | Content & terminology | 3.5 / 5 | — | 台灣中文佳；catalogue 分裂；療程欄 id。 |
| J | Functional suitability | 5.0 / 7 | — | 合成範圍內大致完備；cancel/horizon/reschedule/ catalogue 扣分；payroll/Firestore 不罰。 |
| K | Performance & responsiveness | 2.5 / 4 | — | 僅實驗室預算。 |
| L | Product evidence & improvement | 1.5 / 7 | 3.5 | 測試 ≠ 成效。 |
| | **合計** | **58.5 → 59 / 100** | | 帶區間：significant product debt（下緣）。 |

## 9. 嚴格評分（single score）

**Overall 59 / 100。** 依 §8 逐列相加（58.5，四捨五入 59），非平均。

- vs #48 的 63：**−4**。原因：#48 未計入兩項已證實的 **P0 使用者傷害**（公開 front-door
  導向員工登入＋印出帳密、患者取消語意），且缺 #47 的 capped 方法學。
- vs #47 的 61：**−2**。原因：更正 #47 自身的加總（其逐列實際約 59.5、非 61），再減
  #48 併入的互動/旅程債（D 6.0→5.5）。

**單一 rationale：** 採 #47 的嚴格 capped 12 維 scorecard 為計算基底，對 current main
證實其全部 P0，併入 #48 的 rendered 跨 viewport 證據（提高 confidence、不加分）與 #48
獨有互動債（降 D 0.5），並更正 #47 的加總誤差 → 59/100。

依 owner 要求的分面（由上表推導）：

| 面向 | 對應 | 概值 |
| --- | --- | --- |
| UI 介面實作品質 | 工程/互動實作 | 高於產品面，但受 front-door/cancel 缺陷牽制（~72） |
| UX 使用者旅程 | A+B+C+D＝23.5/42 | ~56 |
| Visual 視覺 | E | 65 |
| Function 功能適用性 | J（合成範圍） | ~71，惟 cancel/horizon/catalogue/reschedule 債 |
| Accessibility 無障礙 | G | 65（真人證據為 0） |
| Mobile 行動 | H | ~64（無實機） |
| Product Evidence 產品證據 | L | ~21 |

## 10. Top 5 gaps（reranked）

1. **公開 front-door／404 復原把迷路使用者導向員工登入頁（印有測試帳密、public repo）。**
   R-P0-1。VERIFIED / HIGH。使用者傷害 + 資安觀感最重且**可立即處理**（wayfinding，不需
   D-series）。
2. **患者自助取消語意與契約牴觸**（`cancel` 立即釋放時段 vs `request_cancellation`）。
   R-P0-2。VERIFIED / HIGH。`REQUIRES_DOMAIN_AUTHORITY`（D-005 pending）。
3. **完全缺真人證據**（研究／實機／報讀器／成效）。§12。最大分數上限。
4. **政策數值與 code 分歧**：取消 20 分鐘 vs D-005「10:00」、預約 60 天 vs D-004「1 個月」。
   R-P0-3 / R-P1-4。VERIFIED；`REQUIRES_DOMAIN_AUTHORITY`。
5. **服務 catalogue 分裂與櫃台辨識風險**：`止鼾/醫美` vs 鼻科官網；`療程` 欄夾 `appointment.id`。
   R-P1-5 / R-P1-6。VERIFIED。

## 11. P0 / P1 / P2 / P3 backlog（severity 與 implementation-readiness 分開）

實作難度不決定 severity。下列同時標 severity 與是否**現在可實作**（未被 D-series/domain
authority 卡住）。

**P0**

- **R-P0-1** 公開 404／front-door 復原一致性（未知路徑送品牌 404；復原指向 `/clinic`／
  `/booking` 而非員工 `/`）。sev 4；**可立即實作**（wayfinding，無 D-series）。VERIFIED。
- **R-P0-2** 患者取消改用 `request_cancellation`（不立即釋放時段），對齊 RBAC/ops 契約。
  sev 4；**blocked**（D-005 pending，須先定政策）。`REQUIRES_DOMAIN_AUTHORITY`。
- **R-P0-3** 取消 cutoff 對齊 D-005 核准值（現 20 分鐘 vs 記錄方向 10:00）。sev 4；
  **blocked**（D-005 pending）。不得自選數值。

**P1**

- **R-P1-4** 預約 horizon 對齊 D-004（現 60 天 vs 記錄方向 1 個月）。blocked。
- **R-P1-5** 單一服務 catalogue（clinic 與 booking 一致；醫美邊界明確）。blocked if 醫美 屬意圖。
- **R-P1-6** 櫃台 `療程` 欄移除 `appointment.id`（辨識風險）。可立即實作。
- **R-P1-7** 患者改期路徑（自助或明確電話/櫃台）。政策先行。
- **R-P1-8** overview 指標語意＝今日工作（非 60 天存量）。可立即實作。
- **R-P1-9** workspace 分頁 URL-hash deep-link／重新整理還原。可立即實作。
- **R-P1-10** workbench empty/loading/成功回饋（含建立帳號後顯示產生憑證）。可立即實作。
- **R-P1-11** user research + AT 證據能力（§12）。`REQUIRES_HUMAN_EVIDENCE`。
- **R-P1-12** 成效指標設計（非實作；privacy 先行）。`REQUIRES_OWNER_AUTHORITY`。

**P2** — R-P2 群組：clinic 視覺密度與導覽回饋、兩套視覺語彙/primitives、320 booking
banner、workbench 375 thumb-first、週檢視水平捲動 affordance、公告文案、英文 eyebrow/
醫療術語、physician/consultant blocked、無 RUM。

**P3** — skip-link 聚焦重疊；CSS ratchet debt。

## 12. 目前無法證明（缺真人 evidence）

一律 `NOT_EVIDENCED`，不宣稱通過：真人可用性（成功率/困惑/滿意）、真實輔具與實機/
虛擬鍵盤、真實硬體對比量測、產品成效指標（轉換/完成/放棄/留存）、真實負載下的感知
效能與 Web Vitals field 資料。AI persona 與 Playwright 模擬**不是** research。

## 13. Transformation sequence（建議，非授權）

1. **公開復原/ front-door**（本稽核 §14 的 slice；P0 且不需 D-series）。
2. **解鎖政策**：D-005（取消語意與 cutoff）、D-004（horizon）取得 qualified approval，或
   明確接受合成 20 分鐘/60 天為 test-only 並標示，使 UI 不被誤認為診所政策。
3. **單一服務 catalogue**（clinic + booking；domain authority）。
4. **櫃台「找對人」**（療程欄去 id；overview＝今日）。
5. **真人可用性 + AT**（合成資料）取得 P0/P1 人因證據。
6. **成效指標**（privacy 先行，合成 proxy 先做）。
7. **視覺系統收斂**（在旅程正確之後；非 naming，PONYTAIL 不適用）。

## 14. 下一個 implementation slice（唯一，且本稽核不實作）

**改為：公開 404／front-door 復原一致性（R-P0-1）。**（取代 #48 前身建議的 workspace
deep-link；理由見下。）

| 項 | 內容 |
| --- | --- |
| 為何是第一個 | P0、已對 current main 證實、**不需 D-series/domain authority**（純 wayfinding）；迷路的公開使用者目前會抵達印有測試帳密的員工登入頁（public repo）。使用者價值與風險皆高於 workspace deep-link（櫃台便利，R-P1-9）。取消類 P0（R-P0-2/3）雖更嚴重但被 D-005 卡住、現在不可實作。 |
| 使用者結果 | 打錯網址或走到 404 的公開使用者，最終抵達 `/clinic` 或 `/booking`，永不抵達員工工作臺。 |
| findings | R-P0-1（PX-INT-004 + PX-JRN-001）、heuristic H4/H9。 |
| scope | 本機 test server 對未知路徑送出品牌 `404.html`（對齊 Hosting）；把 `404.html`「回到首頁」由 `/` 改為 `/clinic`，保留「前往線上預約」→ `/booking`；加測試：`/not-a-page` 為品牌頁且不連向員工登入。 |
| 排除 | 不改 `/` 作為工作臺 URL（屬 IA，另案）；不移除登入頁測試帳密（另一 test-only 議題）；不動 booking/cancel 政策；無 analytics；無部署。 |
| authority | 既有公開頁；無新 D-series。D-011 生產網域不在此 slice。 |
| 驗收 | 未知路徑回品牌頁；主/次連結僅 `/clinic`、`/booking`；404 axe；若 inventory 變動跑 `check:pages`。 |
| 本機 gate | `check:pages`、focused e2e、`check:docs`（若動 docs）。 |
| 人因 later | §「Recover from bad URL」可用性任務。 |

此為建議，非授權；實作仍須另開 `cursor/…` 分支、加測試、跑 UI 相關 gate。

## 15. Findings register（reconciled）

| ID | 來源 | 摘要 | evidence | conf | sev | 優先 | authority |
| --- | --- | --- | --- | --- | --- | --- | --- |
| R-P0-1 | #47 PX-INT-004+JRN-001 | 未知 URL 空白 404；404/首頁→員工登入（印帳密、public） | VERIFIED（Hosting 段 PROD-EVIDENCE） | HIGH | 4 | P0 | 無（可實作） |
| R-P0-2 | #47 PX-INT-001 | 患者取消用 `cancel` 而非 `request_cancellation` | VERIFIED | HIGH | 4 | P0 | REQUIRES_DOMAIN_AUTHORITY |
| R-P0-3 | #47 PX-INT-002 | cutoff 20 分鐘 vs D-005「10:00」 | VERIFIED | HIGH | 4 | P0 | REQUIRES_DOMAIN_AUTHORITY |
| R-P1-4 | #47 PX-FUNC-001 | horizon 60 天 vs D-004「1 個月」 | VERIFIED | HIGH | 3 | P1 | REQUIRES_DOMAIN_AUTHORITY |
| R-P1-5 | #47 PX-CONTENT-001/003 | `止鼾/醫美` vs 鼻科官網邊界 | VERIFIED | HIGH | 3 | P1 | REQUIRES_DOMAIN_AUTHORITY（若醫美屬意圖） |
| R-P1-6 | #47 PX-CONTENT-002 | 療程欄夾 `appointment.id` | VERIFIED | HIGH | 3 | P1 | 無 |
| R-P1-7 | #47 PX-JRN-002 | 無患者改期路徑 | VERIFIED | HIGH | 3 | P1 | 政策先行 |
| R-P1-8 | #47 PX-JRN-003 | overview 900 存量誤為今日工作 | OBSERVED | MEDIUM | 3 | P1 | 無 |
| R-P1-9 | #48 | workspace 分頁無法 deep-link/還原 | VERIFIED | HIGH | 3 | P1 | 無 |
| R-P1-10 | #48 | workbench 缺 empty/loading/成功回饋 | OBSERVED | MEDIUM | 3 | P1 | 無 |
| R-P1-11 | #47 PX-NEED/A11Y-001 | 無 user research / 真人 AT | VERIFIED（缺口） | HIGH | 3 | P1 | REQUIRES_HUMAN_EVIDENCE |
| R-P1-12 | #47 PX-METRIC-001 | 無成效指標（設計非實作） | NOT_EVIDENCED | HIGH | 3 | P1 | REQUIRES_OWNER_AUTHORITY |
| R-P2-* | #47/#48 | 視覺密度/兩套語彙、320 banner、375 thumb、週捲動、公告文案、英文 eyebrow、physician blocked、無 RUM | OBSERVED/VERIFIED | 混合 | 2 | P2 | 混合 |
| R-P3-* | #47/#48 | skip-link 聚焦重疊；CSS ratchet debt | OBSERVED/VERIFIED | HIGH | 1 | P3 | 無 |

## 16. 未涵蓋與限制

- 未部署、未接真資料、未觸 production/cloud/Calendar/Firestore。
- 未跑此 commit 的遠端 `Verification evidence`（於 push 後跑 exact-head CI）。
- 未評估 security/infra/架構軸既有 findings（見 2026-08-11 稽核）。
- Hosting 是否對未知路徑自動送 `404.html` 為 `REQUIRES_PRODUCTION_EVIDENCE`；本機 test
  server 已證實回空白 404。
- 靜態全頁截圖之 mid-page 空白為 reveal-on-scroll 擷取假影，已與互動觀察區分。

## 17. 下一位接手者的第一步

1. 本稽核為 dated evidence；不改變 Stage、D-series、Roadmap 或任何 gate 授權。
2. 若要推進 §14 的 slice（公開 404／front-door 復原），開獨立 `cursor/…` 分支、加測試、
   跑 `check:pages`／focused e2e，再依一般流程開 PR；本稽核不授權任何實作。
3. 取消語意/ cutoff/ horizon/ catalogue 等 P0/P1 多被 D-004/D-005/D-006 卡住；屬
   blocked-by-authority，須先取得核准，不得由本稽核自選數值或語意。
4. 目前 Stage 位置是否改變：**否**。

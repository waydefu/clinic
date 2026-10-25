# Phase 1 Decision Register

## 2026-10-25 官網卡片質感、換頁接續、圖片淡入、每頁獨立標題與官方社群配色

負責人（工程師）在 Claude Code 對話中，看過 Active Theory（activetheory.net）的實測評分與「可學習清單」後指示：

> 你來處理好了

範圍由負責人從選項中勾選（選項原文）：

- 每頁獨立標題：建置時替官網各頁各產生一份 HTML，自帶標題、說明、分享圖；預覽仍維持 noindex。
- 卡片質感：療程與醫師卡片加玻璃感、懸停浮起、預約按鈕光暈；只改 CSS。
- 卡片到內頁的轉場：點療程卡片時，卡片圖片平滑連到內頁主圖（瀏覽器內建轉場，不支援就直接換頁）。
- 圖片模糊預覽：大圖載入前先顯示柔和底色，載入後淡入。

同一題負責人另寫：

> 社群那些圖的顏色用官方配色，先說說你會怎麼改

說明做法後，負責人選擇「照做，可以下載官方檔」：從 Meta 品牌資源與 LINE 官方 logo 頁下載 logo 壓縮檔，只用來取色碼與圖形，不進 repo。

執行範圍與界線：

- 不改任何醫療文案、圖片素材或素材清單；只用現有文字。
- 官網凍結檔（`clinic-site.js`、`clinic-site.css`、`clinic-content.js`）依本條重算一次基準值。
- 每頁獨立標題以平面檔 `clinic-route/*.html` 加三份 Firebase 設定的精確 rewrite 實作，`/clinic` 與 `/clinic/**` 404 後備不變；新頁的效能預算照抄 `/clinic.html` 的上限，不放寬任何既有數字。
- 社群配色：LINE 維持 `#06c755`；Facebook 與 Messenger 改為官方檔的 `#0866ff`（Messenger 官方已改回單色）；Instagram 改為官方漸層字形取樣的色階；Messenger 圖形改用官方向量檔路徑。Instagram 官方路徑會讓官網超出 21 KiB 腳本預算，LINE 與 Facebook 官方只有點陣檔，這三個圖形維持原本的自繪字形，只換配色。
- 本條不授權部署。預覽頻道的更新另依 [合成資料線上預覽操作手冊](../runbooks/synthetic-online-preview.md) 逐次核准。

同日追加，負責人看了預覽上電話、地址與「回官網」的底線連結後指示：

> 盡量不要文字連結，不太美觀

- 官網首屏資訊卡的電話與地址、頁尾所有連結、文字型行動連結（`.clinic-text-link`），以及預約頁的「回官網」與頁尾連結，改成淡色膠囊按鈕（文字色的淡底色加細框），不用底線；高度維持 44px。
- 句子裡的連結照舊保留底線（介面規則書 R-2 豁免 3）；麵包屑在 `<nav>` 裡，維持原樣。
- 依本條再重算 `clinic-site.css`，並重算一次 `clinic-booking.css` 的凍結基準值。

## 2026-10-24 Sol v2：43 包來源收尾與外部驗收分離

專案負責人為工程師，不是診所業主；工程範圍、設計與測試方案由負責人核。
正式營運批准人、隱私告知原文與公開信箱等對外承諾，由有權代表診所的人確認，負責人代為轉達。
負責人在本輪對話明確採用 `sol-longrun-v2`；以下四項原文已登記並讀回
[#268 決定紀錄](https://github.com/waydefu/clinic/pull/268#issuecomment-6384695242)。
未另提供 approval ID，不另造；不改 D-001～D-016 狀態、ADR 或 Safety Floor。

### 負責人決定原文

**決定 1　下游解鎖：選「可以先開工」**
> 上游列「外部驗收未完成」，下游照常做程式與測試；外部驗收另列清單、最後一起做。30 包可以動。

**決定 2　外部驗收：選「先列清單，之後排一天做」**
> Sol 不碰實際環境，只把每項要測什麼、怎麼測、成功標準寫成一份測試單；你挑一天在場，再逐項授權執行。

**決定 3　七個工程小題：選「全部照建議」**
> ① E4-15 照保守範圍：只替既有 CAL-PILOT 讀取路徑補資料檢查與合成測試；不新增 collection、API、index、writer、資料版本，不雙寫、不 migration、不接 provider 或真實資料。
> ② 授權 Sol 在原 worktree（luna-read-failure-20261019）修 READ-FAILURE 那 4 個檔，走正常 PR／CI；不改 guard、不清理或重設別人的變更。
> ③ DESIGN-GATE 以目前來源結案，E1-22 的歷史說法記「未驗證」（historicalClaimVerified 保持 null）。
> ④ WATCH 這階段不開自動清除，以來源完成結案：容量快滿告警、滿了回未成功讓來源重送、不丟資料、不刪舊紀錄。
> ⑤ BUSINESS 正式寫入延到 Stage 3，這階段以合成模型結案；正式批准入口與 writer 保持關閉。
> ⑥ SAST 和截圖可在 CI 用合成資料重做新證據，舊的記「未驗證」；新證據用新的 evidence ID，不覆蓋歷史。
> ⑦ 不碰 auth、RBAC、IAM、共用 schema、migration（與共同文件）的 MEDIUM 包可以派 Luna，由 Sol 審查。

**決定 4　合併方式：選「小包可以合併成一個 PR」**
> 同一層、改的檔案不重疊的 MEDIUM 包，最多 3 包合成一個 PR，每包的證據分開寫；HIGH 的身分鏈仍一包一個 PR。

### 本次取代的適用方式與驗收界線

- 本節取代下方 2026-10-22「CONTRACTS／INGRESS 的必要來源或外部證據未取得前，
  不得聲稱固定數量的後續包已解鎖」的適用方式。下游可做程式與測試的必要條件是：
  上游來源 PR 全部已合併、合併後 main CI 綠、其剩餘缺項僅是外部測試單或診所文案。
  「30 包可以動」是負責人決定原文，不代表尚未逐包核對就有 30 包立即可開工。
- 關鍵鏈仍串行：CONTRACTS → SESSION → IDENTITY → RETURN → TTL → SCHEDULE →
  CALENDAR-CANDIDATE → INTEGRATION；SOL-INTEGRATION 最後且 parentExclusive。
- 全包 DONE-MERGED 仍須每個 finding 的來源修補或既有修補、同 SHA 正／負測試、
  負責人合併與合併後 main CI。ALREADY_FIXED／NO-WORK 仍須證據，不把 BLOCKED 改標 NO-WORK。
- 來源與測試已合併、只差外部實測者，在 #268 寫 `BLOCKED-EXTERNAL` 並註明
  「SOURCE-DONE／外部驗收未完成」。不算完成、不報 DONE；須負責人逐包核准，才成為來源凍結候選。
  PRIVACY 及確需正式告知原文的段落可列「SOURCE-DONE／待診所文案」，不發布草稿或自行核定法律文字。
- WATCH 核對須涵蓋自動清除、自動到期、Firestore TTL 欄位與排程刪除路徑；這階段不啟用它們。
  雲端 TTL 設定保持受保護，不以本節修改；容量預警與滿載拒絕重送須有測試。
- 外部測試單僅列 INGRESS、NOTIFICATION、MAINTENANCE、LEASE、SECRETS 的逐項操作、
  成功／拒絕標準、停止／回復、合成資料與允許效果；Sol 不執行。
  執行 SHA 由操作者當天填；目標僅用既有精確核准，缺者列明需新授權，不猜 host／project。
- 本登記 PR 排合併佇列第一。依賴本節的工作可以先開工並開 Draft PR；
  登記 PR 合併前，不宣稱這些 PR「現在可以合併」。
- 不授予合併、部署、實際環境、provider、憑證、IAM、secret、guard、migration、真實資料、
  production、雲端 TTL、例外延期、凍結或其他受保護動作；不降 gate、不增加例外。

## 2026-10-22 Sol 全局 closeout 與純合成實作範圍核准

業主在本輪對話明確核准，沒有另外提供 approval ID，不另造。
完整原話及後續指令依序登記於
[#268 純合成核准](https://github.com/waydefu/clinic/pull/268#issuecomment-6330313890)、
[#268 blocker 檢視與新動作](https://github.com/waydefu/clinic/pull/268#issuecomment-6330746099)、
[#268 全局 closeout](https://github.com/waydefu/clinic/pull/268#issuecomment-6330790714)。
本節不改 D-001～D-016 狀態，不改 ADR 或 production／real-data 權限。

### 已核准的實作範圍

> BUSINESS：依 #282 已合併的模型做合成資料流與測試；正式批准來源尚未指定前，真正 writer／批准入口保持停用，不自行新增 collection、API 或正式資料寫入。

依已合併的 [#282 模型](../plans/2026-10-22-sol-business-adjustment-design.md)，
可做純合成資料流、既有計算與 service 的回歸；正式批准來源、正式 writer／批准入口仍未核准。
不新增 collection、公開 API、migration 或正式資料寫入；合成批准不是可供正式 writer 信任的權威。

> LEASE：依 #283 做純合成協調原型與回歸測試；不得建立或修改雲端服務，不接 provider，不部署；無法證明隔離／排空時維持停止或 quarantine，不自行接管未知狀態。

依已合併的 [#283 候選](../plans/2026-10-22-sol-calendar-lease-coordination.md)，
可做 admission／draining／quiescence／quarantine 的純合成原型與回歸，目標仍為嚴格零派送。
不改既有 provider runtime 接線，不將單程序／stub 的成功當實際網路隔離證明。

> DESIGN-SCOPE：核准只處理 current-source scope；歷史 claim 保留未驗證，不補猜。

這僅解除 E1-22 當前來源範圍的待答問題；不產生原始 predicate、歷史像素或 claim 證據，
`historicalClaimVerified` 保持未驗證。只做 current-source 可獨立驗證的工作，不擴大 UI 或 gate 權限。

### 全局持續推進與結案門檻

> 執行策略改為「全局持續推進」，不再因單一 blocker 整輪停止

遇單包 owner／external blocker，記錄缺項、提供者、最小證據與不可提供的敏感內容，
暫留 BLOCKED 並重算依賴，續做不受影響的合法工作。僅在所有剩餘包都無合法可執行工作時，
一次提出完整 owner brief。這取代前輪「遇下一個 blocker 整輪停止」的節奏，不取代安全界線。
BUSINESS、LEASE、DESIGN-SCOPE 先行；CONTRACTS／INGRESS 的必要來源或外部證據未取得前，
不得聲稱固定數量的後續包已解鎖。SOL-INTEGRATION 在所有真正前置完成後最後執行。

目標是 #268 原 43 個未完成包逐包有唯一、可追溯的處置與證據，最終三類 BLOCKED 都為零；
`readyToStart=[]` 必須因全部完成而非全被阻擋。這是成功門檻，不是宣告目前已完成，
也不准將 BLOCKED 改標 NO-WORK、將局部 helper／文件／CI 成功等同完整 packet DONE。
source freeze 仍須原有完整前置、逐項證據及業主操作；本節不授權代理凍結或合併。

### 保持封閉的邊界

- WATCH：保留 #284；期限 UNSET。無可靠權威不清除、不正式持久化／provider 接線；
  channel TTL、單次 backoff、fixture 數字都不是最大重試期限。可做不猜政策的純來源／測試。
- INGRESS：僅目前已核 C1 exact host；其他 CAL-PILOT／default／preview identity 未有精確權威前拒絕。
  B-03 實際入口／provider 證據不得以 CI 替代。
- PRIVACY：正式告知文與可公開角色信箱未備妥前 BLOCKED，不代擬已核法律版本；
  與法律文字無關的可獨立驗證 current-source 工作不因此一律停下。
- 原七項外部證據／受保護恢復授權仍缺。不得自行 merge、部署、讀憑證、改 IAM／secret、
  migration、真實資料、production、provider 實接或繞過 clinic guard。
- 前次被拒的 `F:/tmp` 路徑不重試；業主檢視後的新動作只用原允許的 literal `/tmp/...`
  或合法 worktree，不把兩者當同義、不修改或放寬 guard。
- 本批登記 PR 為隊首；已授權來源可先開 Draft，但登記合併前不宣稱現在可合併。

## 2026-10-22 Sol 保守版方向與 SUPPLY-ORDER 補登

本節由 Sol 依業主已採用的 `sol-longrun` 規則補登四題原話；公開追溯為
[#268 業主答案登記](https://github.com/waydefu/clinic/pull/268#issuecomment-6322342715)。
沒有另行提供 approval ID，不另造；不改 D-001～D-016 的狀態。

### 業主原話與適用方向

> 我建議選保守版

此句適用 #268 先前簡報的 BUSINESS、LEASE、WATCH、INGRESS 四題：

- **BUSINESS（D-24）**：業主沒有指定既有核准來源，採用沿用既有 milestone state 的最小可追溯調整模型；
  先提出合法輸入、批准引用、撤銷／重播及原始試用起算關聯的設計，不新增 collection 或 API。
  既有試用日數、最多調整日數及尾款滿月＋業主確認政策不變；不推導 D-35 新日期下界。
- **LEASE（D-05／D-12）**：維持嚴格零派送，先提出跨系統 fencing／協調設計。
  現有允許交易快照後一次派送的測試，不能當成零派送的證明；不得把外部 HTTP 放入 Firestore transaction。
  本方向不是既有實作或 provider 驗收通過，也不授權直接更換協調架構。
- **INGRESS**：主機與 IPv6 都必須 exact-host 完全相符，不放寬成 prefix 或 project-family。
  此為比對方向，不會憑空核准尚未列出的 CAL-PILOT／default／preview 主機清單；不授權 provider 或部署。
- **WATCH（D-29）**：另有以下業主補充，優先於把保留理解成永久保存的說法。

> 照建議，但補充：不是永久保存，而是不能無條件自動過期；只有在能證明已超出所有重試與舊通知可能回來的期間後才能清除。容量滿時停止新處理並保留待重試，不可丟資料。

WATCH 清除必須同時可驗證：舊通道已停止或到期、已超過最長重試期間、沒有正在處理中的工作。
具體期間須在實作 PR 說明提出並由業主審，不由代理猜數字。容量將滿先告警；容量滿時對新通知回未成功，
讓來源稍後重送，不得回成功後丟資料，也不得刪除舊記錄騰空間。未接線 helper 不因本項決定獲准接入 production。

### 先前 SUPPLY-ORDER 回答補登

業主原話已於 2026-10-21 登記於
[#268 原始留言](https://github.com/waydefu/clinic/pull/268#issuecomment-6313473719)：

> 允許先開一個只修這 3 個 high 漏洞的最小依賴 PR，可以在記錄此決定的 PR 合併前先做。

僅限 GHSA-22jm-h49p-29qw、GHSA-46jr-4wx8-v453（`@modelcontextprotocol/sdk`）及
GHSA-587h-7wmj-h5pm（`vite`）的最小來源修補，不新增豁免、不降 gate、不改無關套件。
[#280](https://github.com/waydefu/clinic/pull/280) 已由業主合併是來源事實，不是整包 SOL-SUPPLY 結案或部署授權。

### 執行界線與仍未回答的項目

- 本批回答的登記 docs PR 排在合併佇列第一。依業主採用的本輪執行規則，依賴這批答案的來源工作可以先開 Draft PR；
  登記 PR 合併前不得標為「現在可以合併」。未審的具體設計、數值或主機 identity 仍須送業主核定。
- DESIGN-SCOPE、PRIVACY 及 #268 列出的七項外部證據維持 BLOCKED；不代填、不把來源或合成 CI 冒充外部驗收。
- 不合併、不部署、不操作真實資料、不讀憑證，不授予 secret、IAM、migration、雲端 TTL、例外延期或其他受保護動作。
  來源凍結候選仍須逐包由業主核准，BLOCKED 不算完成，凍結 SHA 仍由業主決定。

## 2026-10-20 官網 `/clinic` 改版（#249）不等 C1，準備合併

專案負責人在 2026-10-20 的對話中決定。沒有另行提供 approval ID，不另造。

- **決定**：Draft PR #249（`agent/clinic-redesign-20261011`）現在就整理到可以合併，不等下一次 C1 部署。
  這取代 2026-10-11 條目的「C1 部署完成後才合併」、2026-10-12 療程插圖條目的「合併時機仍是 C1 部署完成後」，
  以及 `docs/design/2026-10-11-clinic-homepage-redesign.md` 的同一句；那幾條的其餘內容不變。
- **誰按合併**：由專案負責人本人按下。本條不授權任何工作階段代為合併、推送或發佈預覽頻道。
- **仍然不授權**：部署、live channel Hosting、接管現行由廠商租約經營的官網
  （`DELIVERY_DEFERRED_DUE_TO_EXISTING_VENDOR_LEASE` 與 `PUBLIC_PRODUCTION_ROUTE_NOT_AUTHORIZED` 不變）；
  也不授權讓 `/clinic` 被搜尋引擎索引，`noindex` 維持。合併進 `main` 只是原始碼狀態，不是上線。
- **上線前待辦仍成立，合併不結清它們**：
  (1) 醫療文案審閱，含醫師個人頁頭銜「自體肋隆鼻權威」與下鼻甲手術頁「常見的下鼻甲處理方式」比較表（中性版）；
  (2) 器材照（雙極射頻探針、凝結夾）是否為廠商產品照，以及 AI 工具產生的兩張療程插圖的商用條款，
  記在 `apps/web/clinic-assets.manifest.json` 的 `openItem` 與 `additionalLicences`；
  (3) 隱私權說明是否另加地圖一節，與 `privacy.html` 的 4 KiB 文件預算。
- **合併後的後續**：Draft PR #274（`agent/booking-restyle-20261019`，booking 改版）帶有 `brand-tokens.css`，
  `clinic-site.css` 之後要改採它。#249 與 #274 都改了 `apps/web/performance-budget.json`、本登記簿、
  `scripts/check-clinic-freeze.mjs`、`scripts/check-design-tokens.mjs` 這四個檔案；兩者中後合併的那一個，
  必須先重新同步這四個檔案。

## 2026-10-19 預約頁換膚：與官網同風格（共用品牌 token）

業主在 2026-10-19 提出以下要求，專案負責人在同日的對話中核可下方計畫。沒有另行提供 approval ID，不另造。
本節只定預約頁的視覺換膚；不改 D-001～D-016 的狀態，不授予任何受保護作業。

### 業主原話

> 官網與預約頁風格要相同，背景要用現有素材庫的

### 負責人核可的計畫

1. **共用品牌 token。** 從官網新設計（Draft PR #249，`agent/clinic-redesign-20261011`，尚未合併）抽出
   `apps/web/public/brand-tokens.css`（`--brand-*`）。預約頁現在就載入它；官網的 `clinic-site.css`
   在 #249 合併之後才改讀同一份檔案。本次不動 #249，也不動官網。
2. **範圍是換膚加版面調整。** 預約流程、`patient-app.js` 邏輯、表單欄位、文案、JSON-LD（含「醫學美容」項目）、
   canonical、robots noindex 都不變。
3. **背景。** 只用官網既有的 `soft-green-bg.webp`（凍結素材，只引用、不修改），只鋪在最上面的標題帶並往下淡出到畫布色；
   深色主題改用深綠漸層、不載入圖。
4. **主題。** 保留自動／淺色／護眼／深色四種；預約頁的預設改為淺色，工作臺維持原預設；使用者存過的偏好優先。
5. **預算（`/patient.html`，`apps/web/performance-budget.json`）。** image 約 12 KiB、total 約 78 KiB、stylesheet 請求數 3；
   script 預算不變；image 不得超過 12、total 不得超過 78，放不下就停手回報，不再往上調。
   stylesheet 的 KiB 只在 total 78 之內依需要上調。
6. **本登錄條目與凍結重新基準。** 新增本條目；凍結清單中只重新基準 `apps/web/public/clinic-booking.css`，其餘雜湊不動。

### 實作結果（2026-10-19，gzip 實測）

- 預算：document 7,140 B（7.0 KiB）、script 49,774 B（48.6）、stylesheet 11,647 B（11.4）、image 10,962 B（10.7）、
  total 79,523 B（77.7 KiB）。已調整：stylesheet 10→12、image 6→12、total 71→78、stylesheet 請求數 2→3。
  底圖經 CSS `url()` 進入預算閉包，使 image 請求數 3→4（標誌、健保標章、favicon、底圖）——這一項不在上列核可數字內，
  是核可計畫的直接後果，已在 `justification` 載明。document 預算當時只剩 28 B 餘裕（2026-10-20 追記的資訊卡用掉了，見下方）。
- 凍結：`scripts/check-clinic-freeze.mjs` 只重新基準 `clinic-booking.css`
  （`8a979d8e…c202` → `b44bddb5…3246`；2026-10-20 追記再重新基準一次，`b44bddb5…3246` → `84b381c9…d68d`），檔頭註解引用本條；
  其餘 29 個雜湊不變，`soft-green-bg.webp` 位元組未動。
- 標誌：頁首與頁尾用 `apps/web/public/assets/booking-logo.webp`（144×80，4,998 B），
  由 `apps/web/clinic-source/clinic-logo.png` 依 alpha 邊界裁掉透明留白（x76 y44 1384×771）後縮小並編成 WebP：
  `ffmpeg -i clinic-logo.png -vf "format=rgba,crop=1384:771:76:44,scale=144:80:flags=lanczos" -c:v libwebp -quality 70 -preset drawing -compression_level 6`。
  現有的兩條素材管線都沒走：`build:clinic-assets` 每次重寫整份凍結的 manifest 與全部素材；`build:brand` 與前者同樣需要
  Playwright，本機（舊筆電）禁用。要改由管線重產時，bytes 會略有不同，需重量預算。舊的 `brand-mark.webp` 不再被預約頁引用，
  仍留給工作臺。
- 版面取捨（未經業主逐項確認）：手機版內容欄兩側各留 1rem（官網為 1.5rem）；標題帶眉題文字用 forest、金色只留給短線
  （金色小字在底圖最暗處只有約 3.9:1）；焦點環用實算過的 `--brand-focus-ring`（#7a5400，對白底 6.78:1，官網現用的
  #d49b45 只有 2.45:1），深色主題沿用 `styles.css` 的淺琥珀；`<meta name="theme-color">` 不動（`#155c48` 已等於 `theme.js`
  對淺色套用的值，改成淺色要動共用的 `theme.js`，工作臺 `/index.html` 的 total 預算只剩 22 B）。
- 預約頁頁首現在連到官網 `/clinic`（標誌與「回官網」）；`check:ui` 與 e2e 原先釘住「預約頁不出現 `/clinic`」，
  已改成「恰好兩個官網出口，醫師頁與工作臺根路徑仍不得出現」。
- **放寬 2026-08-20 的「預約頁自成一體」防線。** 那條防線（commit `9ee84af`「keep vendor booking surface
  self-contained」）把 `/clinic` 視為凍結路由、不得從預約頁宣傳。負責人在 2026-10-19 的對話中被告知風險後，
  明確選擇保留連到 `/clinic`，而不是改連現行官網或拿掉出口。已知風險：預約頁若比新官網（#249）先上線，
  病患會從預約頁進到尚未核准發布的官網；兩頁上線時程須一併確認。

### 2026-10-20 追記：診所資訊卡改放標題帶，只在第一步，卡片內沒有文字連結

業主在 2026-10-19 看過預約頁後說（原話）：

> 診所資訊不要放那，放預約頁上方即可，且僅須第一頁，然後不要有文字連結。

專案負責人在 2026-10-20 的對話中帶回業主的決定並核可下列做法；沒有另行提供 approval ID，不另造。
範圍仍只是版面調整，不動預約流程、`patient-app.js`、表單欄位、文案、JSON-LD、canonical、noindex。

- **版面。** 取消 2026-10-19 版本的桌機雙欄（左側診所資訊、右側預約流程）。預約內容改成單一置中欄，寬度
  `min(64rem, var(--brand-shell))`（`--booking-column`），標題帶、資訊卡與預約流程同寬；頁首、頁尾仍用 `--brand-shell`。
- **診所資訊卡。** 放在標題帶（`#patient-hero`）內、頁面標題正下方：白底卡片、柔和陰影，每項＝淡綠圓底圖示＋標籤＋值，
  內容是門診時間、地址、電話（兩組）與健保門診標章，沒有社群圖示。64rem 以上一列四項，48–64rem 兩列各兩項。
  圖示是官網的時鐘、圖釘、電話三個內嵌 SVG（`aria-hidden`、`focusable="false"`），不新增圖檔。
- **只在第一步。** 卡片在標題帶裡，而 `patient-app.js` 在第二、三步與結果頁都會把標題帶設成 `hidden`
  （`display:none`），所以卡片自動只在第一步出現，不需要新的狀態選擇器，`patient-app.js` 不動。
- **卡片內沒有文字連結。** 電話改成純文字（兩個 `tel:` 連結拿掉）；頁尾的連結本次不動。頁尾的健保標章恢復在所有寬度顯示
  （2026-10-19 版本在 64rem 以上因為左欄有一枚而把它藏起來；現在第二步起沒有資訊卡，所以頁尾那枚一律顯示）。
- **M1（手機）。** 48rem 以下整張資訊卡不顯示（`display:none`）。理由：`tests/e2e/mobile-layout.spec.ts` 要求 375×812 時步驟列
  的上緣小於視窗高度的 72%（約 585px），守的是「第一個問題在首屏」。從 CSS 推算目前約 446–457px，剩餘約 130px；
  手機 2×2 精簡卡（含標籤）約 190–200px，會把步驟列推到約 636–657px，放不下。測試沒有放寬。同樣的門診時間、地址、電話與
  健保標章在頁尾（R-13：資訊換了位置，沒有不見）。業主 2026-10-20 選擇此做法。
- **I2（圖示）與預算上調。** 內嵌 SVG 讓 `/patient.html` 的 document 從 7,140 B 增為 7,426 B，超過原 7 KiB 預算；
  CSS 的 data URI 不可行（CSP 是 `img-src 'self'`），外部 SVG 檔違反「不新增圖檔」。專案負責人於 2026-10-20 核可只調整
  `apps/web/performance-budget.json` 的 `/patient.html`：document 7→7.5 KiB、total 78→78.5 KiB，其餘不變，`justification` 已載明。
  gzip 實測：document 7,426 B（7.25 KiB）、script 49,774 B（48.61）、stylesheet 11,760 B（11.48）、image 10,962 B（10.71）、
  total 79,922 B（78.05 KiB）；請求數不變（script 32、stylesheet 3、image 4、total 40）。
- **凍結。** `scripts/check-clinic-freeze.mjs` 只重新基準 `apps/web/public/clinic-booking.css`
  （`b44bddb5…3246` → `84b381c9…d68d`），其餘雜湊不變。
- **驗證。** 本機沒有執行 e2e／Lighthouse（舊筆電不執行 Playwright），交給 CI 與人工。`tests/e2e/theme.spec.ts` 的健保標章選擇器
  已由 `.patient-info …` 改為 `.booking-facts …`。`/booking` 的視覺基線截圖仍待另行重拍。

### 不得擴張的限制

- 官網採用 `brand-tokens.css` 要等 #249 合併之後，另做；本條不授權合併任何 PR。
- merge、部署、預覽頻道與其他受保護動作仍須各該次的明確授權；不得由本條反推。
- `/booking` 的視覺基線截圖（`docs/reviews/ui-visual-c4-2026-08-22.md` 與其 manifest）已與新版面不符，要另行重拍才能更新，
  本次沒有改任何基線雜湊。本機沒有執行 e2e／Lighthouse，驗證交給 CI 與人工。

## 2026-10-19 Phase 0 業主回答與來源凍結候選界線

業主在本輪 Sol 父代理的 Phase 0 決定簡報後回答以下問題。未另提供 approval ID，不另造。
本節記錄回答、所選選項與執行限制；不改 D-001～D-016 的狀態，不授予任何受保護作業。
本節的來源凍結候選界線優先於下方 2026-10-18 條目的 Claude 解讀及計畫文件的舊凍結敘述。

### 業主原話

> 決定簡報回覆：第 1–11、13、14 題全部選 A；第 12 題選 B。
>
> 第 12 題 B 的意思：程式碼已完成、只差真實環境或 C1 外部驗收的 packet，由我逐包核准後列為「來源凍結候選」。這些包的終態標 BLOCKED-EXTERNAL，並註明「外部驗收未完成」，不算完成，也不能報 DONE。最終報告要列出這些包和各自缺哪些驗收。凍結的 main SHA 由我決定。需要我做政策決定的 BLOCKED-OWNER 包不適用這一條。
>
> 請照你的計畫，把這些回答登記進決定登記簿，那個 docs PR 排合併佇列第一。這則訊息先不要開工：用白話複述你理解的第 12 題，以及接下來的前三步，等我下一則 /goal。

Sol 複述界線後，業主另送出以下開工指示；前一則「先不要開工」不被當成永久禁止，也不被倒推成當時已開工：

> 依 main 上 docs/plans/2026-10-18-sol-luna-autorun-prompts.md 第 4 節與執行紀錄（壓縮或重啟後都要重讀），把 manifest executionGraph 的每個 packet 推到第 4 節定義的終態，直到沒有任何可往前推的工作

### 所選選項及其範圍

以下保留 Phase 0 簡報的題號與 A 選項內容；第 12 題直接採業主上面的明確定義，不能改成 Sol 的概括授權。

1. **55 包實作範圍，A**：確認 55 個 Sol packet 都可依本清單查證及實作，受保護動作除外。
2. **交給 Luna 的範圍，A**：三個既有 LUNA_READY；另准四個 MEDIUM 候選及 L7 準備，經 Sol 核對完整 write set 後整包派工。
   候選為 SOL-READ-FAILURE、SOL-CALENDAR-TESTS、SOL-CLI、SOL-MAINTENANCE；碰到核心禁區就留 Sol。
3. **G2／G3 員工登入邊界，A**：確認保留這兩個保守行為，不擴大 Bearer 權限。
   兩個行為指 #245 已實作的「Bearer 不能繞過 server session」及「allowlist 重疊即拒絕」。
4. **Q5／Q7 入口與 HMAC，A**：先做不依賴 IP 作身分保證的來源方案、HMAC 原始碼及測試；secret、轉換與部署另次逐項核准。
5. **G7／Q8／Q9 IAM、WIF、無金鑰，A**：先准來源方案／差異準備；實際權限、binding、金鑰退役都保持停用，另核精確作業。
6. **Q2／Q4 隱私告知與公用信箱，A**：維持既定 Calendar 格式，先整理告知原句給業主核；收到要公開的診所角色信箱後才替換。
7. **待櫃台確認的細節／合法病患綁定，A**：先由 Sol 出一份短設計，這幾項一次送業主核准；批准前維持身分不明即拒絕。
   幾項指保存期限、誰可看、稽核與綁定來源。
8. **D-24 商務調整來源，A**：先核對已核定的來源；若沒有，提出最小方案再核准，不新增付款／薪資 ledger。
9. **D-29 Calendar 去重保留界線，A**：先設計有界的去重及 overlap 行為，再送核；未定前不接線、不自訂保留政策。
10. **D-42 範圍，A**：限合成資料的 arrived、過去未結、cancelled 還原／發布／重試矩陣，不改業務規則。
11. **A10 與 K3 分類，A**：維持 A10 分類，K3 依已核定方向施工，記錄同根關係，不宣稱 A10 自動結案。
12. **若最後仍有 BLOCKED，是否凍結，B**：只依上方業主原話的逐包核准程序處理；BLOCKED-EXTERNAL、外部驗收未完成、不算完成、不報 DONE；
    BLOCKED-OWNER 不適用；凍結 main SHA 由業主決定。
13. **11/28、11/30 到期處理，A**：不自動延期；期限前準備續期／停用方案給業主逐項核准，未獲新授權就依現有到期邊界停止。
    braces 是否已有修補，實作前再查上游。
14. **41 個待核 packet 如何推進，A**：逐包先查目前 source、測試與 PR；已修就結案，有缺口才做最小修補。
    41 是 Phase 0 回報時的待核數，不是永久狀態或已確認缺陷數。

### 不得擴張的執行限制

- 回答登記的 docs PR 排合併佇列第一。依賴新答案的 packet，依
  [Sol 父代理提示詞第 4 節](../plans/2026-10-18-sol-luna-autorun-prompts.md#4-sol-父代理提示詞)，
  要等該 PR 合併進 main 後才開工；本次回答沒有另行豁免此前置。
- 第 2 題不授予 Luna 修改 auth、RBAC、IAM、共用 schema、migration 或共同 tracking 文件的權限。
  同時最多兩個 Luna；每個使用獨立 worktree，write set 不重疊，整包派工並由 Sol 審查。
  SOL-INTEGRATION 保持 parentExclusive，LUNA-WORKBENCH-START 保持 Sol 專屬。
- L7 只准準備以下三檔，不含 C1 回歸執行、正式驗收或簽收：
  [CP-08 worksheet](../plans/2026-10-01-cp-08-regression-evidence-worksheet.md)、
  [CP-09 手冊](../runbooks/manager-operations-manual.md)、
  [CP-10 清單](../plans/2026-10-01-cp-10-current-project-acceptance-checklist.md)。
- 第 6～9 題不是核准尚未提出的法律原句、角色信箱、保存數值、可見角色、病患綁定來源、調整資料來源或去重保留政策。
  這些未答項目仍須另送核准；需要政策決定的 packet 保持 BLOCKED-OWNER，不得改列來源凍結候選。
- 本次只核准第 12 題的候選處理程序，沒有逐包核准任何 packet 成為來源凍結候選，也沒有指定凍結 SHA。
  候選必須已有程式碼完成的證據，只差真實環境或 C1 外部驗收，並取得業主對該 packet 的個別核准。
  最終報告與執行紀錄逐包列出 BLOCKED-EXTERNAL、「外部驗收未完成」、缺少的驗收與個別核准狀態；不計入完成數。
- merge、部署、secret、IAM／WIF 實際權限、資料或索引轉換、雲端 TTL 設定、例外延期及任何其他受保護動作，
  仍須各該次的明確授權。不得由程式碼、CI 綠燈、來源凍結候選或本節選項反推其已獲核准。

## 2026-10-18 交付節奏與 Sol／Luna 執行方式

業主在 2026-10-18 的對話中回答以下問題。沒有另行提供 approval ID，不另造。各項只定方向；
merge、部署、secret、IAM、資料轉換與其他受保護動作，仍各自需要該次的明確授權。
每項先記業主的原話或選項，再另記 Claude 的解讀；解讀未經業主逐項確認。

- **驗收版本凍結範圍**：
  - 第一次問「驗收版本要等哪些修補完成才凍結？這決定 A 段能不能在 11/28 前完成。」，
    業主回「這個禮拜能搞定全部嗎」。Claude 回答不行：測試期 20 天加調整期、尾款要正式運行
    滿一個日曆月，SOL 各包也有逐次授權與合併。
  - 第二次問「這週衝刺的話，驗收版本的凍結範圍要怎麼定？」，業主回「sol那邊包含luna嗎」。
    Claude 回答文件上 Sol 與 Luna 是兩條線，驗收線 CP-08～10 原本分給 Luna。
  - 第三次問「驗收版本的凍結範圍要怎麼定？」，業主選「等 SOL 全部完成」；
    沒有選「只補重大缺陷（建議）」與「先等 Sol 回報工時」。
  - 追問「「等 SOL 全部完成」的「SOL 全部」，指哪個範圍？」，業主選「現行清單全部 55 個」；
    沒有選「10-05 的 13 包，約 18 個 packet（建議）」與「Sol 先對帳再決定」。
    - 業主看到的選項說明是「254 個稽核 ID 全做，最長依序合併 8 輪，工作量約三倍，凍結會晚很多。」
    - 事後更正兩點：
      - 254 是整張圖 59 個 packet 的 ID 數；
        [`2026-10-06-sol00-safe-manifest.json`](../plans/2026-10-06-sol00-safe-manifest.json)
        `activeCloseout.executionGraph` 的 55 個 `SOL_PRIMARY_EXPERT_ONLY` packet 實際涵蓋 240 個 ID，
        其餘 14 個在 3 個 `LUNA_READY` packet 與 `NO-WORK`；
      - 「8 輪」是依賴深度。因為 `main` 要求 PR 跟上最新 main 才能合併，實際上大約每合併一個 PR
        就要等一輪 CI。
    - 相較之下，10-05 計畫的 SOL-01～13 只有 41 個 ID，對到 14 個 packet 加上 SOL-INTEGRATION。
  - Claude 的解讀：
    - 凍結、C1 部署、CP-08 回歸與 CP-10 簽收，都排在這 55 個 packet 完成之後；
    - 「完成」指 DONE-MERGED、有證據的 ALREADY_FIXED，或 NO-WORK（含 manifest 標為規劃終態的
      SOL-CUSTODY）。若有 packet 最後停在 BLOCKED-*，凍結要等還是由業主決定，列入 Phase 0 決定簡報；
    - 3 個 `LUNA_READY` packet 與驗收線 L7 不在凍結條件內；
    - 本條與 10-10「13 包全部開工」合起來，是這 55 個 packet 的實作授權，受保護動作除外。
      這一點列為 Phase 0 業主決定簡報的第一題，請業主再確認。
- **執行方式**：
  - 問「Luna 那條線（CP-08 回歸、CP-09 手冊、CP-10 驗收清單，加上 19 個小包）由誰接？」，
    業主沒有選列出的選項，原話是「sol父代理1個luna子代理2個，並行，筆電太爛盡量靠線上ci，
    研究怎給6.1sol、6luna一路跑完的提示詞」。
  - Claude 的解讀：
    - GPT-6.1 Sol 當父代理，GPT-6 Luna 子代理同時最多 2 個，可與父代理並行；
    - 這次執行不適用 manifest `executionGraph.concurrency` 的規劃快照（父代理等待子代理、總數 2）；
    - 本機只跑針對性檢查，完整驗證交給 GitHub Actions；
    - Luna 的 PR 由父代理 Sol 審查；
    - 合併仍是業主的動作。
  - 設定與提示詞見 [2026-10-18 Sol／Luna 一路跑完](../plans/2026-10-18-sol-luna-autorun-prompts.md)。
- **C1 部署日**：問「C1 部署日你哪天能到場？（當天每個受保護動作仍會逐項問你）」，業主選「下週再排」。
  - 這個選項的說明是「這週只做凍結與準備，部署排到下週。」
  - 之後業主在凍結範圍選了「等 SOL 全部完成」，該選項的說明是「下週無法部署，整個時程往後延，
    延多久取決於 Sol 的速度。」所以「下週」已被取代，目前沒有排定 C1 部署日。
- **執行電腦的雲端帳號與 Hermes 設定**：
  - 背景：Claude 回報執行電腦（舊筆電，2 核心，專案在外接 USB 硬碟）已登入 gcloud（含 ADC）
    與 Firebase，並建議開跑前登出。
  - 業主原話（業主貼上的表格列）：「「雲端登入｜gcloud 已登入、有 ADC、Firebase 也登入過」部分不用登出，他們應該沒那麼蠢，
    規則寫好即可」，並要求「順手優化一下hermes」，之後又要求「然後檢查並優化技能與工具調用」。
  - Claude 的處置（未經業主逐項確認）：
    - Hermes 的 `approvals.mode` 是 `off`，原有的 authority gate 只會要求人工確認，因此不會生效；
    - 另加一個只在診所工作區生效、直接擋下受保護動作的 hook，並調整子代理上限、對話壓縮與
      `/goal` 上限。
    - 2026-10-19 再依審查結果與本機設定稽核補做：hook 修成 2.2 版（家目錄底下一律視為憑證區，寫入範圍縮到 worktree 與暫存資料夾）並加掛 `read_file`、`search_files`，
      Hermes 的壓縮、輔助任務與 MCP 設定做了效能調整（`protect_first_n` 改回 0，開啟 serena 與
      codebase-memory）；當時 hook 尚未核可，之後已核可（見下一項）。
    - 2026-10-19 夜間，業主原話：「我的是桌面版」；之後在 hook 的作用範圍上選了「全部工具都經過」，
      原話「改成全部工具都經過」。Claude 的處置（未經業主逐項確認）：為桌面版把 hook 補成 2.3 版
      （工具白名單、依對話資料夾判斷範圍）；業主選定後才把 hook 的 matcher 改成 `.*`（備份
      `config.yaml.20261019-before-desktop.bak`）。讀回時 `clinic_guard.py` 顯示 `✓ allowed`；
      每個工具呼叫約多 0.45 秒；Desktop 要完全結束再重開一次，新的 matcher 才生效。
    - 細節與已知殘餘風險見
      [2026-10-18 Sol／Luna 一路跑完](../plans/2026-10-18-sol-luna-autorun-prompts.md) 第 2.3、2.7、3 節。
  - 殘餘風險：hook 擋不到的寫法，仍可能用到已登入的雲端憑證。這是業主接受的取捨。
- **2026-10-19 Sol 對話在 Desktop 的開法**：
  - 業主原話：「你直接幫我建好了」，之後又說「但我診所專案不就分開了」。
  - Claude 的處置（未經業主逐項確認）：沒有新增專案。Desktop 把對話歸在資料夾最深的專案，`sol-run`
    本來就在既有的「診所專案」（資料夾 `F:\診所專案`）底下，另建專案會把診所的對話拆開。Claude 從
    Desktop 的指令面板把 `sol-run` 開在原本的「診所專案」裡，準備好一個空白對話，沒有送出任何訊息。
    第 1 節第 2 步 (c) 已照此改寫，見
    [2026-10-18 Sol／Luna 一路跑完](../plans/2026-10-18-sol-luna-autorun-prompts.md)。
- **相關到期日（事實，不是決定）**：CAL-PILOT 合成子範圍 2026-11-28T04:51:37Z 到期，braces 例外
  2026-11-30 到期；沒有修補版或仍需要時，到期前需要業主另行決定。

## 2026-10-12 官網視覺方向 A+B 與「點了才載入」的 Google 地圖

業主在 2026-10-12 的對話中看過三個風格樣板（A 編輯雜誌感、B 安靜診間、C 呼吸線條，本機
`output/style-tiles/`，不進版控），並回答兩個附選項的問題。沒有另行提供 approval ID，不另造。

- **視覺方向**：採 A＋B，顏色用淺色系。A 提供版面骨架（大標題、品牌牆在右側延伸到視窗邊緣、首頁主線四段
  的紅銅序號）；B 提供質地（白色圓角卡、膠囊按鈕、浮在照片下緣的門診資訊卡）。原本深綠底的鼾聲 App、
  收尾與頁尾三區改為淺色。紅銅色取自品牌牆的銅字，只用在序號與資訊標籤。
- **舊背景圖**：業主表示舊背景圖（`soft-green-bg.webp`，淡綠霧面、葉影與水珠）也要用上，由 Claude 安排。
  放在首頁首屏、內頁頁首（醫師團隊、醫師個人頁、療程頁）與收尾區，三處用同一張 2.9 KB 的圖。
- **地圖學參考站**：業主提供一張日本診所網站的截圖，指示「地圖部分可學」——地圖鋪底、資訊卡疊在上面，
  卡片裡有星期 × 時段打點的門診表。首頁「門診時間與交通」依此改版；門診表的資料與 `CLINIC.hours`、
  `clinic.html` 的 openingHoursSpecification 同源。
- **Google 地圖：點了才載入**（業主從三個選項中選定；另兩個是「自繪地圖＋Google 連結」與「直接嵌入」）。
  預設顯示本站自繪的簡易地圖（OpenStreetMap 資料，`scripts/build-visit-map.mjs` 產生，頁面標示來源並連到
  授權頁）；病人按下「顯示 Google 地圖」才建立 iframe。為此 **官網這一面的 CSP `frame-src` 加入
  `https://www.google.com` 一個 origin**（`apps/web/csp-policy.mjs` 的 `CLINIC_MAP_FRAME`），staff、booking、
  widget 不變，`security-headers.test.ts` 鎖住範圍。按鈕旁有即時說明（按下後才會載入、載入後由
  Google 依其隱私權政策處理瀏覽資料）。隱私權說明正式版是否另加一節，交隱私／法律負責人決定；草稿文字記在
  `docs/design/2026-10-11-clinic-homepage-redesign.md`，放進 `privacy.html` 時要一併處理該頁 4 KiB 的文件預算。這是 repo 內的設定變更，**不是部署授權**；上線仍依各自的部署條件。
- **第二輪調整（同日，業主看過預覽後）**：業主認為「配色太過單調」，要求社群平台「直接用圖示呈現」、
  「盡量用視覺化方式表達」，並重做首屏、配色與質感；附上 8 張診所自己的衛教圖當方向。採用那些圖的色彩
  （鼠尾草綠多階、米黃、金黃重點、膚色鼻子與黃色鼻中隔線）與表現手法（圓形重點、帶箭頭的流程、標題列
  卡片）。社群改成品牌色圓形圖示；看診流程、療程重點、打鼾成因與評估流程改成圖示版面，文字不變。
  圖示與插圖全部自繪，沒有引入圖示套件。
- **新增醫療內容（待審）**：鼻中隔手術頁加入「鼻中隔彎曲的常見類型」五張卡片，文字逐字抄自業主提供的
  衛教圖，插圖依原圖重畫。其中「尾端彎曲……靠近鼻咽部」與「尾端」常指鼻腔前端的用法可能不一致，列為待
  醫師確認。
- **比較表：中性版**（業主從三個選項中選定，另兩個是「照原圖完整放」與「先不放」）：下鼻甲手術頁加入
  「常見的下鼻甲處理方式」表格，只留治療部位、原理、手術時間、住院與塞棉條；拿掉皇冠排名、復發機率、傷口結痂、
  術後照護，以及「能有效維持功能」「破壞性最大、出血量大」「溫度不均、舊式儀器」；原表的 ✕／○ 改寫成文字，
  表下註明實際因人而異。屬醫療內容，待業主審閱與法規確認。
- **器材與牙套照片**：業主指示使用投影片裡的器材照（雙極射頻探針、微創止鼾凝結消融的凝結夾）與牙套實品照。
  三張都只去背取出器材或牙套本身，不帶投影片上的皇冠、文字與標章（含「有效治療」）；探針握把尾端在原圖被
  切齊，以淡出收尾，細針加了淡金屬灰邊才在淺色底上看得見，沒有補畫原圖沒有的部分。器材照是否為廠商產品照、
  可否用於官網列為上線前待確認（manifest 的 openItem）。
- **頁首**：業主要求寬度縮小、像 B 方案的漸變玻璃。頁首由 88px 降到 72px（手機 64px），半透明白到淡綠漸層加
  背景模糊，不畫底線。
- **預算（業主決定：接受，調高）**：圖示、插圖、比較表、器材照與牙套實品照讓 `/clinic.html` 的預算閉包增為
  圖片 281.5 KiB（19 檔）、腳本 20.1 KiB、總量 312.5 KiB（23 個），超出 2026-10-11 核准的圖片範圍。業主從三個選項
  （調高、改成進入療程頁才載入、拿掉部分照片）中選擇調高：圖片 284、腳本 21、總量 314 KiB。療程頁專用的照片
  實際只在療程頁下載；日後若改成進入該頁才載入，應把數字收回。
- **刻意沒放的部分**：儀器比較表與「一次可治療多種部位」投影片裡的排名皇冠、復發機率高低、傷口結痂、
  後遺症與恢復時間，以及牙套圖的「有效治療」。這些屬醫療廣告中的排名、比較與效果宣稱，沒有業主醫療文案
  審閱與法規確認前不放上網站；比較表本身以上一條的中性版呈現。
- **待業主確認（既有內容，不是本次變更）**：醫師個人頁的頭銜「自體肋隆鼻權威」含「權威」一詞，依醫療
  廣告規範可能被視為誇大，建議業主審閱時一併確認。

## 2026-10-12 官網療程插圖替換與素材權利確認

業主在 2026-10-12 的對話中提供兩張新插圖、回答兩個附選項的問題，並指示把官網其餘頁面一併改完。
沒有另行提供 approval ID，不另造。

- **換圖**：止鼾五合一與鼻中隔手術的療程插圖（首頁服務列與兩個內頁共用）改用業主提供的兩張新圖，
  理由是舊圖不好看。業主以順序指定：桌前揉眼的人物換鼻中隔手術，仰睡張口的人物換止鼾五合一。
  下鼻甲手術與止鼾好眠牙套兩張不變。
- **新插圖權利**：業主表示兩張是以 AI 工具產生，確認可用於診所官網。上線前仍須確認所用 AI 工具的
  商用條款；在那之前此項列為未結事項，記在 `apps/web/clinic-assets.manifest.json` 的 `additionalLicences`。
- **首頁實景照權利**：2026-10-11 加入首頁的五張照片（品牌牆、接待櫃檯、候診區、診間、治療室）取自
  診所現行官網；業主確認為診所自有（自行拍攝或委製）。2026-08-02 的素材權利確認只涵蓋當時的素材，
  這五張另以本條記錄，不沿用舊確認。
- **療程縮圖不裁切**：業主要求左側縮圖「盡量不要有被切的感覺」。下鼻甲手術與止鼾好眠牙套的圓形插圖
  改為整圓取出，四張療程圖都放在同一個底色上。
- **內頁一併改版**：業主指示「官網完整改完」。2026-10-11 條目原訂「業主認可首頁後才延伸到其他頁」，
  本條起醫師團隊、兩位醫師與四個鼻功能內頁同批改版；合併時機仍是 C1 部署完成後。
- **設計主導與方法**：業主認為 GPT 做的 v14 原型（本機 `tmp/clinic-editorial-home-20261006`）缺點過多，
  改由 Claude 接手設計。方法是先研究專業創作者的做法（網頁設計、動效、視覺效果、美感），以程式為網站評分，
  再「設計 → 評分 → 修正」迭代；美學評分**先不沿用舊規則與觀念**。預算沿用既有數字，不需重量舊版。
  研究整理在 `docs/design/2026-10-12-design-research.md`，評分工具在 `scripts/design-score/`（研究用，不是 gate）。
- **技能重構授權**：設計相關技能（`.claude/skills` 的 ui-design、ui-motion、ui-check、ui-content 等）可以優化到
  完全重構；重構仍經 repo 審查流程，治理文件與 gate 規則不因此放寬。
- **預算**：換圖後 `/clinic.html` 一度需要圖片 234 KiB；內頁改版刪掉舊首頁殘留樣式後實測 224.4 KiB，
  最後圖片維持 228 KiB、總量 252→250 KiB，仍在 2026-10-11 條目核准的 30～60 KiB 範圍內。

## 2026-10-11 官網 `/clinic` 改版提前開發與解凍

業主在 2026-10-10 與 2026-10-11 的對話中，從附建議的選項中選定以下各項。沒有另行提供 approval ID，不另造。

- **提前開發**：`CURRENT-PROJECT-SEQUENCE-2026-09-22` 原訂「官網最後」；業主決定官網改版現在開始開發。
  只限 repo 內 `/clinic` 路由的開發與本機／分支驗證；**不交付、不部署、不接管**現行由廠商租約經營的官網，
  `DELIVERY_DEFERRED_DUE_TO_EXISTING_VENDOR_LEASE` 與 `PUBLIC_PRODUCTION_ROUTE_NOT_AUTHORIZED` 不變。
- **解凍範圍與時機**：`/clinic` 凍結的 30 個檔案現在可以在改版分支修改；**C1 部署完成後才合併**，
  合併時依本條重設 `scripts/check-clinic-freeze.mjs` 的基準。`/booking` 是另一個專案，不在此範圍。
- **做法**：從 `main` 重做，v14 原型（孤兒分支 `agent/clinic-v14-prototype-archive-20261008`）只當素材；
  先做首頁給業主看桌機與手機截圖及文案，業主認可後才延伸到其他頁。
- **首屏與相簿**：單張清晰的品牌牆為主圖，相簿由使用者自己翻，不自動輪播。
- **預算**：`/clinic.html` 圖片預算依實測放寬 30～60 KB，理由寫進預算調整紀錄。
- **醫療圖**：首頁以品牌插畫做入口，完整醫療圖放在對應內頁。
- **診桌照**：照片背景的玻尿酸促銷氣球與官網排除醫美內容的界線有關；業主表示「幾乎看不見其實沒差」，
  原圖保留不修。是否選入官網依設計需要決定，選用時在設計紀錄註明。
- 動效與醫療文案依 2026-10-10「官網動效與醫療文案審閱」條目。

## 2026-10-10 官網動效與醫療文案審閱（UI 技能）

業主在 2026-10-10 的對話中，從附建議的選項中選定以下兩項。沒有另行提供 approval ID，不另造。

- **Anime.js**：選「不引入，只學手法」。動效以 CSS 與原生 Web Animations API 實作；
  不新增 Anime.js 相依。日後若要引入，需新的業主決定，並先滿足
  `.claude/skills/ui-motion/reference/animejs.md` 列出的打包、預算、供應鏈與 CSP 前置條件。
- **醫療文案審閱**：官網醫療文案由業主本人先審，並把醫療法第 85～87 條的「不暗示療效」
  提示寫進 UI 技能。業主先審不等於法律審閱；上線前仍建議由專業人士審閱，未審內容標示待審。

## 2026-10-10 開發工具 braces 例外延期

- `SUPPLY-CHAIN-BRACES-2026-10-10`：業主在 2026-10-10 的對話中，從四個選項（延期、
  強制換 chokidar 4、移除 firebase-tools 開發相依、不處理）選擇「延期到 2026-11-30」。
  延續 `SUPPLY-CHAIN-BRACES-2026-10-03`，該例外原訂 2026-10-17 到期。
- 2026-10-11 重新查證：GHSA-vfj7-8cjw-p6xm 仍未列任何修補版（影響 <=3.0.3，未撤回），
  npm 上 braces 最新仍為 3.0.3，firebase-tools 最新版 15.33.0 仍依賴 chokidar ^3.6.0。
  路徑與範圍不變：只在不出貨的 firebase-tools > chokidar@3；出貨面 `audit:prod` 門檻不變且為乾淨。
- 解除條件：任何 braces 修補版發布即改 override 並移除例外；或 firebase-tools 不再依賴
  chokidar@3 即升級並移除。到期仍無解時須再次取得業主核准，不得自行延長。
- 只改例外到期日、理由與解除條件；不改 `audit:prod`／`audit:all` 門檻，不新增其他忽略項目。

## 2026-10-10～11 Sol 開工前問答的其餘業主決定（2026-10-14 補登）

業主在 2026-10-10 與 2026-10-11 的對話中，從附選項的問題中選定以下各項；2026-10-14 指示
「寫入決定即可」，本條目只做登記，不改程式。沒有另行提供 approval ID，不另造。同一輪問答的
限流 key 切換與自助預約身分衝突兩項，已記在下方「2026-10-10 身份邊界相關業主決定」。
各項只決定方向；merge、部署、金鑰、資料轉換與雲端 TTL 政策設定，仍各自需要該次的明確授權。

- **Sol 工作包開工範圍**：問「Sol 包這一批要開工到哪裡？」，選「13 包全部開工」（SOL-01～13）。
  各包遇到受保護動作仍須停下來逐次取得授權。2026-10-14 業主指示其餘實作交給 6.1 Sol。
- **A05 回診暫時憑證的保存期限**：病人回診查詢取得的 15 分鐘暫時憑證
  （`return_sessions`）過期後，資料庫紀錄保留 **24 小時**再自動刪除。選「24 小時（建議）」；
  其他選項為 7 天、比照預約 2 年。理由：憑證過期後已無用途，查詢行為另有稽核紀錄依既定
  3 年保存；留一天供排查。過期即拒絕的行為不變，24 小時只是實體清除時點，不延長有效期。
  實作屬 SOL-04（A05：期限目前以字串儲存，須改成原生 TTL 可用的時間型別）。
- **E4-09 個案管理師與諮詢師**：選「是同一個職務」。這題依診所實際分工回答，提問時未附建議。
  維持現行 `ASSUME_CASE_MANAGER_IS_CONSULTANT = true`（`packages/domain/src/roles.ts`）的對應，
  不需改程式。本項回答 [RBAC 矩陣](../architecture/rbac-matrix.md) §7 的 Q1；同表 Q2～Q4
  （醫師看金額、管理者臨床紀錄權、櫃檯結算）不在本題範圍，仍未回答。
- **G4（SOL-09）匯出下載的「一次」怎麼算**：匯出政策
  （[BD-POLICY](2026-09-29-business-delivery-policy-decisions.md)「下載 TTL／次數」：24 小時失效，
  最多 3 次）的「一次」，選「伺服器真的開始送檔才算（建議）」：按下載後網路中斷，短時間內重試同一筆不另扣次數；瀏覽器預先抓取不算。
  「短時間」的長度，以及保留 GET 加明示嘗試或改成受 CSRF 保護的 POST 加短效票證，由 SOL-09
  設計時評估相容性並寫 ADR；不得未經評估直接改成 POST。
- **Q3 公開 repo 裡的業主個人聯絡資訊**（[後續計畫](../plans/2026-10-05-audit-followup-luna-plan.md)
  的 Q3）：選「只改現行檔案（建議）」：現行檔案中的個人資訊換成角色資訊，git 歷史不改寫。
  改寫歷史並 force-push 屬受保護動作，未授權。對應 W1-01／LUNA-A01（E3-01、E4-10、B-21）；
  完成後不得宣稱歷史已清除。
- **Q4 Google 登入畫面的支援信箱**（同一計畫的 Q4）：`firebase.json` 的 `supportEmail` 目前是
  業主個人信箱。選「之後提供診所公用信箱（建議）」：業主建好或決定公用信箱後告知，再只替換
  `firebase.json` 與文件中的現行值；在那之前不動。W1-01 第 4 步維持等待。
- **K3 停用帳號的登入失敗訊息**（2026-10-11）：業主選「分開顯示」，不再與一般驗證失敗共用
  同一則對外訊息。業主的決定只有這一句。
  - Claude 在同次對話提出以下實作構想，業主回覆「紀錄即可」，未逐項另行核准：只有完成 Google
    登入的人才看得到「帳號已停用」，未登入者無法藉此探測帳號是否存在；Firebase 端停用與診所系統
    端停用兩條路徑顯示同一則訊息；訊息文字先擬稿給業主看（例如「此帳號已被停用，請聯絡診所
    管理者」）。實作時應沿用這些構想，偏離時須再問業主。
  - Claude 同時表示 A10 與 K3 同根、會一併處理。SOL-00 manifest 目前把 A10 列為
    NOT_APPLICABLE_CURRENT_SCOPE／NO-WORK；是否把 A10 納入同一工作包，實作前須先與該分類對齊，
    不因本條目自動成立。
  - 尚未實作；因會改到 #245 的登入程式，排在 #245 合併後另開工作包（#245 已於 2026-10-11 合併）。

## 2026-10-10 身份邊界相關業主決定（Sol 開工前問答）

業主在 2026-10-10 的對話中，從附建議的選項中選定以下兩項。沒有另行提供 approval ID，不另造。
兩項都只決定方向；部署、資料操作與新功能實作仍各自需要明確授權。

- **限流 key 切換方式**：選「下次部署時直接切換」。切換當下舊的計數與鎖定作廢，限流視窗
  最多約 15 分鐘重新計算；範圍只限測試環境 C1 的合成資料，與下次 C1 部署一起執行。
  不做新舊格式雙讀的過渡期。部署本身仍需該次精確版本的業主授權；不得混跑新舊 writer。
- **自助預約身分衝突**：選「建一筆『待櫃台確認』」。同一電話與月日但姓名不同時，不再只是
  拒絕，而是保留為待確認狀態，由櫃台在工作臺人工核對後再綁定病患；核對畫面放在工作臺，
  工作臺預算依實測放寬並記錄理由。待確認資料的保存期限、可見範圍與稽核需在實作設計中
  另行定案；未實作前維持現行「身分不明確即拒絕」的行為。

## 2026-10-05 AUD-01 預約身分上下文隔離

業主在本次核准表單選擇完整修復：初診、回診與員工請求隔離；重新開始時清除
舊回診上下文；API 同時收到員工與回診憑證時拒絕，不猜用哪個身分；新 intake
不得被舊患者上下文覆蓋。核准更新 ADR、Web／API 與回歸測試，驗證後開
去識別化修復 PR。沒有另行提供 approval ID，不另造。

- 保留合法回診操作與員工 cookie、CSRF、角色、MFA 控制；不新增 OTP 或身分欄位。
- 同一請求不能混用回診與其他身分憑證；歧義 fail closed，不以客戶端優先序猜身分。
- 本決定取代內部測試中混合員工／回診憑證時默默選回診身分的行為；不更改 wire schema。
- 原始私有稽核重現與敏感內容不入公開 PR；僅合成測試，不合併、不部署、不操作真實資料。
- AUD-01 關帳須有相應 regression／exact-head CI；AUD-07 與 final source freeze 仍分別驗證。

## 2026-10-04 內部測試路由的隱私告知例外

- `PRIVACY-INTERNAL-TEST-NOTICE-2026-10-04`：業主於 2026-10-04 在對話中核准（由協調者轉達），
  在 `/privacy`（`apps/web/public/privacy.html`）與隱私權政策草案
  （`docs/legal/privacy-policy-draft.md` §2）各新增一句例外，保留原有「資料只保存在瀏覽器、
  不會傳送到診所」的句子，使 C1 內部測試（API 模式）患者頁的資料去向告知與隱私頁一致。
  核准的原句：「例外：若網址帶有 internalTestBooking=1，或位於診所的隔離測試環境（內部測試路由），
  您在預約頁填寫的合成測試資料會送到診所的測試伺服器保存，不是只保存在您自己這台裝置的瀏覽器；
  此路由只供合成資料測試，請勿填真實資料。」
  - **範圍：** 只描述合成測試路由（`internalTestBooking=1` 或隔離測試環境）的資料去向；
    不改變 production 的隱私權政策，不構成 production 告知、同意或任何上線授權；
    草稿仍是「草稿，尚未生效」，D-003 仍待核准。
  - **對應實作：** `AUD-15`（`apps/web/public/patient-app.js` 在 API 模式把「只存瀏覽器」的
    四句換成「會送到診所的測試伺服器」）。

## 2026-10-03 員工登入時效（六位驗證方向的對應）

- `STAFF-SESSION-12H-2026-10-03`：業主在本次對話對 `STAFF-SIX-DIGIT-EXCEPTIONS-2026-10-03`
  的對應選擇「登入保留 6 位數，但少輸入幾次」，並選「一天一次，不管閒置」。
  - **登入 MFA 不變：** 全員仍以 Google（或自管帳號）＋TOTP 登入；伺服器建立
    session 仍要求 TOTP 第二因素。
  - **時效：** 取代 D-006 的「閒置 30 分鐘／絕對 8 小時」，改為**絕對 12 小時、
    不因閒置登出**，約一個工作天輸入一次。停權後下一個受保護請求即拒絕、登出撤銷、
    CSRF 與角色檢查都不變。
  - **敏感操作再驗證不變：** 確認里程碑、建立匯出、封存、永久刪除、終止寫入仍要求
    10 分鐘內 fresh Google＋TOTP（ADR-0008～0011）。
  - **已知取捨：** 不再閒置登出，櫃台電腦無人看管時畫面可被他人操作；以人員離座
    鎖定電腦補償。之後若要恢復閒置登出，只需改 `packages/domain/src/staff-session.ts`。
  - 早期文件中「30 分鐘 idle／8 小時 absolute」的敘述為歷史紀錄，以本項為準。

## 2026-10-03 重新登入彈窗的瀏覽器隔離設定

- `COOP-POPUP-REAUTH-2026-10-03`：業主在本次對話選擇「設定放寬一格」。全站
  `Cross-Origin-Opener-Policy` 由 `same-origin` 改為 `same-origin-allow-popups`，
  理由是 L3 的 `reauthenticateWithPopup` 需要自己開的 Google 視窗回傳結果，
  `same-origin` 會切斷這條回傳，使匯出、封存、永久刪除、終止與里程碑確認在
  工作臺都無法完成。只放寬這一格：別的網站開啟本站時仍被隔離；CSP、CORP、
  framing 與其他標頭不變；不得改為 `unsafe-none` 或移除標頭。來源為
  `apps/web/csp-policy.mjs`，三份 Firebase Hosting 設定與部署後讀回檢查同步。
  本決定只改原始碼，不構成部署授權；真 popup 仍須在部署後由業主實測。
  本項取代先前文件中「不可放寬 COOP」的限制。

## 2026-10-03 owner verification direction（先記錄，適用範圍待對應）

- `STAFF-SIX-DIGIT-EXCEPTIONS-2026-10-03`：業主本次原話為
  **「只有特殊情況才要6位驗證」**，要求新增紀錄。六位碼驗證的方向是只在特殊情況觸發。
  原話尚未逐項定義特殊情況，亦尚未區分登入 MFA 與操作前的額外再驗證、既有 10 分鐘
  有效期是否調整；這些實作對應為 `IMPLEMENTATION_SCOPE_PENDING`。
  本次沒有改程式、停用登入 MFA、取消既有角色／session／CSRF 檢查，或修改
  D-006 與 ADR-0008～0011 的既有控制。不得把未回答的對應自行填成業主已確認。
  **後續：** 對應已由 `STAFF-SESSION-12H-2026-10-03` 定案（登入保留 MFA、改為 12 小時、
  不因閒置登出；操作前再驗證維持現行範圍）。
  詳見[六位驗證需求與合併順序紀錄](../reviews/2026-10-03-verification-direction-and-merge-order.md)。

## 2026-10-03 開發工具 braces 弱點暫時例外

- `SUPPLY-CHAIN-BRACES-2026-10-03`：業主在本次對話選擇「登記暫時例外，想辦法全綠」。
  GHSA-vfj7-8cjw-p6xm（braces <=3.0.3）於 2026-10-02T22:36Z 調升為 high，npm 尚無修補版；
  唯一路徑是不出貨的 firebase-tools > chokidar@3。只忽略這一筆，到期日 2026-10-17，
  braces 3.0.4 一發布即改 override 並移除例外。出貨面 `audit:prod` 門檻不變且為乾淨。
  登記於 `security/audit-exceptions.json`。

## 2026-09-22 owner scope overlay（不修改既有 D-series 狀態）

本輪業主要求修正後開完整規劃 PR；以下是產品與先後順序，**不是新雲端授權**。
詳[現有專案驗收主計畫](../plans/2026-09-22-current-project-acceptance-master-plan.md)。

- `CURRENT-PROJECT-SEQUENCE-2026-09-22`：先 P1-09、最新預約需求、BD runtime、
  Google 真還原、回歸與文件／業主驗收；CURRENT_PROJECT_ACCEPTANCE 通過後才 AWS，官網最後。
- `BOOKING-MINIMIZATION-2026-09-22`：生日刪年份只月日；國籍恰本國／外國；新預約不收
  身分證、護照、來源渠道（含介紹人子欄位）與攜帶健保卡意向。不新增 OTP、碼、問題或替代身分欄位。
  舊 hash-only 記錄不得反推年份、不誤合併病患；無法安全唯一辨識時 fail closed，不批次抹舊資料。
- `LEGACY-PATIENT-NO-ALIAS-2026-09-28`：伺服器端舊病患只存姓名與不可還原的電話＋完整生日
  雜湊，沒有可合法建立對應的原值，所以 BKG-06「舊 fullDOB 合法 alias」記為不適用：舊病患
  以月日預約時視為新病患另建一筆、不合併、不逐年試算反推。hash-only 的安全處理由 BKG-07 證明。
  見 [ADR-0007](../adr/0007-minimized-booking-intake-and-identity-resolution.md)。
- `CP-02-NO-DIRECT-SEED-2026-09-28`：C1 驗收不繞過 API 直接寫入合成病患或索引；「同鍵兩位
  候選」的拒絕沿用 Firestore Emulator 測試證據，runtime 只證明同鍵並發只成立一筆。
- `CALENDAR-TITLE-FORMAT-2026-09-29`：業主看過診所現行手寫日曆後決定（**只記決定，實作排在
  CP-03／CP-04 之後另開 PR**）。(1) 系統寫入的預約標題改照診所慣用寫法，含姓名、電話與生日：
  `顧問/服務初診或回診/姓名電話 月日/備註`，未指派顧問省略該段；來源已於
  `BOOKING-MINIMIZATION-2026-09-22` 停收故不寫；生日只有月日 4 碼；服務字樣暫用
  「止鼾／醫美＋初診／回診」。(2) 保留時段改為 `⚠ HH:MM-HH:MM 保留時段(原因)`。
  (3) 系統以事件隱藏標記（extendedProperties）辨認自己寫的事件，不靠標題前綴。
  (4) 員工手打事件：不論順序，從標題抽出 09 開頭 10 位手機號碼＋生日（手打 6 碼民國年取後 4 碼
  月日），依 CP-01 的「電話＋月日」鍵自動對應；**任何不確定**（缺電話或生日、多個候選、同鍵異名、
  格式不一）一律不自動連結，改列「未對應事件」由櫃台人工辨識，該時段仍視為占用。
  (5) 手寫的「鼻回／喉回」等部位縮寫只記錄、暫不處理。C1 測試只用假姓名與假電話。
  此決定取代 CAL-PILOT 只允許合成代號 A01～A30 的標題欄位規則（實作 PR 落地時同步改），
  但不改 D-009 production 狀態；標題含電話與生日代表能讀此日曆者都看得到，正式上線前須寫入
  隱私權政策並納入專業審閱。**衝突註記：** 本決定與 AGENTS.md Safety Floor 第 4 條及
  ADR-0002「Calendar 不含病患 PII」直接衝突；實作 PR 之前必須先以獨立治理 PR 修訂該條與
  ADR（由業主核准），未修訂前任何 session 不得把姓名、電話或生日寫進日曆。
  **2026-09-29 修訂：** 業主選擇「先改規則再做」；Safety Floor 第 4 條與 ADR-0002 已限縮為
  「只有專用預約日曆的標題可放姓名、電話、生日月日、初診／回診與服務、顧問代碼」。
  **備註不寫入日曆**（可能含醫療資料，Safety Floor 仍禁止）；醫療資料、自由文字、完整生日
  與憑證仍一律禁止。
- `COMMERCIAL-AUTHORITY-2026-09-22`：遠端 Google Drive 現行原檔為準，本機 DOCX 非 current authority。
  已確認總價 NT$80,000、三期 30,000／30,000／20,000、正常維護 1,800／完全未使用月 500。
  完全未使用為當月無員工 Workbench 登入 AND 無病患完成 booking create；缺證據不能當零。
- `P1-09-AUTHORITY-REFRESH-2026-09-22`：不為舊 19:58:18 gate 趕工或沿用；
  新 exact-SHA、UTC 時窗、完整 mutation、booking/config expiry 與 rollback 必須另外明確核准。
  附件所列 APPROVE 是建議草稿，不是 owner 已簽署該 execution packet。

- `BD-POLICY-2026-09-29`：業主逐題回答 CP-POLICY 六組政策與測試期天數，全文見
  [商務交付政策封板](2026-09-29-business-delivery-policy-decisions.md)。摘要：匯出只限
  manager＋10 分鐘再驗證、下載 24 小時／3 次、檔案 7 天清除；封存 30 天可復原、永久刪除由
  負責人再驗證＋理由且不自動刪、legal hold 只由負責人；月用量以伺服器紀錄、排除測試／維護、
  月底後 5 天截止、缺漏改人工確認；CURRENT_PROJECT_ACCEPTANCE 只是工程驗收，尾款需真實運行滿
  一日曆月＋負責人確認；測試期 20 天（含當天）＋最多調整 10 天；還原演練只在 C1 還原到新資料庫、
  7 天清理、上限 NT$500，實際執行另核；終止需簽收才前進、失敗延後、結清由人處理。
  **只適用 C1 合成環境**；production 套用需專業隱私／法律審閱與另行授權。
- `EXPORT-CONTACT-STORAGE-2026-09-29`：CP-04 發現伺服器只存病患姓名，電話與生日只以不可還原的
  雜湊存在查詢索引，因此 `BD-POLICY-2026-09-29` 匯出欄位中的電話、生日無法輸出。業主選擇
  **開始在病患紀錄保存電話（數字）與生日月日**（不含年份，沿用 `BOOKING-MINIMIZATION-2026-09-22`），
  供匯出與櫃台聯絡使用。實作屬獨立 PR：須修訂 ADR-0007、只存於伺服器病患紀錄（不進日誌、
  稽核、事件或 Calendar 以外的投影）、既有舊紀錄不回填也不反推。C1 只用合成值；production
  須先寫入隱私權政策並經專業審閱。
- `BOOKING-NOTE-STORAGE-2026-09-29`：業主決定伺服器保存病患在預約表單自填的備註（最多 120 字），
  存在該筆預約上，供工作臺（只給員工）、核准的匯出與專用預約日曆標題使用；「希望當日接受手術」勾選
  **不存**。備註不進身分比對、稽核、使用事件或日誌，也不屬於重送指紋。C1 只用合成內容；
  production 須先寫入隱私權政策並經專業審閱。
- `CP-03-UI-IN-WORKBENCH-2026-09-29`：月報與里程碑確認畫面放進既有工作臺、只對 manager 顯示；
  `/index.html` 傳輸預算依實測做最小幅度上調並在 `apps/web/performance-budget.json` 記錄理由
  （業主確認約 3 KiB 的載入影響可接受）。其他頁面預算不變。
- `OWNER-BATCH-2026-09-29B`：業主為避免後續施工被卡住，一次核准下列事項（2026-09-29 對話）：
  1. **C1 部署**：CP-03 畫面、匯出、封存刪除、日曆新格式等全部合併後，**一次**部署到 C1；
     屆時仍需對該精確版本另出部署清單由業主核准（不預先核准任何 SHA），並安排業主到場一次，
     同時完成部署後驗收與操作手冊截圖（只有合成資料），約 2～3 小時。
  2. **匯出暫存**：匯出檔切塊存於 C1 Firestore，以 Firestore TTL 7 天自動刪除（TTL 設定屬
     基礎設施變更，隨第 1 項部署一起套用）；本期**只提供 CSV**，xlsx 明確不做。需要放進雲端硬碟時，
     C1 由執行該階段的 agent 從工作臺下載後上傳（合成資料）；正式環境改由業主本人操作。
  3. **日曆標題**：不寫顧問／小編代碼（原手寫 AS／LI 為社群小編縮寫，系統無此資料）；
     **病患自填的預約備註寫入標題**（業主知情：備註可能含症狀，能讀此日曆者都看得到）。
     AGENTS.md Safety Floor 第 4 條與 ADR-0002 同步修訂。
  4. **封存／永久刪除單位**：以**病患**為單位，連同其所有預約一起處理。
  5. **永久刪除後的稽核紀錄**：依既定 3 年保存期保留（只有代號、不含個資）。
  6. **Google 還原演練（CP-06-E）**：移到「測試交付後的微調期」執行；業主屆時以診所帳號建立
     還原演練專用測試日曆並到場。CURRENT_PROJECT_ACCEPTANCE 中的真還原證據因此排在測試交付之後。
  7. **合作終止簽收**：負責人在系統內重新登入後按「已收到」，記錄簽收人、時間與檔案指紋。
  8. **後續執行分工**：難度高的工作由 Claude 完成；其餘由 GPT-6 Luna 依逐步計畫在業主筆電執行並開 PR，
     Claude 審查、業主合併。
  9. **診所正式 Google 帳號**：驗收通過後再開始準備。

上列 `BD-POLICY-2026-09-29` 已回答原本待決的 BD policy 期限／角色／allowlist／保留／返還／人證
與付款里程碑映射。仍待決：production 套用的專業隱私／法律審閱，以及 CP-06-E 實際還原的執行核准。
不得從 fixture 值推定核准，不重新詢問已定的出生年替代欄位。
舊 D-001～D-016 production/privacy/launch 審批及 named reviewer 缺口維持原狀。

Status values: `pending`, `approved`, `deferred`. A decision is `approved`
only after the named clinic owner records the answer and approval date. Do not
infer an answer from an existing website, social message or Calendar event.

Current delivery position: Stage 0／Checkpoint A passed on 2026-07-24. The
project is now at Stage 1 owner decisions. D-010 infrastructure ownership,
region and resilience targets and D-006 identity/security controls were
approved on 2026-07-28. The decision prerequisites for a Stage 2 proposal are
therefore present, but cloud staging still requires a separately reviewed and
explicitly authorised change plan; neither approval creates a project, deploys
a backend or proves that the controls or RPO/RTO have been achieved. D-014～
D-016 track the separate surgery/clinical/finance/Calendar-inbound expansion
and do not change the current Phase 1 gate.

**2026-09-11 owner packet (FS-001, C0-DIR, C1～C6 direction) plus
continuation C0-ENG-ACCEPT:** product direction is
`OWNER_DIRECTION_APPROVED`. Engineering C0 in
`docs/architecture/stage-2-gate-status.json` is `completed`
(`OWNER_AUTHORITY_CONFIRMED`). Named reviewer person-name fields remain
`NAMED_REVIEWER_METADATA_PENDING` and are not fabricated.

**2026-09-11 post-merge (PR #112, `48f773b`):** live machine status is
C0～C6 `completed` and C1～C6 `granted` on isolated synthetic project
`beauessence-clinic-stg-c1a01`. Formal booking stays UNROUTED.
Production, real data, official DNS, live Hosting, and production
Calendar stay `NOT_AUTHORIZED`. Dated at that hour: remaining
engineering was assigned to the cloud agent. Superseded 2026-09-12.
D-series table values below are unchanged.

**2026-09-13 (`IP-001` / `INTERNAL_PREPRODUCTION`):** the clinic owner
split internal-test completion from public production launch. Current
stage target is `INTERNAL_PREPRODUCTION_COMPLETE`, not production
launched. `INTERNAL_TEST_ROUTE_AUTHORIZED` is recorded below;
`PUBLIC_PRODUCTION_ROUTE_NOT_AUTHORIZED` remains. D-001–D-005 stay
`pending` (not legal/production approval) but no longer block synthetic
internal-test implementation. D-007 / D-014 / D-015 are
`DEFERRED_OUTSIDE_CURRENT_PHASE1_DELIVERY`. D-011 is `GO_LIVE_DEFERRED`
for this stage. Clinic public marketing site is
`DELIVERY_DEFERRED_DUE_TO_EXISTING_VENDOR_LEASE`. Do not count
production DNS, live Hosting, production Calendar, real patient data, or
the vendor-leased main website as `INTERNAL_TEST_BLOCKER`.

**2026-09-15 (`WP-B1`～`WP-B11` signed):** clinic owner `wayde.fu` signed
the WP-B1～B11 sheet at `2026/9/15/1:54` Asia/Taipei. Live answers are
`WP-B1-2026-09-15` … `WP-B11-2026-09-15` and
`IP-001-SCOPE-2026-09-15` below. This stage's owner-visible delivery is
**Booking Page + Staff Workbench + fail-closed isolated API + isolated
Firestore + Calendar projection + staff Auth/RBAC + audit/outbox/monitoring**,
synthetic patients only, against a **real isolated backend** (not
localStorage SoT). Public marketing homepage stays
`DELIVERY_DEFERRED_DUE_TO_EXISTING_VENDOR_LEASE`.
`PUBLIC_PRODUCTION_LAUNCH = DEFERRED`.
`INTERNAL_PREPRODUCTION_COMPLETE` remains **FAIL** until that in-scope
surface exists on isolated C1. Signed WP-B1 A is **not** Cloud Run
deploy authority; a later exact-SHA WP-C1 packet is still required.
D-001–D-005 stay `pending`. Closure matrix:
[2026-09-15 WP-B signed authority and F-01～F-14](../reviews/2026-09-15-wp-b1-b11-signed-authority-and-f-closure.md).

**2026-09-13 (`GROK_UNRESTED` / `GROK_PROJECT_CLOSER`):** the clinic owner
explicitly un-rested Grok for cloud-agent engineering and project-closer
execution. `GROK_RESTS` / `LUNA_SOLE_EXECUTOR` (2026-09-12) remains the
laptop Luna playbook, not a ban on cloud-agent work. Public production,
real data, official DNS, live Hosting, and production Calendar stay
`NOT_AUTHORIZED`. Internal-test booking route authority is IP-001, not
this executor assignment.

**2026-09-12 (`GROK_RESTS` / `LUNA_SOLE_EXECUTOR`):** remaining identity
and remaining engineering are Luna-only on the owner laptop. Grok does
not take further engineering unless the owner explicitly un-rests Grok.
Start:
[luna-local-authorized-playbook.md](luna-local-authorized-playbook.md).
Map:
[luna-local-project-completion-master-plan.md](luna-local-project-completion-master-plan.md).
D-series table values below are unchanged. Production, real data,
official DNS, live Hosting, production Calendar, and `/v1/bookings`
stay `NOT_AUTHORIZED`. This executor assignment was superseded for
cloud-agent engineering on 2026-09-13 (`GROK_UNRESTED`).

**All 39 owner questions came back answered on 2026-08-16**, and the
question-by-question reconciliation is
[the 2026-08-17 record](../reviews/2026-08-17-owner-decision-reconciliation.md).
The answers are recorded input, not approval: the sheet carries answers without
the named approver, approval date, scope and exclusions its own approval format
requires, so every D-series status below is unchanged in value. Engineering
C0 and synthetic C1～C6 closed on 2026-09-11 (PR #112). That is not
production, not public booking, and not a D-series close.

| ID | Decision | Owner | Status | Needed before |
| --- | --- | --- | --- | --- |
| D-001 | Legal data-controller name, privacy contact channel and rights-request process | Clinic owner + privacy/legal owner | pending (owner input recorded 2026-08-16; internal-test implementation rules in IP-001, 2026-09-13 — not legal/production approval) | Published privacy policy |
| D-002 | Booking-data retention, deletion workflow and vendor/data-region record | Privacy/legal owner + operations | pending (owner input recorded 2026-08-16; backup-deletion semantics and the Google processor agreement remain unanswered; internal-test retention numbers in IP-001, 2026-09-13 — not legal/production approval) | Collecting patient data |
| D-003 | Final policy text, version identifier and publication workflow | Clinic owner + privacy/legal owner | pending (owner input recorded 2026-08-16; final text, version ID and publication approval outstanding; internal-test policy version `v1.0` in IP-001 — not publication approval) | Privacy acceptance or public booking |
| D-004 | Services, practitioners/resources, slot duration/capacity, booking horizon and blackout rules | Clinic operations owner | pending (superseding owner direction recorded 2026-08-16: capacity 1, booking horizon 1 month; internal-test operational rules in IP-001, 2026-09-13, including unspecified duration default 30 min — not production/legal approval; does not retire the 2026-07-28 “duration known only at visit” production answer) | Slot reservation |
| D-005 | Cancellation cutoff, patient/admin flow, no-show handling and fees | Clinic operations owner + legal owner | pending (superseding owner direction recorded 2026-08-16: cutoff is 10:00 on the appointment day; internal-test override/no-show/no-fee rules in IP-001, 2026-09-13 — not production/legal approval) | Cancellation route or notice |
| D-006 | Identity provider, staff roles, completion authority, permissions and audit retention | Clinic owner + security owner | approved (2026-07-28; implementation evidence pending) | Authenticated write endpoint |
| D-007 | Case-manager assignment/reassignment, patient-merge review and exception evidence | Case-management owner + operations | deferred (DEFERRED_OUTSIDE_CURRENT_PHASE1_DELIVERY; owner 2026-09-13) | Assignment write path |
| D-008 | Payroll metric/rule version, period-lock owner, review and adjustment approval | Finance owner + case-management owner | pending; period-close and adjustment sub-items deferred (owner direction recorded 2026-08-16) | Payroll-credit persistence |
| D-009 | Calendar owner, selected calendar, authorization model, scopes and minimum event fields | Clinic owner + security owner | pending for production; CAL-PILOT synthetic-only sub-scope approved 2026-08-28 and extended through 2026-11-28 by the owner on 2026-08-31 (dedicated allowlisted calendars, closed synthetic fields, no real data). The 2026-08-31 controlled-correction apply is dated evidence; any new apply still needs a fresh exact SHA. 2026-09-11 C0-DIR records Phase 1 *product* bidirectional-sync direction (not production D-009) | Outbound Calendar integration review |
| D-010 | Environments, Firebase-project ownership, IAM, backups and monitoring owner | Technical owner + security owner | approved (target architecture and SLO, 2026-07-28) | Cloud deployment |
| D-011 | Booking-site URL, accessibility/language needs and manual-booking fallback | Clinic operations owner | pending (GO_LIVE_DEFERRED for internal-preproduction; 2026-09-13). Production URL still undecided; Firebase preview / `.web.app` is the current internal-test entry. 2026-09-11 FS-001 hostnames are not DNS mutation authority | Public production booking UX / official DNS |
| D-012 | Displaying the NHI contracted-institution mark on a publicly reachable page | Clinic owner | approved (preview scope only, 2026-07-26) | Showing the mark outside the clinic's own domain |
| D-013 | Branch protection on `main`: required checks and who may bypass them | Technical owner | approved (2026-07-26; amended 2026-09-09: administrators also bound; WP-B5-2 2026-09-15 keeps `required_approving_review_count=0`) | Treating a green CI run as a merge gate |
| D-014 | Clinical/surgical record boundary, accountable medical owner, fields, retention, correction and export | Medical owner + privacy/legal owner | deferred (DEFERRED_OUTSIDE_CURRENT_PHASE1_DELIVERY; owner 2026-09-13) | Storing surgery, anesthesia or clinical follow-up data |
| D-015 | Patient payment/refund ledger, accounting authority, reconciliation and staff-settlement source | Finance/accounting owner + clinic owner | deferred (DEFERRED_OUTSIDE_CURRENT_PHASE1_DELIVERY; owner 2026-09-13) | Persisting money or settlement amounts |
| D-016 | Inbound Google Calendar edits, matching, reviewer authority, conflict/delete semantics and sync SLO | Clinic owner + security owner + operations | pending for production; CAL-PILOT synthetic-only sub-scope approved 2026-08-28 and extended through 2026-11-28 by the owner on 2026-08-31 (manager/front desk review, private link ID, five-minute target). The 2026-08-31 controlled-correction apply is dated evidence; any new apply still needs a fresh exact SHA. 2026-09-11 CAL-SYNC-DIR supersedes the earlier 30-minute *product* SLO with push-then-incremental plus 1–5 minute compensation; production D-016 stays pending | Calendar-to-system writes |

## Recorded inputs

### WP-B6B P1-09 Stage F readback evidence — 2026-09-28

The private artifacts of the 2026-09-25～26 P1-09 runs could not be found
on the owner's machine, in the owner's evidence folder or in any local agent
record. WP-B6-2026-09-15 requires a NEW_EVIDENCE_SET "on a new exact SHA"
when originals are lost. This input amends that clause for one gate only.

```text
Recorded input ID: WP-B6B-2026-09-28
Answer: for P1-09 Gate 17 (the eleven Stage F cases) only, the lost
originals are declared HISTORICAL_ARTIFACTS_LOST, and the NEW_EVIDENCE_SET
may be built from read-only readbacks of the durable C1 records those runs
produced (Firestore documents, Cloud Run request and application logs,
Monitoring data), each bound to the exact SHA that produced it, plus the
owner's inbox evidence for the human alert and a browser re-check on the
same deployed web build. Every per-case limitation of that method is
recorded with the evidence set.
Consequences recorded with the answer:
- The set is P1-09-STAGE-F-READBACK-2026-09-28; its manifest is in the
  2026-09-28 Stage F readback review. Custody follows WP-B6A.
- New files never reuse lost original names and never claim to be the
  originals. A hash is never reconstructed for a lost file.
- Cases were bound to the SHAs that executed them (API ea1fbcc, 6cf9a5a
  and ffa5d33; worker ea1fbcc); this input does not require re-execution
  on the current SHA.
Does not: extend to any other gate or stage, relax the no-fake rule or
WP-B6A custody, or grant cloud, production or real-data authority.
Approved by: clinic owner (PROJECT_OWNER), in-session, after being told the
method deviates from the "new exact SHA" clause
Approval date (Asia/Taipei): 2026-09-28 01:30
```

### WP-B6A private evidence custody — 2026-09-27

F-06 in the [2026-09-15 closure matrix](../reviews/2026-09-15-wp-b1-b11-signed-authority-and-f-closure.md)
and the [2026-09-24 handoff](../reviews/2026-09-24-p1-09-unclosed-source-fix-handoff.md)
left private P1-09 evidence on an owner-local path with no portable,
access-controlled store. This input names the store. It amends
WP-B6-2026-09-15 only where that input placed the redacted archive in the
repository (WP-C5); the no-fake and NEW_EVIDENCE_SET rules stand.

```text
Recorded input ID: WP-B6A-2026-09-27
Answer: private P1-09 evidence (cloud readbacks, request ledgers,
evaluator JSON and exit codes, screenshots) is kept in a Google Drive
folder owned by the clinic owner. Only the clinic owner has read access.
No other person, service account or agent is granted access.
Consequences recorded with the answer:
- The folder link and ID stay offline and are never committed.
- The repository keeps only a sanitized manifest per evidence set: file
  name, size, SHA-256 and UTC time. No content and no link.
- An operator hands evidence files to the clinic owner for upload and
  keeps no copy after hand-over.
- A later reviewer or agent sees the evidence only if the clinic owner
  shares it for that review. Without that, the evidence counts as
  unavailable, and a missing item needs a NEW_EVIDENCE_SET, never a
  reconstructed hash.
Does not: put private evidence in git, relax WP-B6-2026-09-15, or grant
cloud, production or real-data authority.
Approved by: clinic owner (PROJECT_OWNER), in-session
Approval date (Asia/Taipei): 2026-09-27 13:51
```

### WP-B5-1A schedule grid read gate — 2026-09-27

F-13 in the [2026-09-15 closure matrix](../reviews/2026-09-15-wp-b1-b11-signed-authority-and-f-closure.md)
found that `assertCanReadGrid` gates schedule-grid reads on
`create_appointment`, so any role that may create a booking may also read
the grid. Its acceptance evidence is either an owner-amended permission or
a dated decision that the create permission remains the grid gate for this
stage. WP-B5-1 forbids inventing a permission that reopens D-006. This input
records the second option.

```text
Recorded input ID: WP-B5-1A-2026-09-27
Answer: for this stage, schedule-grid reads stay gated on
create_appointment. No separate read_schedule permission is added and
packages/domain role permissions do not change.
Scope: IN_SCOPE roles under WP-B5-1 (manager, front_desk, accountless
patient). OUT_OF_SCOPE roles stay out of scope.
Revisit: a separate grid-read permission needs a D-006 amendment in a later
stage; it is not implied by this input.
Does not: grant production, change D-006, or change any role's permissions.
Approved by: clinic owner (PROJECT_OWNER), accepting the engineering
recommendation in-session
Approval date (Asia/Taipei): 2026-09-27 13:43
```

### WP-B2A lookup limiter under a bypassable proxy chain — 2026-09-26

The 2026-09-26 P1-09 429 run showed that `internal-test-api` accepts direct
`run.app` calls (`ingress=all`, `allUsers` invoker). On that path a spoofed
leftmost `X-Forwarded-For` becomes the WP-B2 lookup key, so rotating it
never trips the 5 / 15 minute lock
([record](../reviews/2026-09-26-p1-09-gate-14-429-rerun.md)). This input
amends WP-B2-2026-09-15; it does not relax any WP-B2 limit.

```text
Recorded input ID: WP-B2A-2026-09-26
Answer: keep the WP-B2 lookup lock (5 failed attempts / 15 minutes / opaque
lookup identity + source IP, then 15 minute lock) and add a second bucket:
10 failed attempts / 15 minutes / opaque lookup identity only, no extended
lock. Over-limit: HTTP 429 + Retry-After (remaining window).
Accepted trade-off: a third party who knows a phone + birth date pair can
block that pair's lookup for at most one 15 minute window at a time.
P1-09 429 acceptance for this stage: with a stable lookup and a new spoofed
leftmost X-Forwarded-For on every request, HTTP 429 + Retry-After must
appear within 20 sends and the durable identity key must hold the count.
Go-live prerequisite (not this stage): the API must not be reachable
around the controlled proxy chain (restricted ingress or load balancer),
or the source-IP key must come from a value the client cannot set.
Does not: grant production, change D-006, or alter the WP-B2 IP limits.
Approved by: clinic owner (PROJECT_OWNER), accepting the engineering
recommendation in-session
Approval date (Asia/Taipei): 2026-09-26 13:22
```

### IP-001 internal-preproduction and internal-test route — 2026-09-13

The clinic owner split **internal-test / staging completion** from
**public production launch**. This packet authorises internal-test
implementation and a fail-closed isolated-test booking route. It does
**not** mark D-001–D-005 `approved`, does not grant production, real
patient data, official DNS, live Hosting, or production Calendar, and
does not retire named legal/privacy/medical ceremony.

```text
Recorded input ID: IP-001-2026-09-13
Answer: INTERNAL_TEST_ROUTE_AUTHORIZED /
PUBLIC_PRODUCTION_ROUTE_NOT_AUTHORIZED /
INTERNAL_PREPRODUCTION_COMPLETE is the current stage target (not
production launched). Executor remains GROK_PROJECT_CLOSER.

Internal-test booking (create, query, reschedule, cancel, capacity,
cutoff, concurrency, idempotency, RBAC, audit, failure handling) may be
implemented and routed through InternalTestBookingModule with:
- staging / isolated-test / emulator scope only
- production default OFF (fail-closed)
- explicit INTERNAL_TEST_BOOKING_ENABLED=true plus UTC expiry plus
  allowlisted isolated project beauessence-clinic-stg-c1a01 or the
  Firestore emulator
- no uncontrolled public patient traffic
- preview URLs are not authentication

Provisional internal-test rules (not production/legal approval):
D-001 clinic as controller; clinic privacy contact; rights request =
identity verification → authorised handling → audit record.
D-002 booking retention 2 years; audit/security logs 3 years; deletion
removes active/main data first; backups expire by retention; Google
Cloud treated as processor. Formal privacy/legal gate remains.
D-003 Privacy Policy version v1.0; store policy version and accepted_at;
do not extra-collect device fingerprints to prove acceptance.
D-004 capacity 1; horizon 1 month; service-specific duration;
unspecified duration default 30 min; earliest booking now+2 hours; past
and closed-hour slots unavailable; blackout overrides; Asia/Taipei.
D-005 self cancel/reschedule allowed before appointment-day 10:00
Asia/Taipei; after cutoff staff/manager manual handling with reason +
audit; no-show recorded; Phase 1 does not auto-charge cancellation /
no-show fees.

D-007 / D-014 / D-015 = DEFERRED_OUTSIDE_CURRENT_PHASE1_DELIVERY.
D-011 = GO_LIVE_DEFERRED (Firebase preview / .web.app is enough).
Clinic public marketing website =
DELIVERY_DEFERRED_DUE_TO_EXISTING_VENDOR_LEASE.
Production Calendar remains D-009/D-016; CAL-PILOT / synthetic calendars
may complete technical behaviour.
FUNCTIONALLY COMPLETE ≠ REAL PATIENT DATA AUTHORIZED.
Approved by: clinic owner
Approval date (Asia/Taipei): 2026-09-13
Recorded by: assistant, from the owner's 2026-09-13 in-flight
INTERNAL_PREPRODUCTION direction patch. The owner gave the direction;
the assistant is not an approver and did not flip D-001–D-005 to
approved.
Scope: internal-test / isolated staging completion of Booking + Patient
Portal and required staff/backend dependencies.
Explicit exclusions: public production launch; official DNS / custom
domain cutover; live Hosting channel; production Calendar; real patient
data; clinic public-site takeover; named legal/privacy/medical
production ceremony; terraform apply to production; firebase login:ci
token in chat/docs/repo.
```

Owner-visible surfaces in that 2026-09-13 packet (“Booking + Patient
Portal”) are **superseded for naming** by `IP-001-SCOPE-2026-09-15`
below. IP-001 route authority (fail-closed InternalTestBookingModule,
isolated project, no D-001–D-005 flip) is unchanged.

Closed-item evidence: [2026-09-13 internal-preproduction owner direction](../reviews/2026-09-13-internal-preproduction-owner-direction.md).
Dated inspect (not current completeness): [2026-09-14 INTERNAL_PREPRODUCTION_COMPLETE](../reviews/2026-09-14-internal-preproduction-complete.md) — `pnpm inspect:internal-preproduction` `ok: true` on `origin/main` `a9a445a4e9bae83f779a9914bc7203961813f916` for **static preview + C5 backup + IAM alert**; `projectComplete: NOT_CLAIMED`; D-001–D-005 remain `pending`. Current judgement after signed WP-B1 A: `INTERNAL_PREPRODUCTION_COMPLETE = FAIL` — see [2026-09-15 WP-B signed authority](../reviews/2026-09-15-wp-b1-b11-signed-authority-and-f-closure.md).

### IP-001 scope clarification — 2026-09-15

Clarifies the in-scope **owner-visible surfaces** for internal
preproduction. Does not flip D-001–D-005. Does not grant Cloud Run
deploy. Does not authorize real patient data or the vendor-leased
marketing homepage.

```text
Recorded input ID: IP-001-SCOPE-2026-09-15
Answer: this stage delivers Booking Page + Staff Workbench + required
backend API + isolated Firestore + Calendar integration + staff
Auth/RBAC + audit/outbox/monitoring on beauessence-clinic-stg-c1a01,
synthetic patients only. Booking Page and Workbench must use the real
isolated backend as source of truth (not localStorage / mock).
Clinic public marketing website remains
DELIVERY_DEFERRED_DUE_TO_EXISTING_VENDOR_LEASE.
PUBLIC_PRODUCTION_LAUNCH = DEFERRED.
Future official-site integration (not this stage): vendor homepage
links or embeds a Booking Widget or standalone Booking Page that calls
the single Canonical Booking API; Firestore remains SoT; Workbench and
Calendar consume that SoT. Do not build a second booking stack.
OUT_OF_SCOPE this stage: public marketing homepage; full site
replacement; SEO/content migration; vendor takeover; official public
production launch; patient Firebase/Google login as the general booking
gate (WP-B3).
Approved by: clinic owner
Approval date (Asia/Taipei): 2026-09-15 01:54
Recorded by: assistant, from the owner's 2026-09-15 work-order
clarification layered on signed WP-B1～B11. The assistant is not an
approver.
```

### WP-B1～B11 signed internal-preproduction decisions — 2026-09-15

Source (do not edit): Google Doc
https://docs.google.com/document/d/1HTFBOkrmsihz0rZzAnOhBPB0WGn45EI2nqF5R-WKAbI/edit
Clinic owner `wayde.fu`, `2026/9/15/1:54` Asia/Taipei. Drive body header
may still say `OWNER_SIGNATURE_PENDING`; the 簽署 block is the recorded
act. Joint fillable sheet
[2026-09-14 WP-B1～B6](../reviews/2026-09-14-wp-b1-through-b6-owner-review.md)
and packet
[2026-09-14 WP-B1](../reviews/2026-09-14-wp-b1-c1-api-authority-packet.md)
are **superseded as waiting questions**. They stay as dated packets.

Common exclusions for every ID below: live Hosting;
`beauessence-clinic-staging`; production terraform; official DNS;
production Calendar activation; real patient data; public production
`/v1/bookings`; flipping D-001–D-005 to `approved`; `firebase login:ci`;
passwords / TOTP / tokens / email recipients in the repo. Signed answers
are internal-preproduction product/engineering direction. They are **not**
an unscoped Cloud Run / Firebase / GCP mutation grant.

```text
Recorded input ID: WP-B1-2026-09-15
Supersedes: WP-B1-2026-09-14 WAITING_FOR_ANSWER
Answer: A — isolated C1 beauessence-clinic-stg-c1a01 must have a real
fail-closed API. Suggested Cloud Run service internal-test-api.
Hosting preview channel internal-preproduction, not live, expiry 7 days
(renewable, never production). May enable Cloud Run API and Artifact
Registry API; Cloud Build only if the real build path needs it.
AUTHORIZED_SHA for mutation must be a fresh origin/main after
engineering merges; do not reuse the static INTERNAL_TEST_PREVIEW_DEPLOY
packet (a9a445a / firebase.isolated-preview.json) as backend authority.
Acceptance floor: gate-off /v1 returns 503 not 404; gate-on accountless
synthetic create + server read-back; return lookup per WP-B7.
Does not: point at beauessence-clinic-staging; touch live Hosting;
terraform apply stacks whose exact_apply_authority_sha is not_granted.
Approved by: clinic owner
Approval date (Asia/Taipei): 2026-09-15 01:54
```

```text
Recorded input ID: WP-B2-2026-09-15
Answer: B — Firestore durable limiter plus process-local burst limiter.
Unauthenticated general API: 60 requests / 60 seconds / source IP.
Identified patient or staff writes: 30 requests / 60 seconds / stable
opaque actor id.
Return-lookup and session/auth failures: 5 failed attempts / 15 minutes
/ opaque lookup identity + source IP, then 15 minute lock.
Over-limit: HTTP 429 + Retry-After.
trustProxy: only the controlled Google/Firebase proxy chain; never
blanket X-Forwarded-For.
If approved D-006 is stricter, D-006 wins; this packet must not lower
an approved security control.
Approved by: clinic owner
Approval date (Asia/Taipei): 2026-09-15 01:54
```

```text
Recorded input ID: WP-B3-2026-09-15
Answer: general Booking Page requires no account, no login, no OTP, and
no Firebase patient Auth. Flow: service → date → time → required info →
submit. Return identity confirmation runs only after the patient clicks
回診 (WP-B7). Do not adopt “every patient must Google/Firebase login”
as this-stage product. Diagnostic token injection is not an acceptance
path. Does not replace D-001–D-003 privacy/legal approval.
Approved by: clinic owner
Approval date (Asia/Taipei): 2026-09-15 01:54
```

```text
Recorded input ID: WP-B4-2026-09-15
Answer: application monitoring = Pub/Sub + human Email. Email recipients
are configured offline and must never enter the repository.
Immediate: API outage / 5xx burst, booking durable write failure,
Firestore persistent transaction failure, backup failure, outbox
dead-letter, outbox oldest-pending too old, IAM SetIamPolicy, auth
failure spike, authorization-denial spike.
Suggested thresholds: API 5xx >= 3 / 5 min; booking write failure >= 3 /
5 min; auth/authorization abnormal >= 10 / 5 min per actor or IP;
dead-letter > 0.
Weekday: rate-limit / denial summaries, retry counts, low-severity
backlog, performance and budget trends.
Monitoring acceptance requires at least one proven synthetic alert
delivered to a real human. C1 IAM SetIamPolicy → budget Pub/Sub is
infrastructure, not this application channel.
Approved by: clinic owner
Approval date (Asia/Taipei): 2026-09-15 01:54
```

```text
Recorded input ID: WP-B5-1-2026-09-15
Answer: IN_SCOPE this stage = manager, front_desk, patient.
OUT_OF_SCOPE_THIS_STAGE = consultant, physician, system_admin, auditor,
service_account. Do not expand physician/consultant workbench or invent
permissions that reopen D-006.
Approved by: clinic owner
Approval date (Asia/Taipei): 2026-09-15 01:54
```

```text
Recorded input ID: WP-B5-2-2026-09-15
Answer: keep main required_approving_review_count = 0. Do not change to
1. Solo-maintainer deadlock risk. Keep strict required CI, branch
protection, enforce_admins. Revisit D-013 when a second trusted human
maintainer exists.
Approved by: clinic owner
Approval date (Asia/Taipei): 2026-09-15 01:54
```

```text
Recorded input ID: WP-B6-2026-09-15
Answer: prefer recovering the 12 2026-09-14 inspect originals and
redacting them into an archive. If lost: HISTORICAL_ARTIFACTS_LOST and
build NEW_EVIDENCE_SET on a new exact SHA. Never fake originals.
2026-09-15 Stage A recovered all 12 SHA-256 hashes on the cloud-agent
VM (see the dated review). In-repo redacted archive remains WP-C5.
Approved by: clinic owner
Approval date (Asia/Taipei): 2026-09-15 01:54
```

```text
Recorded input ID: WP-B7-2026-09-15
Answer: return lookup (only after 回診) = phone number + date of birth,
no OTP. Permanent identifier remains patientId. Phone is a lookup key,
not the primary key. Failures use one normalized message (no
existence/DOB oracle) plus WP-B2 lookup lock. Synthetic PII only.
Approved by: clinic owner
Approval date (Asia/Taipei): 2026-09-15 01:54
```

```text
Recorded input ID: WP-B8-2026-09-15
Answer: if an active follow-up appointment exists, show it and do not
create a duplicate. If follow-up is required but no appointment exists,
use the normal slot UI and create a follow_up appointment bound to the
same patientId with lineage. Cancel/reschedule keep current cutoff and
transaction safety.
Approved by: clinic owner
Approval date (Asia/Taipei): 2026-09-15 01:54
```

```text
Recorded input ID: WP-B9-2026-09-15
Answer: after successful return lookup, reuse existing name, phone, and
DOB; do not force re-entry. New appointments reference patientId.
localStorage is not the patient source of truth. Profile updates are a
separate flow, not a re-create-on-every-return.
Approved by: clinic owner
Approval date (Asia/Taipei): 2026-09-15 01:54
```

```text
Recorded input ID: WP-B10-2026-09-15
Answer: appointment status at least confirmed → arrived → completed.
Arrived is not completed. Arrived and completed update Calendar status
and must not delete events. Database / workbench is source of truth;
legal API/workbench changes project to Google Calendar via outbox /
worker. Manual Calendar edits must not write the database directly;
they become review candidates for manager/front_desk approve or reject
(reject may repair Calendar back to SoT). Production Calendar inbound
controller stays GO_LIVE_DEFERRED; internal synthetic may prove the
flow. Does not approve production D-016.
Approved by: clinic owner
Approval date (Asia/Taipei): 2026-09-15 01:54
```

```text
Recorded input ID: WP-B11-2026-09-15
Answer: follow-up not_required closes the active follow-up only. It
does not delete patient, appointments, audit, follow-up history, or
Calendar history. The patient leaves “needs follow-up” lists but remains
findable in history. Internal-preproduction may use synthetic
PII-shaped Calendar fields (name, phone, type, item, time, status).
Production real Calendar PII still needs privacy/medical/finance review.
not_required is not a deletion or retention signal; D-002 remains
pending.
Approved by: clinic owner
Approval date (Asia/Taipei): 2026-09-15 01:54
```

### WP-B1 C1 API deployment — 2026-09-14 (superseded waiting packet)

Historical waiting packet for F-01. **Superseded** by `WP-B1-2026-09-15`
answer A. Kept so the original question text remains auditable. Still
**not** Cloud Run deploy authority.

```text
Recorded input ID: WP-B1-2026-09-14
Status: SUPERSEDED (answered as A on 2026-09-15)
Owner: clinic owner
Packet: docs/reviews/2026-09-14-wp-b1-c1-api-authority-packet.md
Question: option A (authorize Cloud Run + fail-closed API on
beauessence-clinic-stg-c1a01 with a new exact-SHA backend packet) or
option B (do not deploy an API; redefine INTERNAL_PREPRODUCTION_COMPLETE
as static Hosting preview plus CI-proven backend)?
Answer: A (recorded under WP-B1-2026-09-15)
Approved by: clinic owner
Approval date (Asia/Taipei): 2026-09-15 01:54
Explicit exclusions until a later exact-SHA WP-C1 packet: enable
run.googleapis.com; artifactregistry.googleapis.com; terraform apply of
a C1 API stack; firebase deploy of /v1/** to Cloud Run; reuse of the
static internal-preproduction preview packet as backend authority; live
Hosting; production; real patient data; D-001–D-005 approved.
```

Recorded by: assistant. The assistant is not an approver.

### FS-001 first-stage product scope — 2026-09-11

The clinic owner recorded the Phase 1 owner-visible capability freeze.

```text
Recorded input ID: FS-001
Answer: approved as product direction — Phase 1 owner-visible
capabilities are appointment query/create/reschedule/cancel,
daily/weekly schedule, business hours, closures, special dates,
bookable slots, basic follow-up tracking, per-staff login,
manager/front_desk RBAC, append-only audit, and fast bidirectional
Google Calendar sync. Hidden/not delivered: payroll/commission,
formal medical records, surgery/anesthesia, payment/refund/settlement,
advanced case management, advanced reports. Chart auto-print is a
later add-on after the clinic supplies a fixed format. Suggested
hostnames (not DNS authority): book.beauessence.com.tw,
staff.beauessence.com.tw, api.beauessence.com.tw. Existing
beauessence.com.tw stays with the incumbent vendor; first-stage
patient entry remains beauessence.com.tw/reservations/ with an
optional redirect. Do not embed the synthetic preview iframe in the
official site.
Approved by: clinic owner
Approval date (Asia/Taipei): 2026-09-11
Recorded by: assistant, from the owner's 2026-09-11 Phase 1 packet
(00 plus C0～C6). The owner gave the approval; the assistant is not
an approver.
Scope: product scope and UI capability freeze for Phase 1.
Explicit exclusions: not production deployment; not real patient
data; not DNS mutation; not Terraform/Firebase/Cloud Run apply; not a
blanket C1–C6 cloud-mutation grant; does not re-enable hidden modules
because code already exists; does not mount AppointmentController.
Residual risk: D-004/D-005/D-011 remain pending for public booking
semantics.
```

Closed-item evidence: [2026-09-11 C0 owner-direction reconciliation](../reviews/2026-09-11-c0-owner-direction-reconciliation.md).

**2026-09-15 surface note:** `IP-001-SCOPE-2026-09-15` does not retire
FS-001's Phase 1 capability freeze, but it **does** retire
`beauessence.com.tw/reservations/` as a *this-stage* deliverable. The
vendor-leased marketing site stays
`DELIVERY_DEFERRED_DUE_TO_EXISTING_VENDOR_LEASE`. This-stage patient
entry is the isolated Booking Page (accountless) plus later Widget /
standalone page on the Canonical Booking API. Suggested hostnames remain
not DNS authority.

### C0-ENG-ACCEPT-2026-09-11 engineering C0 acceptance

The clinic owner accepted C0-ENG-REC for Phase-1 synthetic staging and
authorised engineering C0 closure. Machine status is `completed`, not
the invalid gate word `approved`. C1 start authority is granted; C1 PASS
still requires apply + smoke on a new isolated project.

```text
Recorded input ID: C0-ENG-ACCEPT-2026-09-11
Answer: OWNER_AUTHORITY_CONFIRMED — accept C0-ENG-REC-2026-09-11 in
full for synthetic staging, including least-privilege IAM, no standing
Owner/Editor, CI WIF, human JIT ≤8h, dedicated runtime SA, adapter
allowlist, deny-by-default clients, Firestore database-scope residual
risk for this synthetic staging scope, NT$2,000 month baseline, 50%
notify / 80% freeze further C-slice apply / 100% pause Scheduler and
non-essential APIs without detaching billing, DR A+B in asia-east1 with
manual failback, TOTP adjacentIntervals=1, second-manager MFA recovery,
authorization-code lock 5 / 15min exponential / manager unlock / 24h
TTL, no shared break-glass, and C1 as a new isolated project (existing
beauessence-clinic-staging is not C1). Set stageSlices.C0=completed.
Grant deploymentAuthorities.C1=granted to start C1. Keep C2–C6
not_granted until the prior gate PASSes. Split NAMED_REVIEWER_METADATA_PENDING
from owner authority; do not invent person names.
Approved by: clinic owner
Approval date (Asia/Taipei): 2026-09-11
Recorded by: assistant, from the owner's 2026-09-11 continuation
packet. The owner gave the approval; the assistant is not an approver
and did not fabricate a named technical or security reviewer.
Scope: engineering C0 closure and sequential C1 start for Phase-1
synthetic staging only.
Explicit exclusions: not production; not real patient data; not
official DNS; not public /v1/bookings; not production Calendar; not C1
PASS or apply evidence; not C2–C6 granted; not payroll/clinical/payment;
does not authorise this chat session to run terraform apply (local ADC
packet only).
Follow-up: C1 isolated project apply via LOCAL_EXECUTION_PACKET;
NAMED_REVIEWER_METADATA_PENDING remains a person-name field only.
```

Closed-item evidence: [2026-09-11 C0 engineering acceptance](../reviews/2026-09-11-c0-engineering-acceptance.md).

### C0-ENG-REC-2026-09-11 engineering recommendations

Engineering selected Phase-1 values for IAM, budget actions, DR, MFA
parameters and C1 strategy. Owner later accepted them as
C0-ENG-ACCEPT-2026-09-11. This original record remains the recommendation
text; it did **not** itself set `stageSlices.C0=completed`.

```text
Recorded input ID: C0-ENG-REC-2026-09-11
Answer: ENGINEERING_RECOMMENDATION_COMPLETE — IAM: no primitive
Owner/Editor, WIF, IAM Conditions ≤8h JIT, Firestore collection IAM
impossible (residual risk needs human acceptance); budget: notify at
50%, freeze further C-slice apply at 80%, pause Scheduler/non-essential
APIs at 100%, never auto-detach billing, proposed NT$2000/month from
recorded input; DR: option A baseline plus option B secondary project
in asia-east1, reject C and D, manual failback; MFA: adjacentIntervals=1,
in-person second-manager rebind, 5-failure/15-minute exponential lock,
manager unlock, 24h TTL, break-glass not provisioned; C1: new isolated
project, existing beauessence-clinic-staging is not C1.
Approved by: not approved — engineering recommendation only
Approval date (Asia/Taipei): not applicable
Recorded by: assistant, 2026-09-11, under delegated technical
selection. The assistant is not an approver.
Scope: engineering C0 recommendations for later human signature.
Explicit exclusions: does not set stageSlices.C0=approved; does not
grant C1–C6 deploymentAuthorities; does not apply Terraform; does not
accept Firestore database-scope residual risk; does not name billing
email recipients in the public repository.
Follow-up: HUMAN_REVIEW_SIGNATURE_PENDING on
docs/architecture/first-stage-c0-authority.md.
```

Closed-item evidence: [2026-09-11 C0 engineering recommendations](../reviews/2026-09-11-c0-engineering-recommendations.md).

### C0-DIR-2026-09-11 architecture direction

The clinic owner recorded C0 as **direction approved**. Engineering C0
status after C0-ENG-ACCEPT-2026-09-11 is `completed`; the recorded
direction text below is unchanged and still is not C1 PASS.

```text
Recorded input ID: C0-DIR-2026-09-11
Answer: approved as architecture *direction* — GCP+Firebase;
Firestore Native; primary asia-east1; isolated test vs production;
developer-held test billing allowed if no private account/project/
billing/email is hardcoded; production eventually clinic-owned;
staff Google+local MFA; idle 30m / absolute 8h; append-only audit;
existing public site stays; Calendar bidirectional sync in Phase 1;
C1～C6 are the necessary sequential route, not a one-shot apply.
Approved by: clinic owner
Approval date (Asia/Taipei): 2026-09-11
Recorded by: assistant, from the owner's 2026-09-11 C0 packet.
The owner gave the approval; the assistant is not an approver.
Scope: product/architecture direction for subsequent C1–C6 packets.
Explicit exclusions: does not set stageSlices.C0=approved; does not
create/switch production; does not grant C1–C6
deploymentAuthorities; does not select the DR option; does not fill
50/80/100 budget *actions*; does not classify Calendar PII fields;
does not complete MFA-recovery / TOTP clock-skew parameters.
Follow-up: ENGINEERING_CLOSURE_PENDING items in
docs/architecture/first-stage-c0-authority.md. Existing
beauessence-clinic-staging / CAL-PILOT is evidence, not C1 complete.
```

### CAL-SYNC-DIR-2026-09-11 Calendar sync product SLO

```text
Recorded input ID: CAL-SYNC-DIR-2026-09-11
Answer: Phase 1 product direction for bidirectional Google Calendar
sync: system→Calendar via outbox after a successful canonical write,
target seconds to tens of seconds; Calendar→system prefers
events.watch then incremental syncToken; compensating poll 1–5
minutes because notifications are not 100% reliable; channels expire
and are not auto-renewed; overlap must be deduped; conflicts, unmatched
events, delete ambiguity, simultaneous edits, incomplete/illegal
schema and failed authz go to human review — no guessing. Cutover
semantics: before a separate cutover approval, Calendar is the
clinic's legacy operational surface; Firestore slot transactions remain
the availability lock (ADR-0002). After migration, validation and
cutover approval, Firestore becomes the operational source of truth
and Calendar remains a schedule projection / interaction surface.
Approved by: clinic owner
Approval date (Asia/Taipei): 2026-09-11
Recorded by: assistant, from the owner's 2026-09-11 C0/C6 packets.
Scope: product SLO and conflict policy for a future authorised test
environment. Does not approve production D-009/D-016. Does not
authorise reading real Calendar contents. Does not change the
deployed CAL-PILOT five-minute Scheduler. Does not implement
events.watch. CAL-PILOT remains a synthetic-only exception.
The 2026-08-16 recorded 30-minute inbound target is superseded as
*product SLO direction* only; production D-016 remains pending.
```

### GC-001 repository visibility — 2026-09-09

The clinic owner recorded that `waydefu/clinic` remains public and that
historical Rule 1 (the canonical repository must not be public) is retired.

```text
Recorded input ID: GC-001
Answer: approved — `waydefu/clinic` remains the canonical public project
record. Rule 1 is retired.
Approved by: clinic owner / technical owner
Approval date (Asia/Taipei): 2026-09-09
Recorded by: assistant, at the owner's instruction (construction
2026-09-10). The owner gave the approval; the assistant is not an approver.
Scope: GitHub visibility of `waydefu/clinic`, and the matching current-facing
sentences in AGENTS.md Publication, CONTRIBUTING.md, and live-state
conflicts.md.
Explicit exclusions: does not grant production authority, deployment
authority, real-data authority, cloud authority, or secret / IAM /
traffic authority. Does not grant an open-source licence. Does not
retire publication-safety (every committed file MUST be safe for
publication). Does not collapse `waydefu/appointment-platform-public`
into this repository or weaken allowlist export. Does not add PII.
Does not change any D-series status, Stage 2, CAL-PILOT, SEC-02 SAST
engine, or branch protection.
```

Closed-item evidence: [docs/state/conflicts.md](../state/conflicts.md) GC-001.

### CAL-PILOT controlled-correction staging deployment approval — 2026-08-31

After reviewing the actual stacked-PR state, the project owner explicitly
directed deployment, testing and documentation of the synthetic-only
controlled-correction release. PR #31 is the only one already merged into
`main`; PR #32 was merged into the PR #31 feature branch and PR #33 was merged
into the PR #32 branch. Their changes therefore require a new integration pull
request to `main`. This later direction supersedes only the earlier instruction
that PR B remain undeployed, and authorizes the following narrow staging change
after the integration PR and all required checks pass:

- integrate the already reviewed extension and controlled-correction changes
  into `main`, together with recovery of expired `processing` Worker jobs;
- extend the existing synthetic-only kill switch and NT$30 custom-period
  budget as already approved, then deploy new API／Worker revisions, the
  reviewed Firestore index and the matching Hosting build;
- with Scheduler paused and inbound／outbound disabled, supersede exactly the
  29 legacy `invalid_format` candidates that lack an `expectedEtag`, remove only
  their unlinked invalid mirrors, clear the active source cursor and perform a
  controlled full resync; the old candidates must never be populated with the
  mirror's current etag;
- require zero-traffic authenticated smoke, regenerated-candidate verification,
  online browser smoke and an exact rollback record before resuming the
  five-minute Scheduler.

This does **not** approve production D-009／D-016, a production project or
Calendar, real patient data, names, phone numbers, free-text source/editor
fields, anesthesia or other clinical fields, payment data, new accounts,
additional calendars, or changes to Identity／Secret values. Any drift in the
exact candidate count, source generation, two-source allowlist, existing
secrets, manager allowlist or rollback baseline stops the deployment.

### CAL-PILOT synthetic-only extension approval — 2026-08-31

The project owner approved a 60-day extension of the already deployed narrow
CAL-PILOT sub-scope, from `2026-09-29T04:51:37Z` to
`2026-11-28T04:51:37Z`, with these explicit conditions:

- the existing API／Worker revisions, two-calendar allowlist, secrets, manager
  allowlist, five-minute Scheduler and synthetic A01～A30 boundary remain
  unchanged;
- production, real data, `/clinic`, Payroll, surgery, anesthesia, clinical and
  payment capabilities remain frozen;
- the only online Web change removes the now-inaccurate “30 天” wording; feature
  work proceeds in separate pull requests and is not deployed;
- the NT$30 50%／80%／100% alerts cover one static 2026-08-30～2026-11-28
  custom period instead of resetting monthly; they remain alerts rather than a
  hard cap;
- Firebase Hosting may renew only its preview-channel expiry metadata within
  the final seven days, at no more than 30 days per renewal and never beyond
  the application kill switch.

This is approval of the extension plan and exclusions. Cloud mutation remains
gated on the exact extension commit, Terraform diff, Hosting file diff and
recovery list. It does not approve production D-009／D-016 or any new account,
Calendar, field, credential or data source.

### CAL-PILOT D-009／D-016 synthetic-only sub-scope approval — 2026-08-28

The project owner explicitly directed implementation of the pasted
“CAL-PILOT 30 天線上雙向同步計畫” and confirmed execution after identifying
their authority for this test as clinic owner, security owner and operations.
This records a narrow approval, not a production decision:

- **Scope:** one active source selected from exactly two allowlisted dedicated
  CAL-PILOT calendars; synthetic patient codes only; titles are restricted to
  `[預約] A17｜初診｜止鼾` and `[忙碌] 會議` closed formats; five-minute
  incremental synchronization; Google changes become review candidates;
  `manager` may switch sources and `manager`／`front_desk` may review.
- **Expiry and cost:** 30 days after deployment; kill switch disables inbound,
  outbound and synchronization at expiry; on 2026-08-29 the owner reduced the
  alerting budget from NT$300 to NT$30. Notifications at 50%／80%／100%
  (approximately NT$15／24／30) are alerts, not a spending cap.
- **Explicit exclusions:** no production project, production calendar, patient
  name, phone, record, clinical note, payment, attendee, location or other
  free text; no production D-009/D-016 approval; no deployment apply before the
  final exact commit／image digest／resource diff／rollback confirmation.
- **Accepted residual risk:** low synthetic traffic may still incur Cloud Run,
  Scheduler, Firestore, Secret Manager or logging charges; budget notifications
  do not stop spend automatically. A failed source switch must leave the old
  source active, and production must use entirely new identities, secrets,
  allowlists, cursors, audit and kill switch.

The table rows remain `pending for production` because this sub-scope neither
classifies real patient/clinical fields nor authorizes a production Calendar.

Execution evidence: on 2026-08-30 the owner confirmed the exact immutable
candidate and NT$30 alert profile; the synthetic-only release was then enabled
and is recorded in the
[30-day deployment record](../reviews/2026-08-30-cal-pilot-30-day-deployment.md).
The owner also reported that legacy operational titles may contain an editor
name and source, patient name and phone, service, and general／local anesthesia.
That observation is a future migration input only: it does not expand this
approval. The deployed parser must continue to reject those titles as
`invalid_format`, must not block availability from them, and must not ingest
the personal or clinical fields.

### Owner answers to the 2026-07-27 requirements questionnaire

The assistant put 30 questions to the project owner in plain language. These are
**answers of record**; each one still leaves its decision `pending` unless the
row above says otherwise, because several depend on facts nobody has confirmed
yet (a privacy email, the production domain, Workspace availability).

**Clinic facts re-checked on 2026-07-28:** the official clinic site matches
the name 一森渼診所, address 臺北市松山區光復北路 112 號 2 樓, phone
02-2577-1314 and toll-free 0800-000-913. Its current
[reservations page](https://beauessence.com.tw/reservations/) publishes
**Mon–Fri 11:00–20:00 and Sat 11:00–16:00**. That conflicts with the recorded
owner answer and current synthetic code, which use **Wed–Fri 12:00–20:00 and
Sat 10:00–18:00**, closed Sun/Mon/Tue. The earlier claim that the official
schedule belonged to a different clinic was incorrect. On 2026-07-28 the
project owner selected the latter schedule as the formal operating direction;
the official site is now the stale surface that must be corrected. D-004 still
needs executable duration/capacity/resource answers before the whole decision
can be approved. **No public email address was found**, which is why the
temporary privacy-contact input below uses the clinic phone.

- **D-001/D-003 privacy contact: the clinic phone, for now.** Recorded as
  temporary. A phone-only channel means every rights request has to be written
  down by hand to be auditable; an email address remains the preferred answer
  before real patient data is collected.
- **D-002 retention: delete booking data two years after the visit.** Deletion
  may be performed by administrators only, and must record a reason.
- **D-002 third parties: Google only** (Calendar and cloud) at this stage.
- **D-010 data region: Taiwan (`asia-east1`).**
- **D-004 services: 止鼾 and 醫美 actual treatment duration is not fixed before
  arrival**, with the final scope agreed with the patient at the visit. The
  earlier 40–60-minute stop-snoring range is superseded as a formal scheduling
  rule; neither service gets a catalogue duration, selectable duration
  increment or auto-calculated treatment end. One patient per slot remains a
  candidate. ~~Booking horizon 60 days is provisional.~~ **Superseded
  2026-08-16: the booking horizon is 1 month, with 2 months reconsidered only
  after operations stabilise.** One patient per slot is likewise no longer a
  candidate — the 2026-08-16 answer sets concurrent capacity to 1. Closed days
  follow the published hours plus national holidays.
- **D-004 booking multiplicity: multiple services are allowed in one formal
  appointment** (owner answer, 2026-07-28). The browser already uses multiple
  `itemIds`, while the executable API contract/domain still accepts one
  `serviceId`/`itemId`; the routed contract, persistence and idempotency model
  must move together. Later on 2026-07-28 the owner clarified that the actual
  duration of both 止鼾 and 醫美 is only known at the visit and must not be
  hard-coded. Formal design must therefore separate the concrete operational
  slot interval used for conflict/capacity control from
  `actualStartedAt`／`actualEndedAt` encounter facts. Multi-service selection
  does not auto-sum service durations. The published slot-block/capacity rule,
  multi-service occupancy and buffer/overrun handling remain unanswered.
- ~~**D-005: patients may cancel up to 24 hours before**~~; after that it is a
  phone call. No-shows are recorded, not charged. **Superseded 2026-08-16: the
  patient self-cancellation cutoff is 10:00 on the appointment day.** After the
  cutoff it remains a phone call, no-shows are still not charged, and three
  no-shows now restrict future booking.
- **D-006 approved:** Google sign-in plus a clinic-managed local-account option
  (the clinic has no Google Workspace yet). Roles gain **醫師** alongside
  administrator and front desk. Completing a visit stays with front desk and
  administrators. **Deleting a booking may be delegated to the front desk
  behind multiple administrator-issued authorization codes that are hashed,
  individually revocable and attempt-limited.** All staff require MFA; local
  accounts use TOTP; idle timeout is 30 minutes and absolute session lifetime
  is 8 hours; disabling an account must reject its next protected request.
  Administrators may delete qualifying appointment records, while audit is
  permanent, append-only and cannot be deleted by any role. Unspecified actions
  and emergency access default to denied.
- **D-007/D-008: make the authority configurable rather than fixed.** Front desk
  and administrators may both assign a case manager; only administrators may
  reassign; both capabilities need an on/off switch in account management. The
  payroll metric is likewise administrator-defined. Only administrators approve
  changes after a period is locked.
- ~~**D-009: the clinic's shared calendar in production**~~, a dedicated test
  calendar for now. Event contents stay minimal (clinic, booking type, time).
  **Superseded 2026-08-16: production uses a separate, dedicated calendar, not
  the clinic's existing shared one.** The same answer set also asks for the
  service item to appear on the event, which is in tension with minimal event
  contents and must not be implemented before D-009 classifies that field.
- **D-010 approved target (2026-07-28):** the clinic is the legal and billing
  owner of Cloud projects; administrator and developer roles hold governed IAM
  access; the primary region is `asia-east1`; RPO is one hour and RTO is four
  hours, including whole-project and regional failures. Incident contact:
  wayde.fu@gmail.com / 0983317651. This approval requires the Stage 2 design to
  close the current single-region/cross-project recovery gap; it is not evidence
  that backups, failover, alerts or a restore drill already exist.
- ~~**D-011: an English version is required** (Beau Essence Clinic)~~, and a
  phone number must stay visible for people who do not book online.
  **Superseded 2026-08-16: no English version is required.** The visible manual
  fallback number is confirmed as 02-2577-1314.

### Owner answers to the 39-question decision list - 2026-08-16

All 39 questions came back answered. The full question-by-question
reconciliation, including which earlier answers these supersede, is
[the 2026-08-17 reconciliation record](../reviews/2026-08-17-owner-decision-reconciliation.md).

**Attribution (recorded 2026-08-17; corrected 2026-08-23).** The 2026-08-17
record stated that the answers were filled in by the clinic owner, and concluded
that two approval-format fields — approver and approval date — were therefore
satisfied. **The technical owner corrected this on 2026-08-23: the clinic owner
gave the answers verbally and the technical owner transcribed them on the owner's
behalf.**

**That correction removes the approver field, not just weakens it.** A verbal
statement relayed and written down by someone else is not the named approver's
own recorded approval, and the answer sheet is explicit on this point: 「口頭說
『可以』不足以解除系統的檢查關卡」— saying "yes" out loud does not release the
system's check gates. At most the **date** of the verbal statement is recorded.
Every row below therefore has **one fewer** approval-format field satisfied than
the 2026-08-17 record claimed.

Nothing about the answers' content changed; the reconciliation in
[the 2026-08-17 record](../reviews/2026-08-17-owner-decision-reconciliation.md)
remains accurate. Only the attribution and its consequence changed. That dated
record is left unedited as historical evidence.

**They are still not approvals.** Four things are missing, and they are
missing for different reasons:

0. **A named approver's own signature.** See the correction above. This is now
   the first gap, not an assumed-satisfied field.

1. **Co-approvers.** The owner column below is not "clinic owner" alone for
   most rows. D-002/D-003 need the privacy/legal owner, D-005 the legal owner,
   D-009/D-016 the security owner, D-014 the medical **and** privacy/legal
   owners. The clinic owner's answer does not stand in for them.
2. **Scope, explicit exclusions and accepted residual risk** are not recorded
   for any of the 39, and the answer sheet requires all three.
3. **Several answers do not cover the question asked** — backups, the Google
   processor agreement and the budget-threshold actions are each half-answered
   (see the bullets below).

Every decision below therefore stays `pending` or `deferred`. What changed is
that the input now exists and is attributed.

- **D-001/D-003 rights requests:** the clinic's responsible person and Mr. Yan
  are the named contacts, reached on the clinic phone, with designated staff
  performing additions, corrections and deletions. The privacy policy is signed
  off by the responsible person; superseded policy versions and consent records
  are kept for 2 years. A patient's request for a copy of their own data is
  answered within 1 week. The phone-only channel still has to be made auditable,
  and the delivery format is unspecified.
- **D-002 retention and deletion:** booking data is kept 2 years, confirming the
  earlier answer. Deletion is owned by the clinic's responsible person and
  leaves a system deletion record. **The question asked whether backups are
  deleted with the primary copy; the answer addresses the system only, so backup
  deletion, restore-replay and legal hold remain unanswered.**
- **D-002/D-010 region: Taiwan**, consistent with the recorded `asia-east1`.
- **D-002/D-009 Google as processor:** the answer permits authorising users on
  Google Calendar. **It does not answer whether a data-processing agreement is
  required**, which was the second half of the question.
- **D-004 scheduling:** concurrent capacity is 1; multiple services occupy one
  fixed booking time and durations are not summed; the horizon is 1 month;
  Sunday, Monday and Tuesday are closed and the responsible person may close a
  day; a running-late clinic is adjusted manually by the front desk. The
  operational slot interval, the resource model behind the capacity of 1, buffer
  and overrun handling and blackout semantics are still unanswered.
- **D-005 cancellation:** patients may cancel until 10:00 on the appointment day;
  after that they phone in; no-show carries no fee; three no-shows restrict
  future booking. How long the restriction lasts, who may override or reset it,
  and how emergencies are handled are not answered.
- **D-007 case management:** assignment is manual, a supervisor may reassign, and
  the patient is not notified. `王小姐` reviews duplicate-patient merges. Merge
  rollback, mistaken-merge recovery and merge evidence remain open, and
  "supervisor" has not been mapped onto the existing `administrator` role.
- **D-008/D-015 finance:** performance and commission are based on the
  transaction amount. Period close, post-lock adjustment, the authoritative money
  ledger, refunds and the staff-settlement source are all **deferred** by owner
  direction. Nothing here authorises persisting money or settlement amounts.
- **D-009/D-016 Calendar:** production uses a separate dedicated calendar;
  inbound Calendar edits and deletions go to manual review; on conflict the
  system is authoritative with a 30-minute target. The owner also asks for the
  service item on the event. Reviewer role, matching identity, delete semantics
  and the privacy classification of event contents are unresolved, and no
  Calendar connection is authorised.
- **D-011 public booking:** the production booking URL is to sit under the
  existing site pending discussion with the server vendor; no English version;
  the manual fallback number is 02-2577-1314.
- **D-012 NHI mark:** the owner wants the mark on the formal website. The
  existing approval still covers the synthetic preview only; production use is
  recorded as owner intent, not as an enlarged approval.
- **D-014 surgery and clinical data — operational direction, not a legal
  classification.** The owner's direction is that the system retains only the
  surgery name, keeps it for six months, accepts correction requests by phone or
  email, and that the stored item is intended as operational
  scheduling/follow-up information rather than a full clinical chart. **Whether
  these records are legally medical records under the Medical Care Act is not
  settled by this answer** and remains subject to named medical, privacy and
  legal review. Do not implement clinical persistence on the strength of it.
- **D-010/C0 cost:** the clinic and its responsible person own the cloud bill;
  the staging budget ceiling is NT$2,000 per month; budget alerts go to `王小姐`
  with the responsible person copied. **The question also asked what action to
  take at 50%, 80% and 100%; only the recipients were answered, so C0 cost
  governance is still incomplete** — an alert with no agreed action is not a
  control.

### D-006 partial: deletion delegated to the front desk behind a passcode - 2026-07-27

Deleting a booking was administrator-only. The owner's answer was that the front
desk needs it in the moment, but behind a passcode the administrator sets, with
**several passcodes that can each be switched off independently**. Several is
the point: when one person leaves or one code is seen over a shoulder, that code
is revoked without changing everyone else's.

Implemented as a **delegation**, not as a permission move. `front_desk` still
does not hold `delete_appointment`; the delegation is a second, separate path
that requires presenting an enabled authorization. Keeping them apart means the
audit trail always distinguishes "this role has it" from "this person was
authorised this once" — moving the permission into the role would have erased
that distinction permanently.

Rules live in `packages/domain/src/delegated-authorization.ts` so that when real
authentication arrives (D-006), only the comparison changes, not the judgement.
Decisions worth keeping:

- **A disabled authorization is indistinguishable from one that never existed.**
  Reporting "that code is disabled" would confirm to a revoked holder that their
  code was real. Matching happens only within the enabled set.
- **"No authorization configured" and "wrong passcode" are different messages.**
  The first means go and find the administrator; the second means you mistyped.
  Merging them strands the front desk without knowing who to ask.
- **Defaults are off, with no authorizations.** Shipping a default passcode would
  mean the delegation was never really a decision anyone made.
- **The audit records which authorization was used — never the passcode.** Audit
  events get exported, printed and forwarded.
- **The passcode is never displayed back**, not even to administrators. The
  screen is beside patients and gets screenshotted; if it is forgotten, disable
  it and add another.

**The current browser implementation is still not a security boundary.**
Comparison is plaintext in the synthetic browser, same class as the synthetic
login (AUTH-001). The policy was later approved, but no production IdP,
server-side hash comparison, session enforcement or authorization route exists.

### D-006 identity, security and audit boundary approved - 2026-07-28

The owner first approved the safe interpretation of “unlimited;
administrator self-deletes”:

- an administrator may delete an appointment only through the separately
  authorised delete command and its closed reason codes;
- the resulting audit event outlives the appointment;
- audit storage is permanent and append-only;
- administrators, developers, service accounts and every other role are denied
  audit deletion.

The owner then approved **all remaining D-006 controls**:

- Google federated sign-in plus clinic-managed local accounts; credentials stay
  in the approved IdP rather than application/Firestore documents;
- staff roles include administrator, front desk and physician; front desk and
  administrators may complete a visit, while unlisted actions are denied;
- all staff must use MFA; local accounts use TOTP;
- idle timeout is 30 minutes and absolute session lifetime is 8 hours;
- disabling an account revokes its sessions and must reject the next protected
  request, rather than waiting for a previously issued token to expire;
- authorization codes are stored only through a salted memory-hard KDF,
  individually revocable, never displayed again and retry-limited; repeated
  failures lock delegation verification and produce audit;
- no break-glass policy was included in the approval. The safe planning default
  is therefore fail-closed until emergency access is separately decided.

Implementation and test details are frozen in the
[Stage 2 identity and cloud change plan](../architecture/stage-2-identity-and-cloud-change-plan-2026-07-28.md).
D-006 is `approved`; this is a policy approval. Local unrouted evidence now
includes canonical roles, a server-side scrypt verifier, atomic in-memory
attempt-lock persistence, a denied-event audit sink, staff IdP claim mapping
to D-006 roles, D-006 session lifetime evaluation, and fail-closed field
projection. This is still not evidence that synthetic browser login, routed
C4 enforcement, Identity Platform, durable audit storage, or any cloud
identity boundary satisfies D-006.

**Retention clarification required by D-002 (2026-08-11 audit):** append-only
integrity means an authorised event cannot be edited or silently deleted; it
does not by itself authorise indefinite linkability to a patient. D-002 must
still decide retention, pseudonymisation, legal hold, rights-request handling,
deletion tombstones and restore-time deletion replay. Until then, “permanent”
is the recorded D-006 integrity direction, not a completed privacy/legal
retention determination or production implementation.

### Fonts: system stack retained - 2026-07-27

**Decision: do not load a Chinese webfont.** The zero-kilobyte font budget is
therefore a **decision, not an unfinished task** — a subset Chinese face still
costs several hundred kilobytes against a 58 KB page, and the cost lands hardest
on a phone outside on mobile data. Typography keeps using the system stack, and
`tests/e2e/theme.spec.ts` already pins "not a single font file is downloaded".

### Opening hours selected; official site correction required - 2026-07-28

The obsolete **20:30** synthetic closing time was correctly removed after the
owner confirmed a 20:00 weekday close. The current `defaultSchedule`,
structured data and clinic prose use Wed–Fri 12:00–20:00 and Sat
10:00–18:00; Wednesday generates 13 初診 / 12 回診 slots (last starts 19:30
and 19:15).

The clinic's official reservations page was re-checked on 2026-07-28 and still
publishes Mon–Fri 11:00–20:00 and Sat 11:00–16:00. The owner then selected
**Wed–Fri 12:00–20:00 and Sat 10:00–18:00** as the formal operating schedule.
The repository already matches that answer; the official site must be corrected
through its own controlled content process. D-004 no longer needs a
service-derived duration: the owner has said that actual stop-snoring and
aesthetic duration is known only at the visit and must not be hard-coded.
D-004 remains pending for the operational slot-block/capacity, multi-service
occupancy, resource, horizon, blackout and overrun rules. Any `20:30` value
remains stale.

### D-010 infrastructure and resilience target approved - 2026-07-28

The owner approved the clinic as legal/billing owner of the Cloud projects,
governed IAM access for administrator and developer roles, `asia-east1` as the
primary region, and RPO one hour／RTO four hours for database, whole-project and
regional failures.

This is a **target approval, not implementation evidence**. The current plan is
single-region, no cloud project/backend has been created, and no cross-project
or cross-region restore has been exercised. Stage 2 must produce a reviewed
change plan that identifies separated environments, least-privilege roles,
alert recipients, backup/failover mechanisms, cost and a drill capable of
demonstrating the target. D-006 and D-010 decision prerequisites are now
approved; a separately reviewed Stage 2 change plan and deployment approval
still block any cloud action.

### Expansion S: surgery, follow-up, payment and Calendar inbound - 2026-07-28

The owner supplied a detailed surgery scheduling and follow-up workflow covering
patient timelines, four calendar event types, surgery resources, anesthesia,
payments, refunds, role-scoped views and staff settlement. It is normalized in
the
[Expansion S plan](2026-07-28-surgery-follow-up-expansion-plan.md).

The input does not silently expand Phase 1. D-014 gates clinical/surgical
records, D-015 gates persisted money, and D-016 gates Calendar-to-system writes.
The 2026-07-28 input required Google Calendar to synchronize with the workbench
but did not select auto-apply versus review. Superseding 2026-08-16 input now
selects manual review, system authority and a 30-minute target. D-016 still
remains pending because reviewer role, matching identity, delete semantics,
scope/exclusions and approval metadata are unresolved. The accepted ADR remains
that Calendar is not the appointment/capacity lock.

### D-016 partial: Calendar must synchronize with the workbench - 2026-07-28

The owner answered that Calendar inbound is to synchronize with the workbench.
This records the required operator surface and convergence goal:

- outbound states (`queued`, `synced`, `failed`) and inbound states
  (`pending_review`, `conflict`, `approved`, `rejected`, `superseded`,
  `sync_error`) belong in the workbench rather than a hidden worker-only log;
- Calendar notifications wake an incremental sync; they do not identify a
  specific event or directly mutate an appointment;
- a re-sync may rebuild only the Calendar mirror/candidate store, never the
  authoritative appointment, encounter, surgery or permanent audit stores;
- every accepted external change must still execute a normal domain command,
  recheck current resource conflicts and append audit.

This did **not** close D-016. At the 2026-07-28 checkpoint, “synchronize with the
workbench” did not answer whether linked inbound edits may auto-apply, who
reviews an unknown event, how a Google deletion maps to cancellation, conflict
precedence or the candidate handling SLO. The 2026-08-16 input later selected
manual review, system precedence and a 30-minute target, but reviewer identity,
matching, delete semantics and formal approval remain open. The safe proposed
behavior therefore remains an isolated workbench review queue and no automatic
Calendar-to-system write path.

The drift check that caught the prose copies did **not** cover the JSON-LD
numbers, because those use `"opens"/"closes"` rather than the `12:00–20:00`
human form — the structured data could have kept publishing 20:30 to Google
with every check green. That gap is now closed too.

### D-012 NHI mark: knowingly retained on the synthetic preview - 2026-07-26

The 2026-07-26 full-project audit found that the patient page displays the NHI
contracted-institution mark on a publicly reachable preview whose title says
測試版本, and that no document or decision had ever covered the **permission** to
do so — every existing mention treated the mark as an image-budget and
rendering problem. The mark is a registered trademark; the Ministry of Health
and Welfare states that misuse carries liability, and the NHIA publishes usage
notes.

**Owner decision: keep it, risk accepted (option C of three offered).** The
alternatives were to confirm against the NHIA usage notes, or to strip the mark
from the preview and restore it at go-live.

What this decision **is**: the owner reviewed the exposure and chose to leave the
mark in place on the expiring synthetic-review channel.

What it is **not**: a confirmation that the usage complies with the NHIA notes.
Nobody has checked them against this use. That check is still owed before the
mark appears on the production domain, and D-012 must be revisited then — the
`approved` status above is scoped to the preview channel only.

Why the residual risk is small in the meantime: the channel expires in seven
days, carries `X-Robots-Tag: noindex`, and is reachable only by someone given the
link. No asset was changed by this decision.

### D-013 Branch protection: required check plus an admin bypass - 2026-07-26

The same audit found that `verify.yml` runs on every push and that the
`evidence` job is built to fail whenever any upstream job fails — but nothing
proved GitHub was configured to **require** it, and the assistant could not read
that setting (no `gh`, no token). A gate nobody requires is a display.

**Owner decision: require the check, but keep the administrator bypass.**

That 2026-07-26 text is dated history. **Current authority is the 2026-09-09
amendment:** administrators are bound by the same required checks.

- Required status check on `main`: **`Verification evidence`** — the job's
  `name:`, not its id `evidence`. GitHub's status-check context uses the display
  name; configuring the id would silently require a check that never reports.
- Original 2026-07-26: "Do not allow bypassing the above settings" stays
  **unchecked**. **Superseded.**
- Original 2026-07-26: **any tool acting with the owner's credentials inherits
  that bypass**. **Superseded.**

**Amendment — 2026-09-09:** the clinic owner adopted `enforce_admins=true` so
administrators cannot bypass required status checks or other branch protection.

```text
Approval ID: D-013
Answer: approved amendment — require `Verification evidence` on `main`, and
require "Do not allow bypassing the above settings" (`enforce_admins=true`).
Administrators may not bypass required checks. Force pushes and branch deletion
stay disabled. Do not reduce the required-check set, add a new required GitHub
status-check context unless a later named decision says so, or weaken any other
protection field.
Approved by: clinic owner / technical owner
Approval date (Asia/Taipei): 2026-09-09
Recorded by: assistant, at the owner's instruction. The owner gave the approval;
the assistant is not an approver.
Evidence: GitHub API GET /repos/waydefu/clinic/branches/main/protection at
2026-09-08T16:44:40Z and reconfirmed 2026-09-08T18:05:00Z —
enforce_admins.enabled=true, required_status_checks.contexts=["Verification evidence"],
strict=true, required_approving_review_count=0, allow_force_pushes=false,
allow_deletions=false, no rulesets. `scripts/check-branch-protection.mjs` asserts
the required check name and these D-013 policy fields. GC-002 closes on this
amendment plus that live evidence.
Scope and explicit exclusions: `main` branch protection only. It does not approve
deployment, real data, D-004/D-005, Stage 2, C0–C6, or any other D-series item.
It does not authorise lowering required checks or enabling force push.
Residual risk accepted: required_approving_review_count remains 0; conversation
resolution remains required. Both approver roles were signed by one person.
WP-B5-2 (2026-09-15) keeps required_approving_review_count=0 and does not
raise it to 1.
```

**The consequence, stated plainly:** a green CI run is a merge gate for
administrators as well as collaborators. Direct pushes that skip the required
check are a protection violation, not an approved bypass. Verify the setting
with `corepack pnpm run check:branch-protection` (needs a token with
`administration:read`); with no token it exits 2, never 0.

**Execution evidence — 2026-07-31:** the classic branch-protection rule is now
configured on `waydefu/clinic@main` with strict required status check
`Verification evidence`. At that date administrator enforcement remained off.
Force pushes and branch deletion were disabled; pull-request reviews were not
required by this rule. The authenticated `check:branch-protection` command
returned success after the remote setting was applied.

**Live setting reconfirmed — 2026-09-08 / policy amendment 2026-09-09:**
`enforce_admins.enabled=true`. The 2026-07-31 "administrator enforcement remains
off" sentence is dated evidence, not current Canon.

**SEC-02 and SEC-03 approved — 2026-08-01:** the repository owner approved both
repository-security items and instructed that they be recorded on their behalf.

```text
Approval ID: SEC-02
Answer: approved — a pinned Semgrep CE scan producing commit-bound JSON/SARIF, rule hashes and a summary artifact is accepted as the blocking SAST evidence while a private personal repository cannot upload code-scanning results.
Approved by: repository owner, acting as both technical owner and security owner
Approval date (Asia/Taipei): 2026-08-01
Recorded by: assistant, at the owner's instruction. The owner gave the approval; the assistant is not an approver.
Evidence: commit 007d808; `.github/workflows/sast.yml` with a pinned engine image and rule revision; `security/semgrep/` rule configs with positive/negative fixtures; `scripts/generate-sast-evidence.mjs` and its 13 tests.
ENG-01 condition satisfied: the Semgrep rule tests run as the `rule_tests` step and are consumed as `SAST_RULE_TEST_OUTCOME`, where anything other than `success` classifies the evidence as `scanner-error`; the evidence-generator tests run inside `test:unit`, which `verify` and the required `Verification evidence` check both execute. Either failing turns the gate red.
Scope and explicit exclusions: applies to the SAST evidence policy only. It does not approve any D-series decision, cloud resource, route, real data, or the public mirror. It does not assert that Semgrep CE is equivalent to CodeQL.
Residual risk accepted: (1) Semgrep CE performs rule-based pattern matching, not CodeQL's cross-file taint analysis, so a class of data-flow defects remains undetected; re-evaluate before production. (2) Both required approver roles were signed by one person, so this decision received a single review rather than two independent ones.
Follow-up implementation issue: re-evaluate the SAST engine when the repository becomes eligible for code-scanning upload, or before production go/no-go, whichever comes first.
```

**Implementation verification correction — 2026-08-11 (read-only audit):**
the SEC-02 approval and ENG-01 policy intent remain unchanged. However, the
claim that either SAST-side failure blocks merging is not proved at the current
branch-protection boundary. `.github/workflows/sast.yml` is independent, while
the sole required `Verification evidence` job depends only on `verify`,
`rules`, `e2e` and `supply-chain`. Until branch protection requires the exact
SAST check or `Verification evidence` consumes a same-commit SAST result,
record SEC-02 as **approved policy; merge-blocking implementation evidence
pending (`SCM-R01`)**. This correction does not rewrite who approved the policy
or what they approved. A read-only GitHub API check at 2026-08-11 14:32 +08:00
subsequently confirmed that `main` has no repository ruleset and requires only
`Verification evidence`; PR #14 showed the independent Semgrep check green while
the required aggregate was red. No remote setting was changed.

**Implementation evidence supplied — 2026-08-18 (`SCM-R01`):** the pending
condition above is now met, and SEC-02 should be recorded as **approved policy
with demonstrated merge-blocking enforcement**. `Verification evidence` consumes
a same-commit SAST result: the scan moved to
`.github/workflows/sast-scan.yml` (`workflow_call`), `verify.yml` calls it as the
`sast` job inside the same run, and the `evidence` job needs it, so all five
required results are bound to one candidate commit. The evidence artifact also
records the commit the scan named and fails when it differs from the candidate.

The proof is behavioural. PR #18 (implementation `373757c`, candidate
`351e403484fcb0d80356b973eefd494363d8ef13`, run `32100761005`) passed all eleven
jobs with Semgrep reporting 0 findings across 173 files. PR #19 added one
synthetic file tripping the existing repository-owned rule
`clinic.javascript.weak-cryptography`; on candidate
`d49330c83e56264e123a718a3619070557d0226c` (run `32101192719`) the `sast` job and
`Verification evidence` both went red while the other ten jobs stayed green,
GitHub reported `mergeStateStatus=BLOCKED`, no administrator bypass was used, and
the pull request was closed unmerged. No branch-protection setting was changed —
the required context is still exactly `Verification evidence`.

What this does not change: the recorded residual risks stand. Semgrep CE remains
rule-based rather than CodeQL cross-file taint analysis, code-scanning upload is
still unavailable, and both approver roles were still signed by one person. The
2026-08-18 SCM-R01 implementation did not itself change D-013; the 2026-09-09
amendment separately binds administrators. SCM-R01 still enforces the protected
merge path for the SAST aggregate.

```text
Approval ID: SEC-03
Answer: approved — the high `brace-expansion` advisory (GHSA-mh99-v99m-4gvg / CVE-2026-14257) is accepted as a time-bounded exception on its current limited paths.
Approved by: repository owner, acting as both technical owner and security owner
Approval date (Asia/Taipei): 2026-08-01
Recorded by: assistant, at the owner's instruction. The owner gave the approval; the assistant is not an approver.
Evidence: `security/audit-exceptions.json`; `scripts/check-audit-exceptions.mjs` prints the exception on every supply-chain run and fails once it expires.
Scope and explicit exclusions: development-only resolution paths that are not reachable from a route and receive no attacker-supplied glob. It does not permit dismissing the Dependabot alert, adding further ignores, or extending the exception past its expiry without a new approval.
Residual risk accepted: a denial-of-service vector remains present in development tooling until an upstream fix exists. Both approver roles were signed by one person.
Expiry: 2026-08-31. Re-check on every dependency upgrade; remove the ignore once any parent package resolves to brace-expansion 5.x.
Follow-up implementation issue: re-verify at each dependency upgrade and before the expiry date.
```

**SEC-03 released rather than renewed — 2026-08-01:** hours after SEC-03 was
approved, the underlying advisory was revised (2026-07-31T19:37Z) to list a first
patched version for every affected major: 1.1.17, 2.1.3, 3.0.3 and 5.0.8. The
recorded release condition — "remove this entry once the upstream older major
publishes a fix" — was therefore met, and the premise the approval rested on
("the affected older majors have no compatible published fix") no longer held.

The dependency is now pinned per major (`brace-expansion@^1: ^1.1.17`,
`brace-expansion@^2: ^2.1.3`, alongside the existing `^5` pin) and resolves to
1.1.18 / 2.1.4 / 5.0.8. The `auditConfig.ignoreGhsas` entry and the exception
registry entry were both removed, so the repository now carries **no audit
exceptions at all**.

SEC-03 is therefore **resolved, not renewed**. The approval remains recorded as
given, because it was correct on the facts available at the time; what changed is
the upstream advisory. The correct end state for a time-bounded exception is
removal, not extension, and that is what happened here — with three weeks left on
the clock rather than at the expiry date.

**Technical-owner engineering decisions — 2026-08-01:** the repository/technical
owner approved four engineering-practice decisions raised through the AGENTS.md
"Grill me" challenge. They are recorded here because each one changes how a gate
behaves or what a later approval must cover. **None of them approves SEC-02,
SEC-03 or any D-series decision**, and none authorises cloud resources, routes or
real data.

| ID | Decision | Effect |
| --- | --- | --- |
| ENG-01 | SEC-02 must require the Semgrep rule tests and evidence-generator tests inside the blocking gate, with either failure red | Incorporated into approved SEC-02; required-check enforcement remains pending the 2026-08-11 correction |
| ENG-02 | SEC-02 approval was a prerequisite for merging the SAST change; a deliberately non-blocking interim workflow was rejected | Approval was satisfied 2026-08-01; this does not prove the current separate SAST workflow is a required merge check |
| ENG-03 | The production data model uses store-generated document IDs. Any operational serial number the clinic needs is a separate field, never the document ID | Closes plan risk R3 (monotonically increasing IDs cause Firestore write hotspots) before it reaches an implementation slice |
| ENG-04 | Every `auditConfig.ignoreGhsas` entry must carry a named approval ID and an expiry date in `security/audit-exceptions.json`, and the supply-chain gate must print each ignored advisory individually | Implemented as `check:audit-exceptions`; an unregistered, incomplete or expired exception now fails CI |

```text
Approval ID: ENG-01, ENG-02, ENG-03, ENG-04
Answer: approved as written above
Approved by: repository/technical owner
Approval date (Asia/Taipei): 2026-08-01
Evidence: scripts/check-audit-exceptions.mjs and its tests; docs/product/full-project-master-plan-2026-07-31.md §2.1 and §9
Scope and explicit exclusions: engineering practice and gate behaviour only; excludes SEC-02, SEC-03, every D-series decision, cloud resources, routes and real data
Residual risk accepted: ENG-03 is a design decision recorded ahead of implementation; it still needs an ADR when a persistence slice is built
Follow-up implementation issue: ADR for the document-identifier scheme before C6
```

**Repository-hosting direction — 2026-07-31:** the repository owner directed
that the access-restricted canonical repository remain in the current personal
account for now and not be transferred to an organisation. This is a hosting
direction, not an approval to weaken SAST. Private-personal code-scanning upload
eligibility remains a platform constraint. SEC-02 approved commit-bound Semgrep
CE artifacts as interim evidence, subject to its residual risks and
pre-production re-evaluation; that approval does not prove required-check
enforcement. See the 2026-08-11 correction above.

### Web-standards audit directions - 2026-07-26

The 2026-07-26 web-standards audit raised two questions it refused to answer by
guessing. The project owner answered both. These are **build directions for the
synthetic/test implementation**; neither changes a decision status to
`approved`.

- **D-011 direction (booking-site URL): `/booking`.** The patient booking page
  is to be served at `/booking`, which is what `patient.html` already claims in
  its `canonical` and `og:url`. **Historical audit finding, now resolved:** on
  2026-07-26 the deployed path was `/patient.html` and the advertised URL
  404ed. On 2026-07-28 `/booking` was rechecked as HTTP 200 with `no-cache` and
  `noindex`. **D-011 stays `pending`**: the accessibility and language needs and
  the manual-booking fallback are untouched, and the registered domain itself
  is still to be confirmed before go-live.
  `beauessence.com.tw` is only what the markup currently claims; it was not
  inferred from any external source and must be confirmed by the clinic.
- **Build strategy (per-entry bundling): declined. Readability wins.** The audit
  proposed bundling each entry point into one file, which would cut the patient
  page from 31 module requests to 2. The owner declined: `dist/` must stay
  traceable to `public/` file by file so the shipped code can still be read and
  checked against source. The consequence is recorded deliberately —
  `<link rel="modulepreload">` is now the **permanent** answer to the request
  waterfall, not a stopgap, and the module count must be held by a gate so it
  cannot quietly regress.
  - Correction of record: `scripts/build-web.mjs` justified not bundling with
    "CSP is `script-src 'self'`, so the output must stay one file per module".
    That reason is **wrong** — CSP constrains a script's origin and whether it is
    inline, not how many files there are; a single same-origin bundle satisfies
    `script-src 'self'`. The decision stands on the readability grounds above,
    and the comment is to be corrected to say so rather than left asserting a
    constraint that does not exist.

### Owner build directions, formal audit deferred to go-live - 2026-07-24

The project owner reviewed the open decisions and directed that the team keep
building and testing all functionality toward go-live now, and that the formal
answers to D-001～D-011 be **audited together before go-live** rather than
resolved individually today. The following are **build directions for the
test/synthetic implementation only**; they do **not** change any decision status
below to `approved`, and no real patient data may be relied upon.

- **D-002 / D-003 (retention, deletion, policy text): 待定 (deferred).** No
  change; remains `pending` for the pre-go-live audit.
- **D-001 (data controller, privacy contact): 待定 (deferred).** No change;
  remains `pending`.
- **D-006 direction at that time:** staff sign in with **account + password**, and the
  **manager (管理者) may cancel/delete**. This records the intended shape for the
  test build. The audit-retention ambiguity was superseded by the 2026-07-28
  permanent append-only decision above; the identity, MFA, session, role and
  authorization-code direction was then fully approved later on 2026-07-28.
  The browser implementation described here remains synthetic evidence and
  does not implement that approval.
  - Implementation reading of "cancel/delete" (2026-07-24, synthetic build):
    the front desk **keeps** cancelling — it is a daily counter action, and
    routing it through a manager would stall the front desk. **Deleting** is
    administrator-only (`delete_appointment`), because it removes the record
    from the operational list and leaves only the audit event. Deletion also
    requires a reason from a closed list (`duplicate_record`, `wrong_patient`,
    `created_in_error`), since the audit event outlives the record it explains.
    Patient-initiated erasure is deliberately **not** one of those reasons: it
    is a data-rights workflow gated on D-002. This split is a build decision
    for the test system; the later 2026-07-28 D-006 approval confirmed
    administrator delete and front-desk delegated delete, while D-005 still
    owns cancellation and D-002 owns erasure.
- **D-009 direction:** use a **dedicated test calendar** for now, with the
  **manager (管理者) as the responsible owner**. Consistent with the 2026-07-23
  test-integration authority. D-009 stays `pending`: the production calendar,
  authorization model, scopes and minimum event fields remain for the audit.
- **CAL-001 (patient calendar export) decided:** the patient's downloaded
  `.ics` stays a **single reminder time point** (start time only, day-before
  alarm), which is what `modules/calendar-export.js` already implements
  (2026-07-22 direction). The clinic-side one-hour projection is a separate
  synthetic fixture, not a service or actual-treatment duration. No further
  change to this historical fixture is required; covered by
  `calendar-export.test.ts`.

Standing limits unchanged: `noindex`, synthetic data only, no cloud backend, no
authenticated write endpoint and no real Calendar connection are enabled by this
note. Changing a decision to `approved` still requires the named owner to record
the answer, approval date and evidence in the table and template below.

### Current synthetic patient identity scope - 2026-07-27

The 2026-07-27 owner batch superseded the narrower 2026-07-21 field shape for
the synthetic preview. The current allowlist is name, phone, birth month/day
with optional year, national ID/new resident ID or passport, NHI-card intent, a
short patient note, approved request/source tags and a conditional optional
referrer name. LineID and gender are not collected. Screen/list views mask the
identity document; the explicitly synthetic intake print may show the full test
value.

The matching-key priority is national ID/new resident ID, then passport, then
phone plus birth date. When the birth year is absent, the normalized name is
also included so two people sharing a phone and month/day are not silently
merged. This remains browser-local synthetic behavior, not an approved
production identity model or patient authentication; D-001～D-003／D-011
patient-specific decisions remain `pending`, while approved D-006 staff controls
are not implemented by this preview.

### Patient identity fields in the preview - 2026-07-21 — historical, superseded

The bullets below preserve the original 2026-07-21 authority. They were
superseded for current synthetic behavior by the 2026-07-27 scope above and
must not be used as the current field list or matching-key definition.

- The project owner directed that the booking flow collect 姓名、電話、
  生日（西元）、身分證字號 and 有無健保卡, and that the public preview be
  updated with those fields rather than keeping them local-only. The national
  ID is the identity key behind the "one active booking per person" limit.
- This was recorded because it reverses an earlier guardrail: the test-only UI
  guard previously rejected every input field on the patient page. It now
  enforces an explicit allowlist instead, so any further field is a deliberate
  decision rather than a drift.
- Mitigations built in: lists render the national ID masked
  (`A12****789`, `modules/patient-registry.js`), the patient form states that
  entries stay in the visitor's own browser, and the workbench keeps a
  one-click "清除本機資料".
- Scope and residual risk: values are held in the visitor's own
  `localStorage`. Nothing is transmitted to, or stored by, the clinic — there
  is still no backend, database, Authentication or Calendar connection.
  Persistence on a shared device is the residual risk.
- This does **not** approve D-001 through D-003. Lawful basis, retention,
  deletion workflow, the published policy text and the real identity model
  remain `pending`, and no real patient data may be relied upon operationally.

### Google Calendar test-integration authority - 2026-07-23; scope clarified 2026-08-24

**Clarification recorded 2026-08-24, at the owner's instruction.** The owner
states that this authority is live, was given more than once, and does not need
to be re-sought: the project is in a **test phase**, and connecting the
**dedicated test calendar** with **synthetic** events is authorised now. It does
**not** wait on D-009 or on Stage 2.

This corrects a conflation the assistant had been repeating. There are two
separate Calendar tracks, and they had been treated as one:

| Track | Gate | Status |
| --- | --- | --- |
| **Test integration** — dedicated test calendar, synthetic no-PII events, owner-run with the owner's own credentials | This 2026-07-23 authority, explicitly 測試不審核 (a test, outside the formal review) | **Authorised. Never executed.** |
| **Stage 3 production Calendar projection** | D-009 approved **and** Stage 2 complete, per [the approval plan §3](current-execution-and-approval-plan.md) | Both still open |

The Stage-2/D-009 prerequisite belongs to the **second** row only. Applying it to
the first row was wrong and repeatedly blocked work the owner had already
authorised.

**What this clarification does not change**, because these are data limits
rather than process gates:

- the calendar id must still point at a **dedicated test calendar**, never a
  doctor's private calendar and never the clinic's production calendar;
- **no real patient data**, and no real Calendar content — the smoke test
  creates one synthetic, PII-free event and deletes it immediately;
- **CAL-PILOT-001 is still separate.** Reading the clinic's **real operational
  Calendar** is a different act on a different calendar, and this authority does
  not reach it (recorded as H3 in the
  [pilot readiness package](../integration/google-calendar-pilot-readiness.md));
- the assistant still does not create the Google Cloud project, generate
  credentials, or run a connection that writes to a real calendar. That remains
  the owner's own action, per the original 2026-07-23 terms.

The runbook for the owner-run smoke test is
[calendar-go-live.md](../runbooks/calendar-go-live.md).

### Original 2026-07-23 record

- The project owner directed connecting the **real** Google Calendar API as a
  test ("測試不審核" — a test, outside the formal review), and authorised
  writing the real client for it.
- Scope of what this authorises: the `GoogleCalendarClient` code
  (`apps/worker/src/google-calendar.ts`), which reads its credentials only from
  environment variables. It defaults to the in-memory fake only when the
  integration is unconfigured/disabled. Since the 2026-07-29 fail-closed
  hardening, a real test client additionally requires
  `GOOGLE_CALENDAR_INTEGRATION_MODE=test` plus both `GOOGLE_CALENDAR_ID` and
  `GOOGLE_SERVICE_ACCOUNT_JSON`; partial, unknown or credential-bearing
  disabled configurations fail startup. Event content stays minimised (clinic
  name, visit kind, time, address, appointment id — no patient PII), enforced
  by a test.
- What it does **not** do, and the standing limits that still apply:
  - It does **not** approve D-009. D-009 (calendar owner, authorization model,
    scopes, dedicated calendar, minimum event fields) remains `pending` for any
    production use. This authority is a test integration only.
  - The calendar id must point at a **dedicated test calendar**, never a
    doctor's private or a production clinic calendar.
  - No real patient data (D-001～D-003 still pending). The synthetic workbench
    does not call Google at all; only the worker, run with the owner's own
    credentials, would — and no service-account key is ever committed.
  - The assistant did not and will not create the Google Cloud project or
    generate/enter the credentials; that remains the owner's action.

### Synthetic online preview authority - 2026-07-21; deployment status updated 2026-07-27

- The project owner explicitly requested a non-production real-device online
  test version.
- A separate Firebase project, `beauessence-clinic-staging`, was created only
  for static Firebase Hosting preview channels. No Firestore, Functions,
  Storage, Authentication, Calendar or other backend integration was enabled.
- **Historical deployment record; scheduled expiry has passed and current
  availability was not reverified in the 2026-08-11 read-only audit:** the same
  `synthetic-review` channel was redeployed on 2026-07-27 from commit `3c31351`
  and was scheduled to expire on 2026-08-04 at
  12:43 Asia/Taipei. On 2026-07-28 at 17:18 Asia/Taipei, `/`, `/booking`,
  `/privacy` and `/clinic` were rechecked as HTTP 200 with stable HTML
  `no-cache` and the preview still `noindex`. This supersedes the earlier path
  and operational expiry below. Any redeploy needs fresh authority for the
  exact commit/project/channel/expiry; see
  `docs/reviews/2026-07-27-owner-request-batch-delivery.md` and
  `docs/reviews/ui-visual-baseline-2026-07-28.md`.
- Preview channel `synthetic-review` uses browser-local synthetic state and is
  publicly reachable to anyone with the URL. **Historical deployment record,
  superseded by the 2026-07-27 deployment above:** it was redeployed on
  2026-07-24 (same URL) with the CSP `object-src` hardening, forced-colors
  support, the branded 404 and the synthetic account+password login gate, with
  an expiry of 2026-07-31 at 02:30 Asia/Taipei. The workbench opens on that
  synthetic login gate (test credentials are shown on the page); it is a UX
  prototype, not a security boundary, and does not change D-006. The patient
  page is unaffected.
- This authorization does **not** approve D-001 through D-011, does not permit
  real data, and does not authorize a Firebase live-channel deployment.
- Operating and deletion instructions are in
  `docs/runbooks/synthetic-online-preview.md`.

### Synthetic front-desk capability baseline - 2026-07-25

- The project owner directed completing and jointly accepting the corrective
  role, responsive-header, notification and maintenance-mode batch while
  leaving visual Phase 5 unchanged.
- The synthetic front-desk role may create and process appointments, record a
  doctor's follow-up decision, and make the first case-manager assignment.
  Reassignment, business-hours governance, staff permissions, announcements,
  maintenance controls, advanced settings, local-state reset and audit remain
  supervisor-only.
- The implementation must enforce those boundaries in the rendered DOM, hash
  routing, UI action dispatch and synthetic store. Hiding a control alone is
  not accepted as authorization.
- This is a browser-local build and acceptance direction only. It does **not**
  approve D-006, create a real identity or RBAC system, authorize a cloud
  backend, permit real data, or change any D-001 through D-011 status.

### Test-only authority - 2026-07-20

- The project owner authorised local synthetic testing while all formal
  approvals remain blank.
- This does **not** approve D-001 through D-011 and does not change their
  `pending` status. The only permitted values are the explicit synthetic
  parameters in `docs/product/test-only-sandbox-baseline.md`.
- The test profile cannot collect real data, expose an API route, create a
  cloud project or call an external service.

### D-001 - 2026-07-20 — historical input, superseded in part

The bullets below preserve the 2026-07-20 research/input record. The clinic
phone remains the temporary privacy-contact input, but the 2026-07-28 re-check
shows that the official hours in this historical block still appear on the
clinic's own site. The owner selected the repository schedule later on
2026-07-28, so the official site now needs correction. D-001 remains `pending`.

- Clinic name supplied by the project owner: 一森渼診所
- Address supplied by the project owner: 10560臺北市松山區復勢里光復北路112號2樓
- Public details verified from the [official clinic website](https://beauessence.com.tw/reservations/)
  on 2026-07-20: general phone `02-2577-1314`, toll-free phone
  `0800-000-913`, address 臺北市松山區光復北路112號2樓, and published
  hours Monday-Friday 11:00-20:00 / Saturday 11:00-16:00. The public medical
  institution listing also matches the clinic name, street address and general
  phone number.
- The published phones are general contact channels only. They must not be
  presented as a privacy-rights contact channel until the clinic explicitly
  approves that use and the handling process.
- The Taiwan privacy legal baseline was checked on 2026-07-20. It requires the
  policy to name the actual non-public data controller; a responsible physician
  must not be used as a substitute unless the clinic's legal owner confirms
  that is the registered controller name. See
  `docs/security/taiwan-privacy-legal-baseline.md`.
- Still required: confirmation that the clinic name is the legally registered
  data-controller name, plus the privacy contact channel and patient-rights
  request process.
- Status: pending

## Approval record template

```text
Decision ID:
Answer:
Approved by:
Approval date (Asia/Taipei):
Evidence / policy reference:
Follow-up implementation issue:
```

Changing an approved decision requires a dated superseding record and review of
the affected contract, domain rule, audit behavior, privacy notice and runbook.

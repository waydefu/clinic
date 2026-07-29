# 後續規劃書

**撰寫日期：** 2026-07-21

**整合更新：** 2026-07-28

**目前狀態：** 瀏覽器原型功能完整、已部署到期預覽；Firestore 寫入路徑已在本機
Emulator 驗證；Stage 0／Checkpoint A 已通過，目前在 Stage 1 owner decisions；
尚無雲端後端、無 Authentication、無日曆連線、無真實病患資料。

> **目前 gate：Stage 1 決策與治理核准。** Stage 0 架構硬化與 Checkpoint A 已於
> 2026-07-24 完成；D-010 target 與 D-006 identity/security 已於 2026-07-28
> 核准。Stage 2 cloud staging 仍須獨立 change-plan review 與 deployment
> authority；決策核准不等於已有實作、部署或復原證據。
> 2026-07-28 的手術／回診／付款／結算需求已納入獨立
> [Expansion S plan](product/2026-07-28-surgery-follow-up-expansion-plan.md)；
> 目前只做規劃與決策登錄，不改變 Phase 1 stage 或啟用範圍。
> 詳細順序與 gate 以
> [正式化後續實作規劃書](product/production-readiness-delivery-plan-2026-07-23.md)
> 為準；技術邊界以
> [正式環境目標架構書](architecture/production-target-architecture-2026-07-23.md)
> 為準。既有 Stage 0 與 dated review 完成紀錄保留作歷史證據，不得取代目前 gate。

> **2026-07-24 進度整合。** 本檔的 2026-07-23 原始內容，其後的 Stage 0 內工作以
> [delivery-plan](product/production-readiness-delivery-plan-2026-07-23.md) §5 backlog
> 為權威紀錄，包含：管理者刪除預約、schedule/follow-up/case-assignment/payroll
> 進 domain（含月結鎖定與具理由調整）、前端打包／內容雜湊 dist、Playwright E2E＋
> axe、`apps/api/src/platform` 的集中式錯誤映射與候選 RBAC/rate-limit/maintenance
> 骨架，以及低頻治理指令的 pending/error/retry 收尾與 api-client 的 HTTP/offline/
> timeout 錯誤映射。以下清單中凡與這些重疊者，以 backlog 的最新狀態為準。
>
> **2026-07-26 截圖複查與行動版格線修復。** 通知面板固定於手機 viewport 安全
> 內距並補 dialog／離焦收合；預約篩選改為搜尋全寬＋兩個下拉並排；處置卡改成主要
> 動作全寬、兩個次要動作並排，並修掉未回報的桌機 `inline-size: 1%` 遺留；三個
> 批次動作同列；排班起訖時間並排滿寬。患者端必填星號與欄名同列、紅色但不只靠
> 顏色，當時的姓名／電話／生日／身分證四欄全寬等寬。`mobile-layout.spec.ts` 由 8 增至
> 12 項，以瀏覽器幾何量測守住 320／375px reflow、viewport 邊界與 44px 操作高度。
> 工作臺的極窄版頁首也不再隱藏整個品牌文字區；中文診所名稱與英文副標都會保留，
> 英文在空間不足時換行，並縮小與右側通知／設定控制項之間的欄距。**患者頁的那一
> 份同時修掉**：`check-web-ui.mjs` 先前只讀 `workbench.css`，共用的 `styles.css`
> 完全不在守衛範圍內，所以同一個 `display: none` 留在對外頁面上。守衛已擴及
> **2026-07-27 刪除預約委派給櫃台**（決策紀錄「D-006 partial」）：櫃台憑管理者
> 自訂的授權碼才能刪除，授權碼可多組、可個別停用；規則進 `packages/domain` 的
> `delegated-authorization`。角色權限表**沒有**改動——委派是另一條路徑，稽核因此
> 永遠分得出「這個角色本來就能做」與「這次是被授權的」。2026-07-28 D-006
> 已核准雜湊、個別撤銷與錯誤嘗試限制，但目前 plaintext browser demo 仍非安全
> 邊界，不能當成已實作。
>
> 上述 2026-07-26 四欄描述只保存當日截圖基線；患者欄位已被 2026-07-27 owner
> batch 取代為生日年份選填、身分證／居留證或護照、健保卡攜帶意向、患者備註、
> 核准的門診／來源標籤與條件式選填介紹人姓名。LineID 與性別仍不收集。
>
> **2026-07-27 隱私權告知與 SEO 基礎**（[SEO 基準](reviews/2026-07-27-seo-baseline.md)）：
> 新增 `/privacy`，涵蓋個資法第 8 條要求的告知事項，連結放在填寫資料那一步而非
> 只在頁尾；頁面同時聲明「目前為測試版本、資料不會傳到診所」與「本文為草稿」。
> 當時先把錯誤的 20:30 收診時間更正為 20:00；2026-07-28 重查後發現官網的完整
> 每週時段仍與合成預覽衝突，正式值已回到 D-004 待決策。SEO 補上
> `robots.txt`／`sitemap.xml`、以
> `availableService` 取代錯誤的科別標示，並把「是否可被索引」與「標題是否標
> 【測試用】」收斂成同一個 `WEB_PUBLIC_INDEXABLE` 建置開關。
>
> **2026-07-26 全專案審查與三項處理**（[稽核紀錄](reviews/2026-07-26-full-project-audit.md)）：
> 沒有 P0／P1 程式缺陷。相依安全閘門改成出貨面 moderate／工具面 high 兩層；患者
> 身分模型從瀏覽器搬進 `packages/domain`（順帶修掉「1990-02-31 通過驗證」的日期
> 溢位缺陷）；新增 `check:architecture` 守住依賴方向、未接線清單與 domain 規則
> 單一來源，並當場抓到 `admin-bootstrap.js` 繞過共用時間格式化器。署徽使用權與
> 分支保護在該次稽核仍待決策；兩者後續分別以 D-012（preview scope）與 D-013
> 記錄核准，見決策登錄。
>
> **2026-07-26 證據與維運收斂。** `verify` workflow 新增最終 evidence job，
> 把 verify／Firestore Rules／E2E／supply-chain 四個結果綁定 commit SHA 與 run；
> CodeQL 另產生 commit-bound artifact，預覽部署可用 `pnpm verify:preview` 驗證
> 專用 staging hostname、安全標頭、內容與 immutable 雜湊資產。文件新增生命週期
> 守衛，防止 dated review／archive 被誤當現行權威。Firestore Emulator 已完成
> 還原到獨立 named database 的 V1～V5 技術演練，Calendar V6 companion 亦通過；
> cloud backup／PITR、IAM、告警、真人 tabletop 與 RTO／RPO 仍保持未驗證。
>
> **2026-07-24（同日稍晚）品質 gate 與維運設計。** 另補上：效能預算（Lighthouse
> budget 格式，位元組靜態把關＋瀏覽器實測 FCP/LCP/CLS）、CycloneDX 1.6 SBOM 與
> 授權政策 gate、CodeQL 與 ESLint 注入規則、人工無障礙測試 runbook，以及四份
> plan-only 的維運設計（基礎設施與環境、worker 觸發與對帳、備份還原與 RTO/RPO、
> 事故應變）。詳見[前端與供應鏈品質把關](architecture/web-quality-gates-2026-07-24.md)
> 與[基礎設施與維運計畫](architecture/infrastructure-and-operations-plan-2026-07-24.md)。
> **維運設計全部是文件，沒有建立任何雲端資源。**
>
> **2026-07-25 視覺方向定案：Boutique Clinical Command。** 完整方向、六階段順序、
> 已完成範圍與接手須知集中在
> [設計方向文件](design/boutique-clinical-command-2026-07-25.md)——**要動視覺的人
> 先讀那一份**。摘要：階段 1（Design Tokens 2.0）、2（瑞士資訊骨架）、
> 3（工作臺全面資料表格化，含欄位排序與批次操作）、4（首頁情境式指揮中心）、
> 5（品牌層）、6（Motion System）**六階段全部完成**。
>
> **階段 6 採 IBM Carbon 的 productive 分類**（快、克制、不回彈），刻意不跟
> Material 3 在 2025 年改成預設的 expressive scheme——櫃台整天在掃描資料表，
> 任何彈跳都會拖慢視線。動效只用來解釋狀態變化（列變更、彈窗進場、狀態列變色），
> 不做頁面或分頁轉場。reduced-motion 下改用靜態底色：關掉動效，但不關掉資訊。
> 過程中修好一個自階段 3 起就壞掉的列變更提示（選擇器停在已不存在的
> `.appointment-card`，而且不會報錯）。詳見設計文件 §11。
>
> **2026-07-25 第二批可用性修正**（設計文件 §13）：回診改成完整生命週期——待安排
> 回診那一列有「確認回診／調整回診／取消回診」三個直接動作，**取消回診才是撤銷
> 回診的正確方式**（刪除是清掉整筆看診事實）。**同批修掉一個資料可見性問題**：
> 「已完成到診＋不需要回診」先前整筆從清單消失、連「全部狀態」都找不回來，
> 現在留在清單上顯示為已完成到診。另：只剩一個選項的處置選單直接攤平成按鈕、
> 處置欄不再換行、鈴鐺改線稿 SVG、營業時間改成「編輯→比較→發布」三步驟且發布鍵
> 移到比較區正下方、員工權限頁的格線空白（修 aria-live 時自己種下的）、
> checkbox 尺寸與患者頁按鈕留白。
>
> **2026-07-25 可用性修正批次**（設計文件 §12）：依實測回饋修掉「看不出是按鈕」
> （`.text-button` 無形狀、`.summary-action` 樣式被父層選擇器綁住）、週曆文字被
> 裁切與休診欄擋視線、容器黏連、選取框過小（全站無 checkbox 樣式且被文字框規則
> 拉成長條）、患者頁按鈕肥大、登入頁單調。新增 `affordance.spec.ts` 驗**算出來的
> 樣子**，當場又抓到兩個沒人回報的缺陷。
>
> **階段 5 的兩個決定已於 2026-07-25 拍板**：(1) **不載入任何中文字型**，字型
> 預算永遠 0 KiB，中文一律用系統字體（`--font-sans` 補上先前完全缺席的
> `PingFang TC`，這是零成本卻最有效的一步；`--font-serif` 永久指向 sans）；
> (2) **香檳金＝Brand Decorative Accent**，只承載品牌與質感，永遠不代表狀態、
> 選取、焦點或可點擊。實作與三主題實測對比見設計文件 §10。
>
> 實測推翻了提案的三個起始色值（金字疊金底 4.36:1、金字放深綠 hero 2.47:1、
> 亮金放 hero 漸層最亮段 2.99:1），因此 **hero 眉題的文字刻意不做成金色**，
> 只讓裝飾線是金的。`check:tokens` 新增守衛擋香檳金流入狀態或互動元件。
>
> **2026-07-25 合成介面修正批次。** 已完成主管／櫃台四層權限邊界、醫師回診
> 決定與資料登錄責任拆分、個管首次指派／主管改派、通知 popover、行動 header、
> 320px＋200% 文字重排，以及患者維護模式的 UI 與 store 雙重封鎖。此批次只處理
> 功能與品質，**不變更階段 5 的視覺範圍或決策狀態**；仍限 local／synthetic，
> 不代表 D-006 核准。
>
> **2026-07-25 桌機可讀性批次。** 依最新使用回饋與 WCAG 2.2／USWDS／GOV.UK
> typography 基準，將兩端的必讀與可操作文字提升到 16px，14px 只留給代碼、徽標、
> chip 與緊湊週曆事件；導覽與主要控制項採 44px 點擊高度，長說明限制 68ch，
> reduced-motion 同時停用 transition 與 animation。保留系統字體與 0 KiB 字型
> 預算，並新增 computed font-size／target height E2E 守衛。
>
> 同批的無障礙修正：全站清單容器不再是 `aria-live` region（整批置換的內容會被
> 螢幕閱讀器逐項重唸），改由簡短摘要公告筆數；`check:ui` 新增兩條守衛——清單不得
> 掛 aria-live、HTML 不得有重複 id（兩份客戶端都用 `querySelectorAll('[id]')`
> 建 elements 表，重複會靜默蓋掉控制項，加守衛時就抓到一個真的）。
>
> 同批：建置開始壓縮 CSS（先前註解原封不動出貨，樣式表因此少掉約一半傳輸量），
> 診所標誌與健保署署徽已置入並納入影像預算。
>
> **2026-07-24（再稍晚）設計系統地基修補。** 一次純程式的 UI／美術審查後，補掉
> 五項地基缺陷：從未定義卻被用了五次的 `--text-sm`（宣告靜默失效）、五處寫死的
> 顏色（導致三個主題只覆蓋一半頁面）、九階字重（字體家族只有兩檔，六階無法分辨）、
> 缺席的間距／圓角／深度 token、以及兩份樣式表各用一套的斷點。新增
> `pnpm check:tokens` 與兩個 e2e（主題覆蓋率、版面重排）把這些釘住。
> **這是地基不是風格**——視覺方向本身仍待負責人選定。

## Stage 0 已完成的施工基線

下列項目全程限 local/Emulator/synthetic，並已通過 2026-07-24 Checkpoint A。它們
是完成證據，不是目前待辦；目前工作位置是 Stage 1 owner decisions：

1. 對齊 API contract、domain request 與目前核准的 synthetic 欄位。✅
   2026-07-23 完成 appointment command 與 server context mapping。
2. 建立 application service、auth context、authorization policy 與 repository
   port 骨架，不接真實 IdP。✅ 2026-07-23 完成本機未掛路由骨架。
3. 建立 `patient_booking_guards`，補同病患／不同 slots 的併發測試。✅
   2026-07-23 完成 Emulator 8-slot 競態驗證。
4. Audit v2 contract 與 transaction assertions。✅ 2026-07-23 完成。
5. Idempotency scope/request hash。✅ 2026-07-23 完成；以 actor＋operation
   scope＋raw key 的 SHA-256 作文件定位，record 綁 request hash 與 response
   reference；完全相同才 replay，不同內容回 `IDEMPOTENCY_KEY_REUSED`。
6. 建立 worker correlation/metrics port 與 production CI skeleton。✅
   2026-07-23 完成；outbox trace context、低 cardinality metrics seam、
   tracked-secret check、high/critical dependency gate 與 dependency inventory
   artifact 均已進 CI。SBOM、授權政策與本機 SAST gate 已於 2026-07-24 補齊；
   正式 metrics backend、alerts 與 runner 須依已核准的 D-010 target，在對應
   C6／Stage 3 slice 各自取得 authority 與 apply approval 後建立及驗證；C1
   foundation 本身不解鎖。

Stage 1 可進行 owner answer／evidence／approval 登錄與既有 synthetic scope 的
維護。Booking route、cloud Firestore/Auth、Calendar projection、真實資料與
Terraform apply 仍依 D-001～D-011 對應 gate 保持關閉；D-006/D-010 target 已
核准，但 C0 review 與 C1～C6 每個 slice 各自的 request、deployment authority、
apply approval 仍阻擋實際 cloud staging。C1 isolated foundation 不解鎖 IdP、
Firestore、backup/PITR 或 runtime。

## 一、現在的實際位置

| 面向 | 狀態 |
| --- | --- |
| Delivery plan | **Stage 0／Checkpoint A 已完成；目前 Stage 1 owner decisions；D-006/D-010 已核准，Stage 2 尚待 change/deployment review** |
| 預約流程（初診／回診分流、備註、回診確認、櫃台處置） | 完成，實機驗證 |
| 患者端預約（四步驟、逐欄驗證、行事曆匯出） | 完成，實機驗證 |
| 排班（門診時間、固定不開放時間、草稿／發布） | 完成 |
| 個管指派與月度工作量 | 完成（非金額） |
| Firestore 交易、冪等、outbox | **本機 Emulator 已驗證**（建立、取消、到診、未到、改期、outbox 重試與死信），未對外開放端點 |
| 雲端資料庫 | 未啟用 |
| 身分驗證 | 未啟用（工作臺目前是角色模擬） |
| Google 日曆 | 未連線 |
| 真實病患資料 | **未處理，且不得處理** |

自動化把關：`corepack pnpm verify`（結構、UI 邊界、文件、格式、lint、型別與
單元測試）、`corepack pnpm test:rules`（Emulator）與 `corepack pnpm test:e2e`
（打包後瀏覽器流程）。三者都在 CI 於每次 push 與 PR 執行。

## 二、已完成的 local／synthetic 工作

這些項目不碰真實資料、不碰雲端，已依序完成。以下保留原始問題與驗收目的，供
維護與回歸使用。

### 1. outbox worker 的重試與死信（`apps/worker`）— ✅ 已完成 2026-07-21

實作前 `apps/worker` 只有 README；本項已補齊租約、指數退避、最大重試、死信、
補回與操作者可見的待處理流程，並在本機以假的外部服務驗證。2026-07-29 再補
可注入 random source 的 full jitter 與「同一 job 每批最多一次」防護。正式
runner、trigger、metrics backend 與 alerts 須依已核准 D-010 target 完成 Stage 2
change review，Calendar 接線另等待 D-009。

驗收：外部服務連續失敗 N 次後進入死信；恢復後可安全補回；重試 100 次仍只產生
一個事件。

### 2. 把改期、取消、到診、未到也納入交易路徑 — ✅ 已完成 2026-07-21

本項開始前，階段 A 只做了「建立預約」。其餘狀態轉換現已納入交易、冪等、
audit 與 outbox，且由共用 domain planner 驗證；這段保留為歷史問題說明。

### 3. 收斂兩份規則 — ✅ 已完成（2026-07-22）

先前瀏覽器與伺服器各有一份預約規則。判斷需要 bundler 才能收斂，**該判斷已
證實為錯**：`tsc` 的產物已是合格的瀏覽器 ESM。

已完成（見 [ADR-0004](adr/0004-browser-and-server-share-one-compiled-domain.md)）：

- 四組規則（時段可預約、防重複、狀態轉換、改期）抽到 `packages/domain/src/
  appointment-rules.ts` 的純斷言，伺服器 planner 與瀏覽器都呼叫同一份。
- 瀏覽器經 `modules/domain-rules.js` 呼叫斷言並把錯誤碼翻成中文——規則在領域、
  措辭在邊緣。
- vendor 同步 + 雜湊防漂移（`check:sync`）納入 `verify` 與 CI。
- 相對路徑載入而非 import map：後者是 inline script，會被 CSP 擋掉（實機發現）。

無新依賴、`public/` 保留存檔即生效、Hosting 部署不變。後續已決定不做 per-entry
bundling：現行永久策略是每檔 minify、content hash、匯入路徑改寫與
`modulepreload`，保留 `public/` 到 `dist/` 的逐檔可追查性。若要改成 bundle，
必須以新決策重開，不能當作一般最佳化悄悄導入。

### 4. CI 與 ESLint — ✅ 已完成 2026-07-21

本項開始前，`verify` 與 `test:rules` 全靠人工在本機執行，且只有格式化、沒有
ESLint 正確性檢查。現在 `verify`、Rules、Playwright E2E 與 supply-chain gates
都由 GitHub Actions 執行；直接使用管理者 bypass 時仍須在推送前自行跑完整 gate。

### 5. 剩餘的 UI／UX 項目

**2026-07-22 已修（兩輪）**：

- 回饋可見性整批修正——所有建立／失敗訊息就地顯示（含預約失敗原因）、
  sticky 狀態列、帳號重複防護、完成後改期閘門、患者端焦點管理與 Enter
  送出。見[回饋可見性檢查](reviews/ui-feedback-review-and-remediation-2026-07-22.md)。
- 導覽列不透明、自製確認彈窗（禁 window.confirm）、患者端返回重選動線、
  自動／淺色／護眼／深色主題（深色對比 ≥ WCAG AA）、色彩全面 token 化、
  網頁規範檢查。見[主題、彈窗與動線優化](reviews/ui-theme-dialog-and-flow-review-2026-07-22.md)。
- 桌面步驟指示器文字標籤：負責人寬螢幕截圖證實有顯示，結案。
- 預約清單排序經實測確認本來就正確（近的在上、新預約立即歸位）；
  回報問題出自重新部署前的舊版。
- 手機篩選列改 2 欄格線、處置選單不再超出螢幕；回診目標改「日期＋時間」
  且僅限營業日的回診網格（未營業日即時提示＋domain 拒絕）。
- 工作臺改為分頁切換（hash 路由，保留深連結與上一頁）；預約卡可就地修改
  備註；回診卡可順手指派個管師（與個案管理分頁同步、權限各自檢查）。
- 手機版帳號治理與月度統計收成單欄，修掉欄位溢出容器。
- 患者行事曆匯出改為只標記開始時間、綠色、前一天提醒；診所端投影定為
  一小時區塊。這是當時的 synthetic fixture；2026-07-28 最終決策不把止鼾／醫美
  實際療程時長寫死，正式投影須使用 operational reservation interval。

**2026-07-23 已修**：

- 櫃台回診工作流：到診刪日曆、回診確認後表單消失並轉「待安排回診」回診版
  （顯示回診日、依日排序）、預設「當日」篩選＋空白引導、取消請求鈴鐺紅點與
  聯絡彈窗。見[櫃台回診與患者 UX 規格](product/front-desk-followup-and-patient-ux-spec-2026-07-23.md)。
- 患者時段清單：改為全部依日期分組，預設顯示 5 天並提供「顯示更多日期
  （還有 N 天）」，另加日期跳轉（`<input type="date">`，上下限依可預約範圍）。
  同日不可預約已過去的時段。
- 患者頁手機首屏：hero 壓成精簡標題帶（收起長介紹、信任標籤與聯絡卡，地址與
  門診時間改由頁尾承接），預約操作回到第一屏（實測 685px < 812px 視窗）。
- 四步驟標籤字級由 11.2px 放大為 14px（`--text-sm`）。
- 補上 `/og-booking.png`（1200×630 品牌圖，GDI+ 產生，約 100KB），修掉分享
  預覽 404。
- `renderAppointments`／`followUpQueueCard` 改為缺 session 也不拋錯（防禦性讀
  取權限），並加回歸測試。

仍未處理：

- 螢幕閱讀器與高對比的**人工實測**（程序已備妥，見
  [人工無障礙測試 runbook](runbooks/manual-accessibility-test.md)，尚未執行）

**2026-07-29 已修：**

- 預約清單固定每頁 20 筆，總筆數／本頁筆數／頁碼分開呈現；篩選、搜尋、排序
  會回第 1 頁，批次選取不跨頁殘留，週曆事件可切到目標所在頁。
- 櫃台高頻快捷鍵加入 `/` 聚焦搜尋與 `Alt+N` 開啟新預約；輸入欄、文字區、
  下拉選單與 contenteditable 內不攔截，並有 Playwright 鍵盤回歸測試。
- 480px 的「清除篩選」與 320～480px 的分頁按鈕不再逐字斷行；窄版將頁碼狀態
  獨占首列、上／下一頁等寬放在第二列。
- 新增 Playwright `forcedColors: active` 自動預檢，釘住焦點框、目前步驟、目前
  工作區與按鈕邊界；它只先抓 CSS 回歸，仍不取代上方尚待執行的人工高對比實測。

已完成（原列於「仍未處理」，2026-07-24 更新）：

- ~~`Noto Sans TC` 載入決定~~ ✅ 2026-07-25 定案不載入任何中文字型；中文使用系統
  字型，`apps/web/performance-budget.json` 的字型預算維持 0 KiB。
- ~~前端逐檔 minify／雜湊／預載／快取~~ ✅ `scripts/build-web.mjs` 以 per-file
  minify、content hash、匯入路徑改寫與 `modulepreload` 產出
  `apps/web/dist`；雜湊資產 immutable，穩定 HTML 為 `no-cache`，CSP 未放寬。
  firebase `public`→`dist`、`hosting.predeploy` 綁 `pnpm build`，E2E 亦跑在 dist
  上。Phase 1 的 `public/` 仍維持原生 ESM 供開發直接檢視；per-entry bundling
  已被拒絕，除非新決策重開。
- ~~接上真後端前所有按鈕的 pending 狀態設計~~ ✅ 工作臺高頻與低頻治理指令
  全走 `runUiAction`（pending label、disabled、就地 status 與可重試）；按鈕不宣告
  `aria-busy`。`api-client` 注入合成延遲，並把 HTTP status／offline／timeout
  映射成對齊 v1 envelope 的錯誤。

### 6. 接日曆實測的技術前置 — 詳見[日曆整合計畫 §3.1](architecture/calendar-and-database-integration-plan.md)

✅ base32hex 冪等鍵修正（鍵綁預約，一筆預約一個日曆事件）→ ✅ 假 Calendar
服務定型（upsert／cancel、409 與 410 皆視為冪等成功、依執行當下狀態選動作、
診所端一小時區塊）→ ✅ 事件欄位最小化斷言 → ✅ runbook 演練（失敗→死信→補回
已固定為 Emulator 測試，並補上 `OutboxProcessor.requeue` 這個 runbook 步驟 3
缺的操作能力；見
[演練紀錄](reviews/calendar-sync-runbook-rehearsal-2026-07-23.md)）。

**四項技術前置全部完成。** 改期舊事件殘影的缺口已用「鍵綁預約」一併解決。

**2026-07-23：真實 Google Calendar 用戶端已寫好**（`apps/worker/src/
google-calendar.ts`，測試授權見決策登錄，非 D-009 核准）。憑證只走 env；完全
未設定時回退假日曆，2026-07-29 起則要求明確 `test` 模式與兩個 credential，
半套／未知設定直接失敗。token endpoint 固定為 Google 官方位址，token shape 與
事件欄位最小化皆有單元測試。工作臺也加了操作者的死信補回入口（合成示範）。
實際連線需專案負責人設定 Google Cloud 專案與服務帳號憑證——助理不建立也不能
輸入憑證；步驟見
[go-live runbook](runbooks/calendar-go-live.md)。

**2026-07-23（同日稍晚）：負責人已提供專用測試日曆 ID 與服務帳戶金鑰檔**
（金鑰置於本機桌面、未進版控）。程式接線已完備且會在啟動時驗證金鑰型別
（必含 `client_email`／`private_key`，OAuth 用戶端會被拒），因此本機煙霧測試
可由負責人自行執行——助理不讀金鑰內容、不代跑會在真實日曆建立／刪除事件的
連線。指令見 [go-live runbook 的「本機煙霧測試」](runbooks/calendar-go-live.md)。

## 三、需要核准才能做的事

見 [階段 B/C 核准請求](product/stage-b-c-approval-request.md)。

| 階段 | 內容 | 卡住的決策 |
| --- | --- | --- |
| Stage 2（舊稱 B） | C1 isolated foundation 後，由 C2～C6 分別建立 IdP、Firestore 與 runtime（全程測試資料） | D-006/D-010 是前置；C0 review 後每個 slice 仍需獨立 request、deployment authority 與 apply approval |
| Stage 3（舊稱 C） | Stage 2 上的 Google 日曆投影（專用測試日曆） | D-009，且 Stage 2 完成 |
| Stage 4（舊稱 D） | 公開預約與開始處理真實病患資料 | D-001～D-006、D-010、D-011 |
| Expansion S | 手術／臨床時間軸、付款／結算、Calendar inbound | 既有相關 gate＋D-014～D-016；不自動納入 Phase 1 release |

三項決策的中文核准表已備妥，可直接交給診所填寫。

## 四、上線前必須回頭處理的事

這些在測試階段是刻意的設定，正式化時必須改：

| 項目 | 現況 | 上線前 |
| --- | --- | --- |
| `robots` | `noindex, nofollow` | 患者端移除；工作臺維持 |
| `og:url` / canonical | 指向 `beauessence.com.tw/booking` | 換成實際網域 |
| `og:image` | `/og-booking.png` 已存在 | 正式網域驗證分享預覽與快取 |
| Cache-Control | 穩定 HTML `no-cache`；內容雜湊資產 immutable | 正式網域再次驗證快取與回滾 |
| 預覽頻道 | 七天到期 | 改為正式 Hosting，並建立回滾流程 |
| 環境標示 | `ONLINE PREVIEW` | 移除 |
| 資料保存告知 | 「只保存在本機瀏覽器」 | 依核准後的隱私政策改寫 |

**已釐清（2026-07-21）**：初診（整點／30 分）與回診（15 分／45 分）在時鐘上
重疊是**刻意的**。診所的諮詢師與醫師人力足以並行兩條線，因此回診不會佔用初診
的看診量能。容量是以「人力線」計算，不是以「時鐘分鐘」計算，兩個時段格不得
改為互斥。

## 五、建議的執行順序

```text
✅ worker 重試死信   ✅ CI + ESLint   ✅ 全部狀態轉換納入交易   ✅ 收斂兩份規則

✅ ① outbox 冪等鍵改為 base32hex（2026-07-22 完成）

✅ Stage 0：contract / application boundary / patient guard / audit v2
              │
現在 ──► Stage 1：owner decisions / governance approvals
              │
              ├── D-006 ✅；D-010 ✅；change/deployment review
              ▼
        Stage 2：合成資料 Cloud Staging + 員工登入 + 正式 API
              │
              ├── D-009 核准
              ▼
        Stage 3：專用測試日曆投影
              │
              ├── D-001～D-006、D-010、D-011 核准
              ▼
        Stage 4：公開預約與真實資料
              │
              ├── D-007 + D-008 核准
              ▼
        Stage 5：個管／薪資正式化 ──► Stage 6 Production Go/No-Go

Expansion S（獨立）：手術／臨床／付款／Calendar inbound
              └── 先完成 D-014～D-016 與各自既有 gate，再決定 release
```

① 已完成：舊冪等鍵含底線、不符 Google 日曆的 base32hex 格式，直接用會被拒絕；
現在鍵由 `packages/domain/src/calendar-event-id.ts` 統一產生並可還原追查。

技術項目與核准流程可以並行：技術面先把可靠性做完，診所同時走決策程序。等核准
下來時，剩下的只是接線，而不是從頭建。

## 相關文件

- [企業級上線前審查](reviews/2026-07-23-enterprise-production-readiness-review.md) — 2026-07-23 的歷史評分、當時阻擋項與驗證證據
- [正式環境目標架構](architecture/production-target-architecture-2026-07-23.md) — 保留與修改邊界、目標資料流、交易與資料模型
- [正式化後續實作規劃](product/production-readiness-delivery-plan-2026-07-23.md) — Stage 0～6、決策 gate、驗收與重新評分點
- [整合測試計畫](architecture/calendar-and-database-integration-plan.md) — 各階段的技術細節與驗收
- [Stage 2 身分與 Cloud change plan](architecture/stage-2-identity-and-cloud-change-plan-2026-07-28.md) — D-006/D-010 核准值的 plan-only 切片、驗收與回滾
- [Expansion S 規劃](product/2026-07-28-surgery-follow-up-expansion-plan.md) — 手術、臨床時間軸、付款／結算與 Calendar inbound 的獨立分階段規劃
- [階段 B/C 核准請求](product/stage-b-c-approval-request.md) — 要交給診所的中文表
- [企業級專案規劃書](enterprise-appointment-project-plan.md) — 完整架構、資料模型與 §5.3 落差追蹤
- [UI/UX 基線](design/test-only-operations-ui.md) — 不得回退的介面規則

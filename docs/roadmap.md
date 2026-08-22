# 後續規劃書

**撰寫日期：** 2026-07-21

**整合更新：** 2026-08-17

**39 題業主答案已於 2026-08-16 全數回收**，逐題對帳見
[2026-08-17 對帳紀錄](reviews/2026-08-17-owner-decision-reconciliation.md)。答案是
有記錄的業主輸入，**不是核准**（缺核准人、日期、範圍與排除項，D-001～D-003、D-014
另缺專業審查），因此所有 D-series 狀態值不變。Stage 仍為 Stage 1。

**目前狀態：** 既定中文 synthetic 瀏覽器流程已實作；**D-011 英文版已於 2026-08-16
確認不做，不再是待辦需求**；本狀態也不
代表真人無障礙、production 或目前 HEAD 已重驗。最後有紀錄的 preview 已到
2026-08-04 排定到期日，2026-08-11 遠端狀態未驗證。Firestore 寫入只有 dated 本機
Emulator 證據，且同日稽核新確認三個 correctness 缺口。Stage 0／Checkpoint A 已通過，
目前仍在 Stage 1 owner decisions；尚無 source-routed cloud backend、Authentication、
日曆連線或真實病患資料 authority。

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
> 為準。要直接查看白話順序與所有待核准項目，使用
> [專案後續執行與核准清單](product/current-execution-and-approval-plan.md)。
> 既有 Stage 0 與 dated review 完成紀錄保留作歷史證據，不得取代目前 gate。
>
> **2026-08-11 唯讀稽核新增的 current P0：** `DATA-R01` slot sentinel、`DATA-R02`
> occurrence identity、`ARC-R01` lease fencing、~~`SCM-R05` 修綠 dependency audit
> gate~~（**2026-08-17 完成，見下**）、~~`SCM-R01` required SAST~~（**2026-08-18
> 完成，見下**）、`SCM-R02` runtime、
> `WEB-P0-01/02/03` privacy index/performance/axe。
> 這些不是全面重開 Stage 0，但在對應 acceptance 前，不得接 booking/worker route 或
> 宣稱相關 gate 完整。完整證據見
> [現代化稽核](reviews/2026-08-11-enterprise-modernization-audit.md)。
>
> **順序注意（2026-08-17 更新）：`SCM-R05` 已完成，前置條件已滿足。**
> PR #16（實作 `5c99b54`、merge `cf3b87b`）把 lockfile 的 `nanoid` 由 `3.3.16`
> 提到 `3.3.18`，`SCM-006` 的那筆 high 消失。`main` 在 `b05da66` 的 `verify`
> run `32027293936` **十個 job 全綠，含唯一 required 的 `Verification evidence`**。
> 因此 aggregate 現在有乾淨基線，`SCM-R01` 的「故意失敗 PR」驗收才分得出擋住 PR
> 的是 SAST 還是 dependency audit。
>
> **`SCM-R01` 已於 2026-08-18 完成，同 commit 的 Semgrep CE 結果現在會擋下合併。**
> GitHub Actions 沒有跨 workflow 的 `needs`，所以掃描實作抽成
> `.github/workflows/sast-scan.yml`（`workflow_call`）；`verify.yml` 在同一個 run
> 內以 `sast` job 呼叫它，`Verification evidence` 的必要 job 由四項變五項。
> `sast.yml` 保留為每週排程與手動觸發的包裝，掃描定義只有一份，規則、`--strict`、
> `--error` 與 rule tests 都沒有被動過。
>
> 驗收是行為的：對照組 PR #18（候選 `351e4034`、run `32100761005`）十一個 job 全綠、
> Semgrep 0 findings；故意失敗的 PR #19（候選 `d49330c8`、run `32101192719`）以既有
> 規則 `clinic.javascript.weak-cryptography` 產出 1 筆 blocking finding，`sast` 與
> `Verification evidence` 同時變紅、其餘十個 job 全綠、`mergeStateStatus=BLOCKED`、
> 未用 admin bypass，該 PR 已關閉未合併。branch protection 未變動。
>
> 這**不**表示 Semgrep CE 等同 CodeQL 跨檔分析，也不表示 `SCM-R02` 有任何進展。
>
> 兩件不因此成立的事：(1) `SCM-R04` 未關閉——9 筆殘留 advisory（1 low／8 moderate，
> 皆 dev 工具鏈）仍無 owner／理由／到期日；(2) 稽核對 `SCM-R05` 的驗收條文另含
> 「逐筆 triage 殘留 alert」，該子句與 `SCM-R04` 範圍重疊且尚未完成，邊界待 owner 裁定。

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
> **2026-08-11 supersession note：** 上述 CodeQL 敘述只保留當日歷史。CodeQL 已於
> 2026-08-01 被 Semgrep CE 取代；SAST workflow 目前獨立執行，但未納唯一 required
> `Verification evidence`。本次未重跑 gate，故 dated pass 不代表目前 HEAD。
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

> 下表的「完成／實機驗證」是既有 dated evidence 摘要；2026-08-11 未重新執行。
> 新 release acceptance 必須引用同 commit 的結果。

| 面向 | 狀態 |
| --- | --- |
| Delivery plan | **Stage 0／Checkpoint A 已完成；目前 Stage 1 owner decisions；D-006/D-010 已核准，Stage 2 尚待 change/deployment review** |
| 私有 repository 相依風險可見性 | **2026-07-30 已啟用 dependency graph 與 Dependabot alerts**；2026-08-01 合併後當時 3 筆 moderate 已 fixed，且 SEC-03 source audit 例外已解除。2026-08-11 14:32 +08:00 唯讀 API 另確認 `main` 有 9 筆 open development-scope alerts（8 medium、1 low）；同日讀取 PR #14 的 CI log 則顯示稽核基準 `cf597af` 的 `pnpm audit --audit-level high` 是 10 筆、含 1 筆 high（`postcss` 帶入的 `nanoid 3.3.16`），required `Verification evidence` 因此為紅、branch 無法 merge。「無 audit 例外」不等於「無遠端 alert」，兩個數字不一致時以 CI 為準；須由 `SCM-R05` 修綠並逐筆 triage，長期 SLA 為 `SCM-R04`。**2026-08-17 於 commit `fc15bfd`（CI run `31994942617`）重新驗證：仍是 10 筆／1 high，且 advisory 門檻已由 `>=3.3.17` 上移為 `>=3.3.18`——`SCM-R05` 照舊值提版不會轉綠**。Dependabot 的數字當日在 repository 轉為公開前後大幅跳動（10 筆含 1 high → 8 筆不含 high → API 只回報 1 筆 open），同日 `corepack pnpm run audit:all` 實測仍是 10 筆含該 high。**兩者不一致時以 CI／實測為準的原則不變**；Dependabot 計數受 repository 可見性影響，不能用來宣稱 `SCM-006` 已解除。**2026-08-17 稍後由 `SCM-R05`（PR #16、merge `cf3b87b`）解除：`nanoid` 提至 `3.3.18`，`audit:all` 由 10 筆／1 high 降為 9 筆／0 high，`main` 在 `b05da66`（run `32027293936`）全綠。上述紅燈敘述自此為歷史。** 殘留 9 筆的逐筆 triage 與長期 SLA 仍屬 `SCM-R04` |
| `main` 分支保護 | **2026-08-11 14:32 +08:00 已唯讀驗證**；沒有 repository ruleset，strict required context 只有 `Verification evidence`，force push／branch deletion 關閉，`enforce_admins=false`、無 required review。**2026-08-18 `SCM-R01` 完成後這組設定刻意維持不變**——改的是 `Verification evidence` 的內容（現在彙總五項，含同 commit 的 Semgrep），不是 required context 的清單，因此不需要也沒有做任何 branch-protection 變更。`enforce_admins=false` 仍在，紅燈擋得住的仍只有走保護路徑的合併 |
| 預約流程（初診／回診分流、備註、回診確認、櫃台處置） | 完成，實機驗證 |
| 患者端預約（四步驟、逐欄驗證、行事曆匯出） | 完成，實機驗證 |
| 排班（門診時間、固定不開放時間、草稿／發布） | 完成 |
| 個管指派與月度工作量 | 完成（非金額） |
| Firestore 交易、冪等、outbox | 有 dated Emulator 證據，但 2026-08-11 確認 slot release null sentinel、state-cycle occurrence ID、stale worker settle 未被既有測試涵蓋；`DATA-R01/02`、`ARC-R01` 前不得稱完整驗證，端點維持關閉 |
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
| `robots`／indexability | 現有 global switch＋page inventory；privacy 草稿目前被標 indexable 且在 sitemap | 改 route-specific fail-closed：工作臺／404 永久 noindex；privacy 需 D-003＋policyVersion；booking／clinic 各有正式網域、內容與 release 核准；sitemap/robots/canonical 同來源驗證 |
| `og:url` / canonical | 指向 `beauessence.com.tw/booking` | 換成實際網域 |
| `og:image` | `/og-booking.jpg` 已存在（2026-08-02 由 806 KiB PNG 重編為 53.7 KiB JPEG；刻意不做內容雜湊，平台快取以 URL 為鍵） | 正式網域驗證分享預覽與快取 |
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

## 產品能力 Roadmap（P0～P7）

**新增 2026-08-04。狀態：plan-only。**

本節是**產品能力**的分階段規劃，回答「要做出什麼」。它與上方的 Stage 0～6 是
**兩個不同的軸**：Stage 是治理與部署權限的軸，回答「被什麼擋住」。兩者正交，
不可互相取代，也不可混用編號。

> **編號警告。** 這個 repository 已經有 Phase 0／1、Stage 0～6、C0～C6、Expansion S
> 四套編號。產品階段一律使用 **P0～P7** 前綴，**不得**簡稱為「Phase 3」——那會與
> 既有的 Phase 1 混淆。

### 對照表

| 產品階段 | 內容 | 對應治理 Stage | 阻擋決策 | 現在能做嗎 |
| --- | --- | --- | --- | --- |
| **P0** | 現況盤點與角色收斂 | Stage 1（現在） | 無 | ✅ **可以** |
| **P1** | App Shell 與 Design System 擴充 | Stage 1 | 無 | ✅ **可以** |
| **P2** | 日程管理工作區 | Stage 1→2 | D-004（slot／capacity） | ⚠️ 部分 |
| **P3** | Google Calendar 雙向同步 | Stage 3＋Expansion S | D-009、D-016、須取代 ADR-0002 | ❌ |
| **P4** | 手術與醫療資源管理 | Expansion S | D-014、D-015 | ❌ |
| **P5** | 患者端重構 | Stage 4 | D-001～D-003、D-005、D-011 | ❌ |
| **P6** | 多分院與進階營運 | 新 | 需新決策（尚未編號） | ❌ |
| **P7** | 全通路與 App | 新 | D-011＋新決策 | ❌ |

**八個階段中只有兩個現在能動。** 其餘六個卡在尚未核准的決策，不是卡在工程排期。
這張表的價值在於讓「為什麼還沒開始」有一個具名的答案。

### Now／Next／Later

```text
Now    P0 角色收斂 ＋ 現況盤點文件化
       P1 App Shell 與 Design Token 擴充（純前端，不碰資料流）

Next   P2 日程管理工作區（需 D-004 才能定案 slot 規則）
       P5 患者端 Shell 分離（結構可先做，資料流受 D-001～D-003 擋）

Later  P3 日曆雙向同步   ← D-009、D-016、ADR-0006
       P4 手術與資源     ← D-014、D-015
       P6 多分院         ← 需新決策
       P7 LIFF／App／FCM ← D-011＋新決策
```

---

### P0 — 現況盤點與角色收斂

| 項目 | 內容 |
| --- | --- |
| **目標** | 讓文件與實作一致，並把三套互不相容的角色定義收斂成一套 |
| **範圍** | 角色收斂、頁面地圖、RBAC 矩陣、Firestore／Functions／同步流程盤點、行動版與無障礙阻擋問題，以及 SAST required-check、clinic timing、axe 全嚴重度 evidence、per-page indexability 真實性 |
| **非範圍** | 不新增功能、不改 `packages/domain` 的預約規則、不建立任何雲端資源 |
| **依賴** | 無。D-006 已於 2026-07-28 核准，角色收斂不需等新決策 |
| **技術方案** | `packages/domain/src/roles.ts` 是 canonical role；API 從 domain 匯入，browser 使用雜湊驗證的 vendor mirror；legacy state 做 `admin→manager` migration，unknown fail-closed |
| **需修改模組** | `packages/contracts`、`apps/api/src/platform/authorization/rbac.ts`、`apps/web/public/modules/permissions.js`、`scripts/check-architecture.mjs` |
| **資料模型變更** | 無（角色目前不持久化） |
| **migration** | 瀏覽器 `admin` → `manager` 需要一次狀態遷移；`loadState` 已有「無法解析的 session 直接捨棄」的既有行為可沿用 |
| **測試** | 五角色直連 URL；另補 unmapped timing fail-fast、axe 完整 artifact、privacy draft noindex/sitemap contract |
| **驗收** | 見 [角色權限矩陣](architecture/rbac-matrix.md) §6 六項 |
| **回滾** | 角色型別與守衛皆為新增，`git revert` 即可；無資料遷移不可逆 |
| **風險** | 中。§7 有四個未解問題，回答前對應權限列不得實作 |
| **完成定義** | 同 commit 必要 CI 綠燈、五角色交叉測試通過、未解問題送 owner，且上述四項文件宣稱與實際 gate 一致 |

**可執行的小任務：**

1. 保持 `packages/domain/src/roles.ts` 為唯一 canonical role，修正任何新增漂移。
2. 保持 `rbac.ts` 從 domain 匯入；後續工作是 Session、scope/query/field enforcement。
3. `permissions.js` 使用 compiled vendor canonical values；preview state `admin` 遷移為 `manager`。
4. 新增 `consultant`、`physician` 兩個角色的空權限集合（先不授予任何權限）。
5. `check-architecture.mjs` 新增守衛：禁止角色字串字面值出現在 contracts 以外。
6. 撰寫五角色 × 各工作區的直連 URL 測試。
7. 產出頁面地圖與 Firestore／Functions 盤點（文件，非程式）。
8. 修正行動版剩餘的底部異常留白與水平 overflow。
9. 把 `rbac-matrix.md` §7 的四個問題整理成負責人問卷。

**不在 P0：** `read_payment`、`read_clinical_record` 等受 D-014／D-015 阻擋的權限，
只在型別中宣告，不接線、不授予、`unrouted-inventory.json` 須登記對應 blocker。

---

### P1 — App Shell 與 Design System 擴充

| 項目 | 內容 |
| --- | --- |
| **目標** | 統一整站框架與視覺語言，不改動核心資料流程 |
| **範圍** | AppShell、側邊導覽、手機抽屜、全域搜尋位置、分院切換位置、同步狀態列、通知中心、事件類型與狀態 token |
| **非範圍** | 不重做 Boutique Clinical Command 已完成的六階段；不新增 Button／Input／Table 等既有元件 |
| **依賴** | P0 的角色收斂（導覽項需宣告 permission） |
| **技術方案** | 新 Shell 與舊 header 以建置開關並存；新樣式全部加前綴命名空間 |
| **需修改模組** | `apps/web/public/modules/workspace-tabs.js`、`styles.css`、`workbench.css`、`scripts/check-web-ui.mjs`、`scripts/check-design-tokens.mjs` |
| **資料模型變更** | 無 |
| **migration** | 五步漸進，見 [App Shell 規劃](design/ui-shell-and-scheduling-redesign-plan.md) §7。每一步可獨立回滾 |
| **測試** | `e2e-ui`、`e2e-mobile`、`e2e-accessibility` 三組；視覺基線比對 |
| **驗收** | 見 App Shell 規劃 §8 八項 |
| **回滾** | 建置開關切回舊 Shell；舊 Shell 在全部頁面遷移完成前不移除 |
| **風險** | 中。Shell 並存期間兩套樣式互相污染——以命名空間前綴與 `check:ui` 守衛緩解 |
| **完成定義** | 所有主要頁面套用同一 Shell、320px 無雙向捲動、可切回舊版 |

**可執行的小任務：**

1. 擴充 design tokens：事件類型四色、狀態七色、Drawer／Sheet 規格、表格密度。
2. `check:tokens` 新增守衛：事件類型色不得用於狀態元件，反之亦然。
3. 建立 AppShell 骨架（header ＋ 側邊導覽），置於建置開關後方。
4. 側邊導覽項宣告所需 permission，未授權不顯示。
5. 加上 router guard：直連未授權工作區的 URL 被擋下。
6. 手機抽屜導覽（焦點鎖定、`Escape` 關閉、遮罩不殘留）。
7. SyncStatusBadge 元件（文字＋圖示，不只顏色）。
8. 「今日工作臺」單頁試點切到新 Shell。
9. 視覺基線重新擷取並比對。

---

### P2～P7 概要

以下六個階段全部受決策阻擋，**目前只做規劃**。完整的目標／範圍／非範圍／依賴／
技術方案／資料模型／migration／測試／驗收／回滾／風險，於對應決策核准後、進入該
階段前補齊；提前寫死會在決策答案出來時全部作廢。

| 階段 | 目標 | 關鍵資料模型變更 | 回滾策略 | 主要風險 |
| --- | --- | --- | --- | --- |
| **P2** 日程工作區 | 日曆成為主要營運工作區 | 無新增；篩選狀態進 URL | 新頁面與既有週曆並存，可直接下架 | 與既有週曆邏輯分歧 → 共用 `schedule-engine.js` |
| **P3** 日曆雙向同步 | 系統與 Google 雙向一致 | 同步狀態子文件（十個欄位） | 關閉 inbound 即回到單向投影，營運資料不受影響 | **日曆共用者誤改造成預約異動** → inbound 一律待審 |
| **P4** 手術與資源 | 手術、麻醉與資源排程 | 手術、資源、麻醉、款項（受 D-014／D-015） | 功能開關；取消不刪資料 | 臨床資料的 accountable owner 未定（D-014） |
| **P5** 患者端重構 | 獨立 Patient Shell | 無 | 建置開關 | 與工作臺共用樣式導致內部欄位外洩 |
| **P6** 多分院 | 多分院與跨分院排程 | **分院維度須進入既有全部集合** | 極難回滾 → 必須一次設計對 | 資料模型變更影響面最大 |
| **P7** 全通路與 App | LIFF、PWA、App、FCM | 無（共用既有 API） | 通路各自可下架 | 各通路的權限模型必須共用 §RBAC，不可各自實作 |

**P6 的警告值得單獨強調：** 加入分院維度會影響既有的每一個集合與每一條查詢。它是
八個階段中唯一難以漸進回滾的，因此**不得在「先做個簡單版本」的心態下開始**。目前
連「分院」的決策編號都還沒有，寫 schema 是猜。

---

## 相關文件

- [產品定位與長期方向](product/product-vision.md) — 2026-08-04 產品定位與核心能力盤點
- [角色權限矩陣](architecture/rbac-matrix.md) — 三套角色定義的收斂提案與六個實施位置
- [App Shell 與日程工作區重構規劃](design/ui-shell-and-scheduling-redesign-plan.md) — P1／P2 設計
- [行動版 UX 規劃](design/mobile-ux-plan.md) — 導覽、卡片化與 viewport 驗收
- [日曆雙向同步規劃](architecture/calendar-bidirectional-sync-plan.md) — P3，須先取代 ADR-0002
- [測試策略](architecture/test-strategy.md) — 十個測試層級與 E2E 分組
- [企業級上線前審查](reviews/2026-07-23-enterprise-production-readiness-review.md) — 2026-07-23 的歷史評分、當時阻擋項與驗證證據
- [正式環境目標架構](architecture/production-target-architecture-2026-07-23.md) — 保留與修改邊界、目標資料流、交易與資料模型
- [正式化後續實作規劃](product/production-readiness-delivery-plan-2026-07-23.md) — Stage 0～6、決策 gate、驗收與重新評分點
- [整合測試計畫](architecture/calendar-and-database-integration-plan.md) — 各階段的技術細節與驗收
- [Stage 2 身分與 Cloud change plan](architecture/stage-2-identity-and-cloud-change-plan-2026-07-28.md) — D-006/D-010 核准值的 plan-only 切片、驗收與回滾
- [Expansion S 規劃](product/2026-07-28-surgery-follow-up-expansion-plan.md) — 手術、臨床時間軸、付款／結算與 Calendar inbound 的獨立分階段規劃
- [階段 B/C 核准請求](product/stage-b-c-approval-request.md) — 要交給診所的中文表
- [企業級專案規劃書](enterprise-appointment-project-plan.md) — 完整架構、資料模型與 §5.3 落差追蹤
- [UI/UX 基線](design/test-only-operations-ui.md) — 不得回退的介面規則

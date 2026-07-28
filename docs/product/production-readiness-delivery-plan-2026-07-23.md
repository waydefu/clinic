# 正式化後續實作規劃書

狀態：Proposed  
日期：2026-07-23  
目前 checkpoint：Stage 0／Checkpoint A 已於 2026-07-24 通過；目前進行 Stage 1
owner decisions。D-010 target architecture/SLO 與 D-006 identity/security 已於
2026-07-28 核准；Stage 2 仍待 change-plan review 與 deployment authority，且
決策核准不等於已有實作、部署或復原證據。

架構依據：[正式環境目標架構書](../architecture/production-target-architecture-2026-07-23.md)  
決策依據：[Phase 1 決策登錄](phase-1-decision-register.md)

本規劃把目前合成 preview、已驗證的 domain/repository/worker，逐步轉成可評分的
staging 與 production 候選。它不自行核准 D-001～D-011，也不授權真實資料、
雲端資源或 production deployment。

2026-07-28 新增的手術、臨床時間軸、付款／結算與 Calendar inbound 不直接插入
本 Stage 0～6 critical path；它們位於獨立
[Expansion S plan](2026-07-28-surgery-follow-up-expansion-plan.md)，並受 D-014～
D-016 及原有對應 gate 約束。

## 1. 目標與判定

### 1.1 目前進度

已完成：

- 合成患者與 staff UI；
- 純 domain appointment rules；
- Firestore Emulator 的 booking/transition/reschedule transaction；
- idempotency、audit/outbox 同交易；
- deny-by-default Rules；
- worker lease、retry、dead-letter、requeue；
- Calendar port、Google client、冪等 event ID 與 no-PII tests；
- strict contract inventory/mapping、application/auth boundary skeleton、
  patient booking guard、audit v2；
- schedule、patient identity、case assignment 與 payroll 的 domain planners；
- CI 的 structure/docs/format/lint/types/unit/Emulator/Playwright E2E、
  axe、performance、SBOM、license 與本機 SAST gates；
- per-file minify/content-hash/modulepreload dist 與 immutable hashed assets；
- expiring static synthetic preview。

尚未完成：

- Stage 1 中仍為 `pending` 的 owner decisions 與具名核准證據；
- identity provider、MFA、session、server authorization；
- routed Booking API 與 patient identity flow；
- production Firestore model、retention/deletion；
- versioned schedule 的 production persistence／route；
- audit 的正式 retention、access、export 與 production persistence；
- executable IaC、backup/restore、monitoring；
- connected-cloud／production operational evidence、人工 screen-reader／
  forced-colors 實測與 go-live sign-off。

### 1.2 規劃原則

1. 不推倒現有 domain/repository/worker。
2. 先補 contract 與架構 seam，再接雲端。
3. staging 先只用合成資料；真實資料是獨立 gate。
4. 每階段都可回滾，且有明確驗收與重新評分點。
5. 未核准政策只記 dependency，不以程式預設值代替。

## 2. 優先順序與目前剩餘工作

| 優先 | 項目 | 原因 | 產出 |
| --- | --- | --- | --- |
| 1 | 對齊 API contract / domain / UI | **Stage 0 已完成** strict inventory、mapping 與 rejection tests；D-006 staff identity 已核准，患者 identity flow 仍受 D-001～D-003/D-011 gate | 維護 versioned contracts；依核准值規劃 staff identity contract |
| 2 | 建立 application/auth boundary | **未掛路由 skeleton 已完成**；真 IdP、角色與 resource scope 尚未實作 | 依 D-006 與審查後 Stage 2 plan 接 controller/session/policy persistence |
| 3 | patient active-booking guard | **已完成**明確 document contention 與跨 slot Emulator race | 維持 guard transaction regression |
| 4 | 擴充 audit schema | **audit v2 與 transaction assertions 已完成**；永久 append-only/delete-deny 已由 D-006 核准，production access/export 與可識別連結仍待 D-002 | production append-only persistence + approved operations |
| 5 | domain 化 schedule/patient/case rules | 核心 planners 已進 domain；synthetic adapters 仍 browser-local，merge／正式 mapping 受 gate | 決策後接 application/repository adapters |
| 6 | worker runner/observability | processor、trace/metrics ports 與 plan 已有；production trigger、backend、alerts、identity 未接 | 依已核准 D-010 target 完成 change review 後接 runner；D-009 後接 test Calendar |
| 7 | IaC 與環境隔離 | 目前只有 plan／README，沒有可重現 staging/production | 依已核准 D-010 target 建立並審查 Terraform modules |
| 8 | production quality evidence | Playwright、axe、performance、SBOM、license、SAST 已自動化；尚缺 connected-cloud、人工 a11y 與 ops 演練 | environment-bound evidence + owner sign-off |

## 3. 階段與 Gate

### Stage 0：架構硬化與 contract 收斂

**狀態：已完成；Checkpoint A 於 2026-07-24 通過。** 本段保存原始工作與驗收，
不是目前待辦。完成證據見
[Stage 0 Checkpoint A](../reviews/stage-0-checkpoint-a-2026-07-24.md)。

原建議工期：1～2 個工程週。

已完成工作：

1. 建立完整 command/error contract inventory。
2. 移除未核准的 optional email contract，或以明確 decision dependency 封鎖。
3. 定義 patient intake/verification 與 appointment command 的分界；實作前保持
   TBD。
4. 新增 API application service、repository port、auth context interface 與
   policy interface，不接真 IdP。
5. 加 `patient_booking_guards` planner/repository 寫入。
6. 加「同 patient、不同 slots、同時送出」Emulator test。
7. 擴充 audit schema 與 transaction tests。
8. 為 outbox 加 jitter design、correlation/causation contract 與 metrics port。

驗收：

- 所有 contracts 與 domain request 有明確 mapping；
- controller 不直接依賴 Firestore；
- body 內 actor/role 被拒絕或忽略；
- 同 slot 與同 patient 跨 slot 競態皆只有一筆成功；
- 既有 verify/rules 全通過。

**Checkpoint A：已通過；這是架構重新檢查，不是 production 評分或 route 授權。**

### Stage 1：決策與治理核准

**狀態：目前進行中；由具名 owner 完成。** Stage 0 已結束，不再把其完成清單當成
現在施工入口。

工期：取決於診所、法律、資安與營運決策，不列入工程承諾。

| Gate | 決策 | 解除的工作 |
| --- | --- | --- |
| B | D-006/D-010 已核准；Stage 2 change review＋deployment authority | cloud staging、staff login、IAM、backup/monitoring |
| C | D-009 | 專用 test Calendar integration |
| D | D-001～D-005、D-011 | public booking 與真實患者資料 |
| E | D-007、D-008 | case assignment 與 payroll persistence |

每項核准必須填：

- Answer；
- Approved by；
- Approval date（Asia/Taipei）；
- Evidence/policy reference；
- Follow-up implementation issue。

### Stage 2：合成資料 Cloud Staging

前置：D-006/D-010 approved，並完成 Stage 2 change review 與獨立 deployment
authority。
建議工期：2～3 個工程週。

工作：

1. 建立隔離的 staging project、Firestore、runtime、service accounts。
2. 建立 Terraform modules 與 remote state。
3. 依
   [Stage 2 身分與 Cloud change plan](../architecture/stage-2-identity-and-cloud-change-plan-2026-07-28.md)
   啟用核准的 IdP，以合成 staff 驗證 Google＋自管帳號、全員 MFA、自管帳號
   TOTP、30 分鐘 idle／8 小時 absolute session 與停權撤銷。
4. 完成 API auth/authz middleware 與 application services。
5. 路由 staff-only booking/transition/reschedule endpoints。
6. Web 的 role switch 改為登入；`stagingRequest` 換 `api-client`。
7. Rules 持續 deny direct client；API Admin SDK 以 IAM 存取。
8. 建立 audit query、correlation ID、API/Firestore metrics。
9. 建立 synthetic reset/seed 工具，限 staging operator。

驗收：

- 未登入 request 401；
- 無權限 action 403，不能只靠 UI；
- disabled account/session 在停權完成後的下一個 protected request 即被拒絕；
- direct Firestore read/write 拒絕；
- staging 只含 synthetic data；
- deploy/rollback 與 backup/restore smoke 成功。

**Checkpoint B：重新評 Security、Reliability、Maintainability、Test Confidence。**

### Stage 3：Calendar Test Projection

前置：Stage 2、D-009 approved。  
建議工期：1 個工程週。

工作：

1. 使用專用 test Calendar 與最小 scope service identity。
2. 部署 worker runner/trigger。
3. 啟用 Secret Manager injection 與 rotation procedure。
4. 加 full jitter、queue/dead-letter/latency metrics 與 alert。
5. 執行 create/reschedule/complete/cancel/lost-ACK/dead-letter/requeue。
6. 留存 no-PII event inspection 與 runbook rehearsal。

驗收：

- 一筆 appointment 永遠最多一個 Calendar event；
- Calendar outage 不回滾已成立 booking；
- UI 不把 queued 說成 synced；
- 服務恢復後可補回；
- event 無 patient PII；
- dead-letter 在 SLO 內告警。

**Checkpoint C：重新評 Reliability、Privacy、Operations。**

### Stage 4：隱私與公開 Booking

前置：D-001～D-006、D-010、D-011 approved；Stage 2 完成。  
建議工期：2～3 個工程週。

工作：

1. 發布 immutable privacy policy version。
2. 實作 privacy acceptance evidence。
3. 實作核准的 patient identity/verification flow。
4. 正式 patient profile、identifier protection、field-level projection。
5. public create/view/cancel/reschedule API。
6. rate limit、anti-automation、maintenance、abuse monitoring。
7. retention/delete/anonymize/export/rights-request workflow。
8. patient Web 改正式 API，不保存完整 PII 至 localStorage。
9. production privacy/terms/accessibility/manual fallback content。

驗收：

- PII 不進 URL/log/localStorage/Calendar；
- patient 只能讀寫自己的資料；
- policy version 與 acceptance 可追溯；
- retention/delete/DSR 有端到端演練；
- 409/429/timeout/offline/recovery UX 完整；
- accessibility 與 mobile E2E 通過。

**Checkpoint D：完整企業級重新評分，但仍由 go-live gate 決定是否上線。**

### Stage 5：排班、個管與薪資正式化

前置：D-004、D-006、D-007、D-008 approved。  
建議工期：1～2 個工程週。

工作：

1. versioned schedule draft/publish/diff/impact/rollback；
2. Case Manager role 與 resource scope；
3. effective-dated assignment/reassignment；
4. patient merge review；
5. rule-versioned payroll credit、period snapshot、lock、adjustment；
6. read-only Auditor flow。

驗收：

- 兩管理員同時發布只允許一方成功；
- rollback 不孤立既有 appointment；
- reassignment 不覆寫歷史；
- month close 後只能 adjustment；
- 所有操作有完整 audit。

### Stage 6：Production Readiness 與 Go/No-Go

前置：release scope 所有決策與前置 stage 完成。  
建議工期：1～2 個工程週。

工作：

1. production IaC plan/security review；
2. production data migration/seed/rollback plan；
3. backup restore、RTO/RPO、incident tabletop；
4. E2E/browser/a11y/performance/security regression；
5. dependency/secret/SAST/SBOM/license gate；
6. load/soak/transaction contention/worker backlog test；
7. support、manual booking、privacy incident、Calendar failure rehearsal；
8. release evidence pack 與 owner sign-off。

Go：

- 0 個 open P0/P1；
- P2 有 owner、期限與風險接受；
- 所有 release gate 可重現；
- rollback/restore 已實際演練；
- 由 clinic/privacy/security/operations/technical owner 共同簽核。

No-Go：

- 任一必要決策 pending；
- 真實資料仍可能進 localStorage/log/Calendar；
- actor 可由 request body 決定；
- direct Firestore client path 存在；
- backup 無法還原；
- 權限、競態、a11y 或 incident gate 失敗。

## 4. 建議時程

下表是 2026-07-23 的相對工程量估算，不是目前日曆進度；Stage 0 已完成，現在停在
Stage 1，後續週次要從必要決策實際核准後重新排定。

假設一位主要 full-stack 工程師，另有兼任 cloud/security、QA/a11y 與診所決策
owner；決策能及時完成：

| 期間 | 主工作 |
| --- | --- |
| Week 1–2 | Stage 0 架構硬化；Stage 1 決策並行 |
| Week 3–5 | Stage 2 cloud staging |
| Week 6 | Stage 3 Calendar test projection |
| Week 7–9 | Stage 4 privacy + public booking |
| Week 9–10 | Stage 5 schedule/case/payroll |
| Week 11–12 | Stage 6 production readiness |

這是 8～12 工程週的規模估算，不是承諾。D-001～D-011、法務、雲端帳務或
供應商審查延遲時，里程碑必須順延，不得以硬編預設值趕進度。

## 5. Workstream Backlog

### Contract / Domain

- [x] command/response/error inventory（2026-07-24；inventory 完成，不代表 route 已啟用）
- [x] patient identity boundary（ADR-0005；分界固定，驗證方案仍受決策 gate 阻擋）
- [x] transition/reschedule contracts（2026-07-24 unrouted strict schema + mapping/rejection tests）
- [x] delete-appointment contract + `planDeletion`（2026-07-24；管理者限定、
      理由封閉清單、audit v2 `after: null`；未掛路由）
- [x] follow-up/schedule contracts（2026-07-24；`planFollowUpDecision`＋
      `planSchedulePublication` 進 domain，unrouted strict schema，回診網格
      驗證與排班樂觀版本／孤兒預約守衛皆有測試）
- [x] patient active-booking guard（2026-07-23 local/Emulator）
- [x] audit v2（2026-07-23 local/Emulator）
- [x] schedule planner/version conflict（2026-07-24 `planSchedulePublication`，
      樂觀 `expectedVersion` 衝突偵測；瀏覽器多分頁亦走同一守衛）
- [x] case assignment effective periods（2026-07-24；`planCaseAssignment`
      effective-dated，reassignment 收尾前段不覆寫，`assertConsistentAssignmentHistory`
      守衛不重疊／單一開放期間；unrouted `AssignCaseManager*` schema。merge review
      使用已核准 D-006 安全基線；merge review／assignment rule 仍受 D-007 gate）
- [x] payroll close/adjustment（2026-07-24；`planPayrollPeriodClose` 鎖定期間快照，
      `planPayrollAdjustment` 鎖後只允許具理由調整、不得低於零；audit v2 加
      `payroll_period_closed`/`payroll_adjustment_recorded`；unrouted
      `ClosePayrollPeriod*`/`RecordPayrollAdjustment*` schema。財務規則版本與 lock
      owner 仍受 D-007～D-008 gate；D-006 安全基線已核准）
  - 2026-07-24 外部複查（P1）修正：第一版的 `planPayrollAdjustment` 回傳
    `{...closed, creditCount, lastAdjustedAt}`，沿用同一個 snapshot id——repository
    只要照計畫寫回 `payroll_periods`，就會覆寫月結規格明定「不可修改」的快照。
    已改為保留快照不動、產生 append-only 的 `PayrollAdjustment` ledger，總數由
    `payrollTotalAfterAdjustments` 從 ledger 推導；同時補上時間單調性守衛
    （adjustment 不得早於關帳或早於前一筆）。快照型別已移除 `lastAdjustedAt`
    ——可變欄位放在不可變紀錄上，本身就是誘因。

### API / Security

- [x] auth context（2026-07-23 Stage 0 interface；未接真 IdP）
- [x] RBAC + resource-scope policy（2026-07-24；`platform/authorization/rbac.ts`
      候選角色矩陣＋`evaluateAccess`：authenticated＋active＋role permits＋resource
      scope；own_patient BOLA、assigned_patient 個管謂詞、denial 不洩漏存在性；
      `createRbacAppointmentPolicy` 接上既有 appointment port。D-006 已核准
      administrator／front desk／physician 的最小基線，但其餘角色值仍受各自
      gate，且全部未掛路由）
  - 2026-07-24 外部複查（P2）修正：`createRbacAppointmentPolicy` 在
    `role === 'patient'` 但缺少 `verifiedPatientId` 時，會落到 `{ kind: 'any' }`
    ——而 patient 本來就持有 `create_appointment`，於是 fail-open。已改為直接
    拒絕，並補上 `rbac-appointment-policy.test.ts`（先前這個檔案沒有測試）。
- [x] application services（2026-07-23 unrouted create skeleton）
- [x] repository ports/adapters（2026-07-23 local/Emulator）
- [x] idempotency scope + request hash（2026-07-23 local/Emulator）
- [x] rate limit/anti-automation（2026-07-24；`FixedWindowRateLimiter` 介面＋
      per-key 固定視窗、可注入時鐘，丟 `RATE_LIMITED`。生產共享儲存須依已核准
      D-010 target 完成 Stage 2 change review）
- [x] maintenance gate（2026-07-24；`StaticMaintenanceGate` 丟 `SERVICE_UNAVAILABLE`；
      生產共享旗標須依已核准 D-010 target 完成 Stage 2 change review）
- [x] safe error/correlation mapping（2026-07-24；`platform/errors/api-error.ts`
      集中式 domain/Zod/platform error → v1 envelope，固定安全訊息不洩漏 domain
      訊息／stack／識別碼，correlationId 非不透明即以 `unknown` 取代；
      `DOMAIN_TO_API_CODE` 對 `DomainErrorCode` 窮盡）

### Data / Privacy

- [ ] classification and field inventory
- [ ] policy versions/acceptances
- [ ] patient identifier protection
- [ ] retention/delete/anonymize/export
- [ ] DSR workflow
- [ ] backup deletion exception
- [ ] vendor/data-region record

### Worker / Integrations

下列未勾選項目的**設計已於 2026-07-24 定案**（plan-only，見
[worker 執行與對帳計畫](../architecture/worker-runtime-and-reconciliation-plan-2026-07-24.md)）；
勾選要等實際接線；runner 與監控須依已核准 D-010 target 完成變更審查，
Calendar 接線另受 D-009 gate。

- [ ] trigger/scheduler — 設計：Cloud Scheduler 每分鐘拉取、批次 20、租約 120 秒、單實例
- [ ] runtime jitter（Stage 0 full-jitter design 已固定）
- [x] correlation/causation（2026-07-23 local/Emulator）
- [x] metrics port（2026-07-23 local/Emulator）
- [ ] metrics backend/alerts — 設計：四條告警對應三個既有 metric＋死信，低基數為硬性要求
- [ ] reconciliation — 設計：每日比對 `calendar_links` 與日曆，四類漂移，孤兒事件只告警不刪
- [ ] dead-letter operator permissions — 設計：補回限管理者且必填理由，死信不得刪除
- [ ] Calendar credential rotation — 設計：90 天，先加新版本再停用舊版本，煙霧測試由負責人執行

### Infrastructure / Operations

下列未勾選項目的**設計已於 2026-07-24 定案**（plan-only，見
[基礎設施與維運計畫](../architecture/infrastructure-and-operations-plan-2026-07-24.md)、
[備份與還原 runbook](../runbooks/backup-and-restore.md)、
[事故應變 runbook](../runbooks/incident-response.md)）；
勾選要等依已核准 D-010 target 完成 Stage 2 change review 並實際建立資源。
**沒有執行任何 `terraform apply`。**

- [ ] environment modules — 設計：三個分離 project、modules/environments 佈局、remote state、plan/apply 分離
- [ ] service accounts/IAM — 設計：api/worker/deployer/terraform 四個帳號分離，禁 owner/editor，CI 走 Workload Identity Federation
- [ ] Secret Manager — 設計：三個 secret、90/180 天輪替、先加後停
- [ ] Firestore indexes/backups/PITR — 設計：每日備份保留 30 天、PITR 7 天、刪除保護、索引經 CI 部署
- [ ] monitoring/logging/budget — 設計：四個 SLI 與建議 SLO、告警分兩級且每條都要有 runbook、日誌不得含患者識別、預算 50/80/100% 告警
- [ ] deployment approval/rollback — 設計：production 需人工核准且核准者非提交者；資料變更不可回滾故一律走加欄位→雙寫→驗證→停用
- [ ] RTO/RPO and restore drill — 設計：四種情境的建議 RTO/RPO（**待負責人核准**）、還原到新 database、V1～V6 驗證、每季演練
- [ ] incident response — 設計：SEV1～4 分級、四個角色、隱私事故路徑（法定通報時限由法務依上線時有效法令認定）、無責備檢討

### Web / Quality

- [x] API client adapter seam（2026-07-24；patient/admin controller 只依賴
      `modules/api-client.js`，目前注入 browser-local `stagingRequest` transport；
      尚未建立 `/v1` route 或網路請求）
- [x] real loading/pending/error/retry states（2026-07-24 收尾；除第一批高頻指令外，
      登出、帳號建立／停用、公告、維護、發布紀錄、排班草稿編輯／刪除／捨棄、
      死信模擬／補回等低頻治理指令全部改走 `runUiAction`（pending label、
      disabled、就地 status／retry；按鈕不宣告 `aria-busy`）；`api-client` 新增
      HTTP status → v1 envelope 映射
      （`httpTransportError`：409 不可重試、429/503 可重試、400/401/403/404 依碼），
      並把 offline 與 timeout 轉為可重試的 `SERVICE_UNAVAILABLE`；GET 僅對 retryable
      自動重試、POST 永不自動重放。transport 仍是 browser-local `stagingRequest`）
- [x] per-file minify/content hash/modulepreload/cache（2026-07-24 起；
      `scripts/build-web.mjs` 逐檔壓縮 JS/CSS、改寫 content-hashed import graph，
      並注入 `modulepreload`；firebase 雜湊資產 immutable、穩定 HTML
      `no-cache`，CSP 未放寬；`hosting.predeploy` 綁 `pnpm build`。per-entry
      bundling 已由 owner 拒絕，除非新決策重開）
- [ ] staff auth route protection
- [x] Playwright E2E（2026-07-24；患者預約流程＋工作臺登入→建立→到診→回診
      →刪除，跑在 content-hash 的 dist 上，CI verify.yml 新增 e2e job）
- [x] axe（2026-07-24；患者頁、登入閘門、登入後預約清單皆掃 serious/critical＝0；
      掃描過程抓到並修正三個真實對比／鍵盤違規：amber 文字、休診日表頭、週檢視
      可聚焦）
- [x] screen-reader/forced-colors 人工測試程序（2026-07-24；
      [人工無障礙測試 runbook](../runbooks/manual-accessibility-test.md) 定義 A～D
      四節腳本、通過條件與證據模板。**程序已定義，尚未執行**——第一次實測需要
      NVDA/VoiceOver 與 Windows 對比佈景主題，屬人工作業）
- [x] Lighthouse budgets（2026-07-24；`apps/web/performance-budget.json` 採
      Lighthouse budget.json 格式。位元組由 `pnpm check:perf` 對 dist 靜態計算
      （gzip 傳輸量，掛進 verify），時間由 `tests/e2e/performance.spec.ts` 實測
      FCP/LCP/CLS，門檻取 Core Web Vitals 良好界線。字型預算訂為 0 KiB，
      逼使字型成為一次刻意的決定）
- [x] tracked-secret/high-critical dependency CI skeleton（2026-07-23）
- [x] SAST/final dependency policy/standards-compliant SBOM gates（2026-07-24；
      `pnpm sbom` 產 CycloneDX 1.6 並執行授權政策 gate（SPDX 運算式解析、強
      copyleft 擋下、三筆 dev-only 已審視例外每次列印）；ESLint 加
      `no-eval`/`no-new-func`/`no-script-url`/`no-proto`/`no-implied-eval`；
      CodeQL workflow 已寫，repository 也已有 GitHub remote；workflow 會隨
      push／pull request／排程執行，但目前文件證據仍不能確認此私有 repository
      的 code-scanning upload／Security 頁面權限是否成功。該遠端結果與所需方案
      必須在 Stage 2／上線證據包中驗證，不得再把「缺 remote」列為原因）
  - 2026-07-24 外部複查（P2）修正：授權例外原本只以套件名稱查找，套件升版、
    授權內容改變、甚至由 dev 相依變成 runtime 相依都會被自動放行——而那正是稽核
    最需要重看一眼的時刻。例外現在綁完整 purl（含版本）＋預期授權字串＋預期
    scope，任何一項漂移就重新變成違規。

## 6. Owner Matrix

| 工作 | Accountable | Responsible / Consulted |
| --- | --- | --- |
| D-001～D-003 | Clinic + privacy/legal owner | Engineering, operations |
| D-004～D-005 | Clinic operations owner | Legal, engineering |
| D-006 | Clinic + security owner | Engineering |
| D-007～D-008 | Case/finance owner | Operations, engineering |
| D-009 | Clinic + security owner | Calendar owner, engineering |
| D-010 | Technical + security owner | Cloud/operations |
| D-011 | Clinic operations owner | Accessibility/UX, engineering |
| API/domain/worker | Technical owner | Engineering, QA/security |
| Production go/no-go | Clinic owner | Privacy, security, operations, technical owners |

## 7. Definition of Done

每個 capability 只有同時符合下列條件才算完成：

1. decision dependency 已核准；
2. contract versioned；
3. domain invariant 有測試；
4. server authentication/authorization/validation 完成；
5. idempotency、audit、error、correlation 完成；
6. external effect 使用 outbox；
7. success/denied/conflict/retry/recovery tests 完成；
8. privacy/security/accessibility impact 已檢查；
9. metrics/alert/runbook 完成；
10. docs/ADR/decision/evidence 更新且 CI 全綠。

## 8. 重新評分計畫

| 時點 | 評分目的 |
| --- | --- |
| Checkpoint A | 確認架構缺口已關閉，不做上線宣告 |
| Checkpoint B | 評 Security、Reliability、Maintainability、Test Confidence |
| Checkpoint C | 評 Integration、Outbox、Operations、Privacy minimisation |
| Checkpoint D | 依原企業級提示詞完整重評 |
| Go/No-Go | 使用 production evidence pack 作最終決策 |

下一次完整重評應提供：

- staging URL 與 commit/tag；
- D-001～D-011 最新 decision register；
- architecture/IAM/data-flow diagram；
- API/OpenAPI 或 executable contracts；
- CI、E2E、a11y、performance、security reports；
- backup restore、incident、Calendar failure rehearsal；
- privacy policy/retention/DSR/vendor records；
- open issue register 與 risk acceptance。

## 9. 接下來十個動作

1. 把本規劃、目標架構與 Stage 2 identity/cloud change plan 交由 technical／
   security owner 審查；本輪只規劃，不改碼、不 apply。
2. D-006 MFA／session／授權碼／audit 與 D-010 target 已核准；把核准值轉成
   environment、cost、IAM、recovery、test 與 rollback 證據清單，
   D-001～D-005/D-011 並行準備。
3. ✅ 建立 command/response/error contract inventory
   （2026-07-24；未核准 commands 只列 inventory，不建立 route）。
4. ✅ 建立 patient identity boundary ADR
   （ADR-0005；方案保持 TBD 至決策核准）。
5. ✅ 實作 `patient_booking_guards` 與跨 slot concurrency test
   （2026-07-23，local/Emulator）。
6. ✅ 實作 audit v2 contract 與 transaction assertions
   （2026-07-23，local/Emulator）。
7. ✅ 建立 API application service/auth/policy/port skeleton
   （2026-07-23；未掛 route、未接真 IdP）。
8. ✅ staging IaC、worker、backup/restore 與 incident plan 已於 2026-07-24
   文件化；仍是 plan-only，未 apply。
9. ✅ E2E／axe／performance／supply-chain／SAST CI gates 已建立；人工 a11y 與
   connected-cloud evidence 尚未執行。
10. ✅ Checkpoint A 已於 2026-07-24 通過；D-006/D-010 已於 2026-07-28 核准。
    Stage 2 change plan 與 deployment action 另行核准後，才能決定 Stage 2
    開始日期。

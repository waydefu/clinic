# 正式化後續實作規劃書

狀態：Proposed  
日期：2026-07-23  
架構依據：[正式環境目標架構書](../architecture/production-target-architecture-2026-07-23.md)  
決策依據：[Phase 1 決策登錄](phase-1-decision-register.md)

本規劃把目前合成 preview、已驗證的 domain/repository/worker，逐步轉成可評分的
staging 與 production 候選。它不自行核准 D-001～D-011，也不授權真實資料、
雲端資源或 production deployment。

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
- CI 的 structure/docs/format/lint/types/unit/Emulator tests；
- expiring static synthetic preview。

尚未完成：

- D-001～D-011 正式核准；
- identity provider、MFA、session、server authorization；
- routed Booking API 與 patient identity flow；
- production Firestore model、retention/deletion；
- versioned schedule publish；
- 完整 audit；
- executable IaC、backup/restore、monitoring；
- production E2E/a11y/performance/security gates。

### 1.2 規劃原則

1. 不推倒現有 domain/repository/worker。
2. 先補 contract 與架構 seam，再接雲端。
3. staging 先只用合成資料；真實資料是獨立 gate。
4. 每階段都可回滾，且有明確驗收與重新評分點。
5. 未核准政策只記 dependency，不以程式預設值代替。

## 2. 優先修改建議

| 優先 | 項目 | 原因 | 產出 |
| --- | --- | --- | --- |
| 1 | 對齊 API contract / domain / UI | 目前 patient payload 與 appointment request 不一致 | versioned contract + mapping tests |
| 2 | 建立 application/auth boundary | route 不能直接接 repository | controller/service/policy/port skeleton |
| 3 | patient active-booking guard | 把跨 slot 唯一性變成明確 document contention | guard model + concurrency test |
| 4 | 擴充 audit schema | 正式稽核不能只留 action/actor/time | audit contract + transaction assertions |
| 5 | domain 化 schedule/patient/case rules | 避免正式 API 重寫 browser 規則 | pure planners + tests |
| 6 | worker runner/observability | 現在只有核心處理器，沒有 production 操作面 | trigger、jitter、metrics、alerts |
| 7 | IaC 與環境隔離 | 沒有可重現 staging/production | reviewed Terraform modules |
| 8 | production CI gates | 現有測試未涵蓋 browser/API/ops | E2E/a11y/perf/security pipeline |

## 3. 階段與 Gate

### Stage 0：架構硬化與 contract 收斂

**可立即進行；全程 local/Emulator/synthetic。**

建議工期：1～2 個工程週。

工作：

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

**Checkpoint A：架構重新檢查，不做 production 評分。**

### Stage 1：決策與治理核准

**可與 Stage 0 並行；由具名 owner 完成。**

工期：取決於診所、法律、資安與營運決策，不列入工程承諾。

| Gate | 決策 | 解除的工作 |
| --- | --- | --- |
| B | D-006、D-010 | cloud staging、staff login、IAM、backup/monitoring |
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

前置：D-006、D-010 approved。  
建議工期：2～3 個工程週。

工作：

1. 建立隔離的 staging project、Firestore、runtime、service accounts。
2. 建立 Terraform modules 與 remote state。
3. 啟用核准的 IdP，建立 staff test identities、MFA/session policy。
4. 完成 API auth/authz middleware 與 application services。
5. 路由 staff-only booking/transition/reschedule endpoints。
6. Web 的 role switch 改為登入；`stagingRequest` 換 `api-client`。
7. Rules 持續 deny direct client；API Admin SDK 以 IAM 存取。
8. 建立 audit query、correlation ID、API/Firestore metrics。
9. 建立 synthetic reset/seed 工具，限 staging operator。

驗收：

- 未登入 request 401；
- 無權限 action 403，不能只靠 UI；
- disabled account/session 立即失效；
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
- [ ] follow-up/schedule contracts（尚無 domain planner，需獨立設計 pass）
- [x] patient active-booking guard（2026-07-23 local/Emulator）
- [x] audit v2（2026-07-23 local/Emulator）
- [ ] schedule planner/version conflict
- [ ] case assignment effective periods
- [ ] payroll close/adjustment

### API / Security

- [x] auth context（2026-07-23 Stage 0 interface；未接真 IdP）
- [ ] RBAC + resource-scope policy
- [x] application services（2026-07-23 unrouted create skeleton）
- [x] repository ports/adapters（2026-07-23 local/Emulator）
- [x] idempotency scope + request hash（2026-07-23 local/Emulator）
- [ ] rate limit/anti-automation
- [ ] maintenance gate
- [ ] safe error/correlation mapping

### Data / Privacy

- [ ] classification and field inventory
- [ ] policy versions/acceptances
- [ ] patient identifier protection
- [ ] retention/delete/anonymize/export
- [ ] DSR workflow
- [ ] backup deletion exception
- [ ] vendor/data-region record

### Worker / Integrations

- [ ] trigger/scheduler
- [ ] runtime jitter（Stage 0 full-jitter design 已固定）
- [x] correlation/causation（2026-07-23 local/Emulator）
- [x] metrics port（2026-07-23 local/Emulator）
- [ ] metrics backend/alerts
- [ ] reconciliation
- [ ] dead-letter operator permissions
- [ ] Calendar credential rotation

### Infrastructure / Operations

- [ ] environment modules
- [ ] service accounts/IAM
- [ ] Secret Manager
- [ ] Firestore indexes/backups/PITR
- [ ] monitoring/logging/budget
- [ ] deployment approval/rollback
- [ ] RTO/RPO and restore drill
- [ ] incident response

### Web / Quality

- [ ] API client adapter
- [ ] real loading/pending/error/retry states
- [ ] bundle/content hash/cache
- [ ] staff auth route protection
- [ ] Playwright E2E
- [ ] axe/screen-reader/forced-colors
- [ ] Lighthouse budgets
- [x] tracked-secret/high-critical dependency CI skeleton（2026-07-23）
- [ ] SAST/final dependency policy/standards-compliant SBOM gates

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

1. 把本規劃與目標架構交由 technical owner 確認。
2. 建立 D-006/D-010 決策會議，D-001～D-005/D-011 並行準備。
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
8. 建立 staging IaC plan，只做 plan/review，不 apply。
9. 建立 E2E/a11y/security CI skeleton。
10. 完成 Checkpoint A 後再決定 Stage 2 開始日期。

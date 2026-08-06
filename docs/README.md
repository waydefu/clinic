# Documentation Map

This file is the canonical index of every document in `docs/`. `README.md` and
`AGENTS.md` link here rather than keeping their own copies of the list, so a new
document only has to be registered in one place.

Adding a document means: create it, add it to the right section below, and add
it to `scripts/check-structure.mjs` if it must never be deleted.

How to distinguish current authority, dated evidence, drafts and superseded
material is defined in [Document lifecycle and evidence rules](document-lifecycle.md).

## 1. Start here

Read in this order before changing a boundary or enabling a capability.

| # | Document | Why |
| --- | --- | --- |
| 0 | [Document lifecycle and evidence rules](document-lifecycle.md) | How to tell current authority from dated evidence, plan-only material and superseded history |
| 1 | [Roadmap](roadmap.md) | Where the project actually stands, what can be built without any approval, and what is blocked |
| 2 | [Phase 1 execution plan](phase-1-execution-plan.md) | Current scope, permitted and prohibited work, exit criteria |
| 3 | [Phase 1 decision register](product/phase-1-decision-register.md) | Live status of all D-series decisions, including the separate D-014～D-016 expansion gates; nothing policy-dependent may be built ahead of them |
| 4 | [Current execution and approval plan](product/current-execution-and-approval-plan.md) | Plain-language current path across Stage 1 decisions, parallel technical debt, C0／C1～C6, Calendar, public／operations release, Production, Expansion S and BAU |
| 5 | [Production target architecture (2026-07-23)](architecture/production-target-architecture-2026-07-23.md) | The retained boundaries, required architecture changes and target data flows |
| 6 | [Production-readiness delivery plan (2026-07-23)](product/production-readiness-delivery-plan-2026-07-23.md) | The gated implementation sequence from the synthetic preview to production evidence |
| 7 | [Domain boundaries](architecture/domain-boundaries.md) | Which package owns which rule |
| 8 | [Enterprise readiness review (2026-07-23)](reviews/2026-07-23-enterprise-production-readiness-review.md) | The verified baseline, scores, findings and limitations before Stage 0 |
| 9 | [Enterprise project plan](enterprise-appointment-project-plan.md) | The whole programme background, data model, privacy and historical gap register |
| 10 | [Phase 1 approval gate](reviews/phase-1-approval-gate.md) | The single start/stop record |
| 11 | [產品定位與長期方向](product/product-vision.md) | Plan-only product positioning, the roles it serves, the twelve core capabilities with what blocks each, and the current boundary that none of it may be read as built |

## 2. Decisions and approval packets

Formal answers are recorded by the clinic, not inferred by implementers.

- [Phase 1 decision register](product/phase-1-decision-register.md) — the live status of every decision
- [Current execution and approval plan](product/current-execution-and-approval-plan.md) — the plain-language current path and consolidated approval checklist for all governance, technical, deployment, product, Production, Expansion and BAU work
- [2026-07-27 owner request batch](product/2026-07-27-owner-request-batch.md) — the 19 owner requests of 2026-07-27 turned into scoped items, the decisions already taken, the paper intake form they map onto, and a batched execution sheet
- [Full-project master plan (2026-07-31)](product/full-project-master-plan-2026-07-31.md) — the single technical-strategy and open-work baseline for all 39 owner questions, T／D／OR items, repository debt, the unfinished clinic-site acceptance／licensed-media batch, C1～C6, Calendar, public／operations release, Production, Expansion S and BAU, with WBS, milestones, owners, evidence, risks and authoritative controls
- [Full-project execution book (2026-07-31)](product/full-project-execution-book-2026-07-31.md) — the complete status board and step-by-step execution path for every master-plan work package, including decision intake, parallel technical hardening, request/plan/apply/verify/stabilize/handoff, product and Expansion slices, Go/No-Go, BAU cadence and reusable evidence／tracking templates
- [Consolidated owner-request index (2026-07-31)](product/owner-requests-consolidated-2026-07-31.md) — every owner request from the 2026-07-26～28 desktop notes numbered OR-01…OR-69 with its current state, the four contradictions still needing an owner answer, and the decision blocking each unbuilt item
- [Surgery, follow-up, payment and settlement expansion plan (2026-07-28)](product/2026-07-28-surgery-follow-up-expansion-plan.md) — plan-only normalization of the owner-provided surgery workflow into a separate Expansion S track, including Calendar inbound review, clinical/financial data boundaries and D-014～D-016
- [Stage 2 identity and cloud change plan (2026-07-28)](architecture/stage-2-identity-and-cloud-change-plan-2026-07-28.md) — plan-only translation of approved D-006/D-010 values into reviewable identity, MFA, session, revocation, delegation-code and isolated-staging slices
- [Phase 1 Chinese approval checklist](product/phase-1-chinese-approval-checklist.md) — D-001…D-006, D-011 in the clinic's working language
- [Stage B/C approval request](product/stage-b-c-approval-request.md) — D-006, D-010 and D-009 consolidated into one sheet; D-006/D-010 are approved, while change/deployment review still gates cloud staging and D-009 gates the Calendar projection
- [Appointment operations approval packet](product/phase-1-appointment-operations-approval-packet.md) — service catalogue, slots, cancellation and no-show policy
- [Case management and payroll approval packet](product/phase-1-case-management-payroll-approval-packet.md) — D-007, D-008 assignment and compensation basis
- [Integration and launch approval packet](product/phase-1-integration-launch-approval-packet.md) — D-009…D-011 Calendar, social channels and launch
- [Privacy approval packet](legal/phase-1-privacy-approval-packet.md) — D-001…D-003 privacy, retention and vendor record

## 3. Architecture and contracts

- [ADR-0001 — the domain API is the only write path](adr/0001-domain-api-is-the-only-write-path.md)
- [ADR-0002 — Calendar is a projection, not the lock](adr/0002-calendar-is-a-projection-not-the-lock.md)
- [ADR-0003 — direct Firestore client access is deny by default](adr/0003-firestore-direct-client-access-is-deny-by-default.md)
- [ADR-0004 — the browser and the server share one compiled domain, with no bundler](adr/0004-browser-and-server-share-one-compiled-domain.md)
- [ADR-0005 — patient intake/verification and appointment commands are separate](adr/0005-patient-intake-and-appointment-command-are-separate.md)
- [Domain boundaries](architecture/domain-boundaries.md) — package ownership and forbidden dependencies
- [角色權限矩陣 (RBAC matrix)](architecture/rbac-matrix.md) — plan-only convergence of the three incompatible role tables now in the repository, the target permission matrix, resource scopes, the six places every rule must be enforced, and the four questions the owner must answer first
- [Google Calendar 雙向同步規劃](architecture/calendar-bidirectional-sync-plan.md) — plan-only; blocked by D-009/D-016 and requires a new ADR to supersede ADR-0002. Data model, inbound review queue, syncToken/410 rebuild, webhook renewal, conflict handling and the minimum-field privacy rule
- [API v1 contract baseline](architecture/api-v1-contract.md) — navigation layer for the schemas in `packages/contracts`
- [Local Firestore baseline](architecture/firestore-local-baseline.md) — Emulator-only project and Rules baseline
- [Synthetic Web modular architecture](architecture/synthetic-web-modular-architecture.md) — browser module boundaries and how they are later replaced by the real API
- [Calendar and database integration plan](architecture/calendar-and-database-integration-plan.md) — staged route from the browser prototype to Firestore and a Calendar projection, and which decision blocks each stage
- [Calendar event ID and outbox key](architecture/calendar-event-id.md) — why the outbox key is base32hex, where it is generated, and what to check before changing it
- [Production target architecture (2026-07-23)](architecture/production-target-architecture-2026-07-23.md) — architecture verdict, required changes, target containers, data model, transactions and migration boundaries
- [Infrastructure and operations plan (2026-07-24)](architecture/infrastructure-and-operations-plan-2026-07-24.md) — plan-only environment split, Terraform layout, IAM, secrets, Firestore backup/PITR, monitoring, budget, deploy and rollback
- [Stage 2 C0 readiness artifacts (2026-07-29)](architecture/stage-2-c0-readiness-artifacts-2026-07-29.md) — proposal-ready／approval-pending logical resource manifest, Cloud IAM matrix, cost-input model, DR option analysis and test/rollback evidence template; no Terraform or cloud execution
- [Stage 2 machine-readable gate status](architecture/stage-2-gate-status.json) — canonical C0 review plus separate C1～C6 deployment-authority and execution/evidence status consumed by architecture checks
- [Worker runtime and reconciliation plan (2026-07-24)](architecture/worker-runtime-and-reconciliation-plan-2026-07-24.md) — plan-only trigger design, at-least-once semantics, Calendar reconciliation, dead-letter operator permissions and credential rotation

## 4. Building and testing

- [Phase 0 local development](phase-0-local-development.md) — what exists locally and how to verify it
- [Test-only sandbox baseline](product/test-only-sandbox-baseline.md) — the authority and limits of the synthetic-only profile
- [Test-only scheduling and follow-up workbench](product/test-only-scheduling-follow-up-workbench.md) — scope of the synthetic scheduling and follow-up surface
- [Front-desk follow-up and patient UX spec (2026-07-23)](product/front-desk-followup-and-patient-ux-spec-2026-07-23.md) — the authoritative requirement list for the follow-up queue transform, today filter, past-slot rule, cancellation contact popup and the nav bell
- [Test-only operations UI guide](design/test-only-operations-ui.md) — safety, accessibility and layout rules for the browser harness
- [Boutique Clinical Command (2026-07-25)](design/boutique-clinical-command-2026-07-25.md) — the approved visual direction, the six-stage sequence, what is done, and the rules a new implementer must follow
- [Clinic website and booking integration (2026-07-27)](design/clinic-site-integration-2026-07-27.md) — clinic/doctor/nasal-function route scope, visual bridge to `/booking`, medical-content boundary and implementation structure
- [介面規則書 (UI/UX rules)](design/ui-ux-rules.md) — **binding** rules on buttons versus links, clickable affordance, target size, label wrapping and when layouts may stack, each with its authority and the test that enforces it
- [App Shell 與日程工作區重構規劃](design/ui-shell-and-scheduling-redesign-plan.md) — plan-only P1/P2 design: the global shell, navigation grouping that keeps visit types as event filters rather than top-level items, the scheduling workspace, event-type versus status tokens, and the five-step reversible page migration
- [行動版 UX 規劃](design/mobile-ux-plan.md) — plan-only drawer navigation, day-list default, table-to-card rules, full-screen sheets and the six-viewport acceptance matrix
- [測試策略](architecture/test-strategy.md) — the ten test layers with what does and does not exist, the six E2E groups and how they differ from the eight-group target, role direct-URL tests, and why automated axe never replaces the manual pass
- [2026-08-06 UI visual baseline](reviews/ui-visual-baseline-2026-08-06.md) — **the current baseline**: ten reproducible desktop/mobile reference captures and their manifest, retaken after the clinic site joined the design system, plus the four places the capture date is hardcoded; reference evidence, not a cross-OS pixel gate
- [2026-07-28 UI visual baseline](reviews/ui-visual-baseline-2026-07-28.md) — superseded on 2026-08-06, retained as historical evidence; its Stage/gate statement is of that date and its clinic-site captures predate the type-scale convergence
- [Production-readiness delivery plan (2026-07-23)](product/production-readiness-delivery-plan-2026-07-23.md) — work packages, decision gates, suggested sequence, acceptance criteria and rescoring checkpoints
- [Web and supply-chain quality gates (2026-07-24)](architecture/web-quality-gates-2026-07-24.md) — which gate enforces what, the performance budget, the CycloneDX SBOM and licence policy, and the SAST layers
- [2026 web-standards audit and remediation (2026-07-26)](reviews/2026-07-26-web-standards-remediation-plan.md) — what the audit found, the two decisions it forced, all 19 fixes with their evidence, and the costs and limitations discovered while making them
- [Manual accessibility test runbook](runbooks/manual-accessibility-test.md) — the screen-reader, forced-colors, keyboard and zoom checks axe cannot make, with pass criteria and an evidence template

## 5. Operations

- [Public mirror sync runbook](runbooks/public-mirror-sync.md) — what the mirror actually is, the transform each file class needs, the patterns the public gate rejects outright, the default disposition table and the stop conditions; read this before touching the public repository
- [Synthetic online preview runbook](runbooks/synthetic-online-preview.md) — deploying and expiring the static Hosting preview
- [Calendar sync failure runbook](runbooks/calendar-sync-failure.md) — outbox retry, dead letter and manual recovery
- [Calendar go-live runbook](runbooks/calendar-go-live.md) — who does what to wire the real Google Calendar test integration (credentials stay with the owner)
- [Backup and restore runbook](runbooks/backup-and-restore.md) — what is protected, approved RTO/RPO targets whose capability remains unverified, the restore procedure and the quarterly drill requirement
- [Incident response runbook](runbooks/incident-response.md) — severity levels, roles, communication, the privacy-incident path and the postmortem template
- [Month close runbook](runbooks/month-close.md) — provisional list, review, approval and lock
- [Month close specification](payroll/month-close-spec.md) — countable credit definition and uniqueness rules

## 6. Privacy, security and legal

- [Taiwan privacy legal baseline](security/taiwan-privacy-legal-baseline.md) — statutory baseline for Phase 1 design
- [Data classification and field inventory (2026-07-29)](security/data-classification-and-field-inventory-2026-07-29.md) — plan-only inventory of fields already present in the synthetic browser and local Emulator, conservative handling tiers and the blank approval worksheet; no production field or real-data flow is approved
- [Privacy policy checklist](security/privacy-policy-checklist.md) — what a publishable policy must contain
- [Privacy policy draft](legal/privacy-policy-draft.md) — draft text, not published and not a recorded consent

## 7. Review record

Newest first. Each entry is dated evidence, not a plan.

| Date | Review | Result |
| --- | --- | --- |
| 2026-08-06 | [診所官網併回設計系統與 gate 涵蓋修補](reviews/2026-08-06-clinic-site-design-system-convergence.md) | 官網的 UI 偏離不是寫的人不照規則，是**五道 gate 都沒有宣告涵蓋它**：`check:tokens` 把 `clinic-site.css` 標為 `full: false`（九條規則只跑兩條）、`font-size: clamp()` 無條件放行（全專案缺口，`styles.css` 也有三處純 `vw` 字級）、`typography.spec.ts` 與 `mobile-layout.spec.ts` 都不掃 `/clinic`、44px 掃描的選擇器不含 `<summary>`。實測 `/clinic` 在 375px 有 32 處文字低於 14px、最小 9.92px（含手機唯一導覽入口與安全警語），而 `/booking` 與工作臺只有 5–6 種字級且全部落在尺度上。收斂後 1440px 的相異字級 20→6、低於 14px 者歸零。過程中修好一個更早的 gate 缺陷：`outsideRootBlocks` 用縮排猜 `:root` 結尾，遇到 `@media` 內的 `:root` 會吞掉 `clinic-site.css` 230 行／44 條規則與 `workbench.css` 114 行／27 條，**那些寫死值從來沒被檢查過而 gate 全綠**。另實測推翻既有文件「字體家族只有 Regular 與 Bold 兩檔」的說法：650／750 確為假階，但 500 與 800 是獨立字面。視覺基線已重拍為 [2026-08-06](reviews/ui-visual-baseline-2026-08-06.md)，行動裝置模擬驗收（四個設定檔 × 官網四路由 ＋ 預約四步驟）零真實缺陷；**人工無障礙與實體裝置驗收仍未跑，三個疑點待實機判定**，列在該紀錄的未處理事項 |
| 2026-08-06 | [UI 視覺基準](reviews/ui-visual-baseline-2026-08-06.md) | 官網併回設計系統後重拍的十張參考圖與 manifest，取代 2026-07-28 那批（保留為歷史證據）。差異集中在 `/clinic`：1280px 相異字級 20→6、375px 低於 14px 的文字 32 處→0、hero 標題 64→57.3px、卡片正文 14.4→16px。十個情境的 console error／warning 均為 0。同時記下擷取日期硬編碼在四個地方，以及 `capture:ui` 會就地覆寫目錄——這一輪實際踩過一次：忘了改日期直接跑，會把舊基線的圖換掉而 `captureDate` 不動，等於用固定時間冒充擷取時間 |
| 2026-08-06 | [企業級全面審查](reviews/2026-08-06-enterprise-audit.md) | 委託的全面審查。最重要的一項是可達性閘門本身可被繞過：`check:architecture` 以 regex 解析 import，一行計算式 `import(target)` 就能讓被宣告為「未接線」的檔案在執行期真的被載入而 gate 全綠，已實證後改為 fail closed。另修好從未在真行動裝置條件下測過的手機版（唯一 project 是 Desktop Chrome，五處 `@media (hover: hover)` 的無 hover 分支從未執行）、頁尾品牌圖在 320px 佔 62.5% 版面、手機首屏要捲 11 個畫面才看得到門診時間，以及把三方分歧的角色定義在伺服器端收斂到單一來源。法規定性經 21 份來源查證後判定：本系統目前處理的是掛號預約這類行政管理資訊，非醫療法 §67 定義的病歷，故電子病歷辦法**現階段不適用**——**但 Expansion S 一旦記錄臨床內容即適用，屆時境內儲存要求會直接約束 Firebase 區域，必須在 D-014 核准前先決定**。個資法適用，惟 2025-11-11 公布的修正條文施行日期行政院仍未公告，現行義務以修正前條文為準 |
| 2026-08-04 | [E2E split, product roadmap and supply-chain patch](reviews/2026-08-04-e2e-split-roadmap-and-advisory-delivery.md) | The single E2E job split into six named groups behind a drift guard that fails when a spec belongs to no group, with the same 191 tests and the slowest group at 3m27s against the previous 8m50s; the P0～P7 product roadmap recorded on an axis separate from Stage 0～6, with only two of eight phases unblocked; and four high advisories patched after `fast-uri` turned out to be vulnerable in two majors at once and three more dev-chain advisories surfaced that `audit:prod` failing first had been hiding. Three defects found on the way — three incompatible role tables with no physician or consultant despite D-006 approving one, a quality-gates document describing a removed audit exception as current, and the silent-coverage-loss risk the split itself introduces. Not merged at the time of writing |
| 2026-08-02 | [Clinic homepage motion and asset compression](reviews/2026-08-02-clinic-motion-and-assets.md) | Ten more homepage motion effects added under a no-WebGL, no-library budget; the twelve clinic images cut from 2210 KiB to 129 KiB with a Playwright-based WebP generator and a source/SHA-256 manifest; three defects found on the way — a per-character heading split that made screen readers spell out the `<h1>`, a performance budget blind to images referenced only from JavaScript strings (1.7 MB invisible and green), and a brand-logo aspect-ratio mismatch that shifted layout on every visit; image licensing for C2 remains unconfirmed |
| 2026-08-01 | [TW-01…TW-05 gate coverage and test performance](reviews/2026-08-01-gate-coverage-tw-01-05.md) | The last two untested blocking checks carved into testable modules and covered, the public-page gate tested against the real configuration rather than fixtures, the unit suite taken from 53.5s to 16s by removing an unexplained `maxWorkers: 1`, and the machine-verifiable half of the manual accessibility runbook automated; two real defects found, and the screen-reader work is recorded as impossible to automate rather than as done |
| 2026-08-01 | [Gate-script test coverage and stage 0 wrap-up](reviews/2026-08-01-gate-script-test-coverage.md) | Nine blocking checks under `scripts/` given tests (five refactored into pure functions first), every gate test registered in the structure check, and two pre-existing gaps closed; the public-mirror sync was stopped because Gitleaks and TruffleHog are not installed, and two scripts remain uncovered |
| 2026-08-01 | [SAST migration, audit-exception governance and dependency patch delivery](reviews/2026-08-01-sast-migration-and-audit-governance-delivery.md) | Execution-book steps 0-1…0-5 delivered and merged as `f653535`; the CodeQL gate replaced by a commit-bound Semgrep scan, three moderate advisories closed, audit exceptions given named approvals and expiries, four defects found and fixed, and the `brace-expansion` advisory revision that invalidated SEC-03's premise recorded with a proposed remedy |
| 2026-07-30 | [Private repository Dependabot alert enablement](reviews/2026-07-30-private-dependabot-alert-enablement.md) | Dependency graph and Dependabot alerts enabled for `waydefu/clinic`; four initial development-scope alerts recorded, while automatic dependency submission and all automatic update modes remain disabled |
| 2026-07-29 | [Sanitized public mirror publication](reviews/2026-07-29-sanitized-public-mirror-publication.md) | Private canonical repository retained; independent allowlisted code-only mirror published from clean history after secret, personal-data, internal-information, Git-history, dependency, test and fresh-clone gates |
| 2026-07-29 | [Local hardening and CI handoff](reviews/2026-07-29-local-hardening-and-ci-handoff.md) | Commit, PR, preview and local validation evidence; the initial CI failures and later repo-owned repairs are annotated, private CodeQL upload remains capability-blocked, and production remains blocked |
| 2026-07-28 | [Markdown currency audit](reviews/2026-07-28-markdown-currency-audit.md) | All pre-existing Markdown files scanned by lifecycle and stale-status terms; current authority reconciled for Stage 1, D-004 slot/multi-service gaps, approved D-006 identity/security, D-010 RTO/RPO, privacy scope and historical-evidence annotations |
| 2026-07-28 | [Current UI visual baseline and progress](reviews/ui-visual-baseline-2026-07-28.md) | Stage 0/Checkpoint A and the current Stage 1 gate rechecked; ten reproducible desktop/mobile reference captures with fixed synthetic state, environment metadata, clean console and SHA-256 manifest |
| 2026-07-27 | [Owner request batch 1–5 delivery](reviews/2026-07-27-owner-request-batch-delivery.md) | Seventeen of the nineteen owner requests delivered in five separate commits; verify green at 548 unit tests, 152 browser tests and 452/452 online-preview checks; six real defects found and fixed along the way, and what was deliberately left out |
| 2026-07-27 | [Automated-check gaps and remediation](reviews/2026-07-27-automated-check-gaps.md) | Six gaps in the gates themselves — shipped HTML comments, three unscanned stylesheets, JS-injected inputs outside the allowlist, five copies of the public-page list, budget changes with no recorded reason, and missing field-level translation coverage — each written down before being fixed |
| 2026-07-27 | [Clinic website integration delivery](reviews/2026-07-27-clinic-site-integration-delivery.md) | Clinic, doctor and nasal-function pages integrated with `/booking`; repository, browser and 439-check online-preview evidence passed on the expiring `synthetic-review` channel |
| 2026-07-27 | [Booking-page SEO baseline](reviews/2026-07-27-seo-baseline.md) | What search engines can see today, the release switch that stops a forgotten `noindex` from hiding the site, and the honest list of what is not done |
| 2026-07-26 | [Full-project audit and follow-up](reviews/2026-07-26-full-project-audit.md) | Whole-repo audit: no P0/P1 defect; exposure and compliance findings raised, three fixed; D-012 later recorded informed preview-scope NHI-mark retention and D-013 recorded required checks with administrator bypass, while formal-domain logo review and the actual GitHub protection setting remain unverified |
| 2026-07-26 | [Local operations and logical-restore rehearsal](reviews/2026-07-26-local-operations-rehearsal.md) | Emulator V1–V5 and Calendar companion V6 passed; cloud backup/PITR, IAM, alerts, contacts and RTO/RPO remain explicitly unverified |
| 2026-07-26 | [2026 web-standards audit and remediation](reviews/2026-07-26-web-standards-remediation-plan.md) | 2026 standards sweep and 19 UI/UX remediations completed; limitations and decision boundaries retained |
| 2026-07-24 | [Stage 0 Checkpoint A architecture review](reviews/stage-0-checkpoint-a-2026-07-24.md) | Stage 0 architecture hardening passed; this is not a production rating and all D-001～D-011 gates remain pending |
| 2026-07-23 | [Enterprise production-readiness review](reviews/2026-07-23-enterprise-production-readiness-review.md) | Core architecture retained; production blocked pending Stage 0 hardening, D-001～D-011, auth/API, privacy, audit, IaC and release evidence |
| 2026-07-23 | [Calendar-sync runbook rehearsal](reviews/calendar-sync-runbook-rehearsal-2026-07-23.md) | Failure → dead-letter → recovery rehearsed as an Emulator test; added `OutboxProcessor.requeue`; all four calendar prerequisites done |
| 2026-07-22 | [Workbench tabs and calendar projection](reviews/workbench-tabs-and-calendar-projection-2026-07-22.md) | Tabbed workbench, in-place note editing, inline case assignment, calendar event ID bound to the appointment, patient/clinic calendar split |
| 2026-07-22 | [UI theme, dialog and flow review](reviews/ui-theme-dialog-and-flow-review-2026-07-22.md) | Opaque nav, custom confirm dialog, patient back-flow, auto/light/warm/dark themes with AA contrast, standards sweep; calendar-test prerequisites documented |
| 2026-07-22 | [UI feedback review and remediation](reviews/ui-feedback-review-and-remediation-2026-07-22.md) | Action feedback made visible at the point of action; booking failures now state the reason; duplicate-account and stale-reschedule guards added |
| 2026-07-21 | [UI/UX audit and rework](reviews/ui-ux-audit-and-rework-2026-07-21.md) | Type scale 17→6, dead styles removed, shell inlined, SEO and calendar export added |
| 2026-07-21 | [Cleanup, security and UX review](reviews/cleanup-and-ux-review-2026-07-21.md) | Dead exports removed, XSS verified in a browser, slot picker and form validation reworked against published guidance |
| 2026-07-21 | [Codebase analysis and remediation](reviews/codebase-analysis-and-remediation-2026-07-21.md) | Version control established; loopback, permission, CSP and formatting gaps closed |
| 2026-07-21 | [Manager workflow analysis and remediation](reviews/manager-workflow-analysis-and-remediation-2026-07-21.md) | Workbench reordered into a daily operating sequence |
| 2026-07-21 | [Synthetic online preview checkpoint](reviews/phase-1-synthetic-online-preview-checkpoint-2026-07-21.md) | Expiring static Hosting preview authorised and verified |
| 2026-07-20 | [Synthetic case-manager workload checkpoint](reviews/phase-1-synthetic-case-workload-checkpoint-2026-07-20.md) | Non-monetary workload aggregation verified |
| 2026-07-20 | [Test-only checkpoint](reviews/phase-1-test-only-checkpoint-2026-07-20.md) | Local booking, idempotency, audit/outbox and deny-by-default verified |
| 2026-07-20 | [Phase 1 entry checkpoint](reviews/phase-1-entry-checkpoint-2026-07-20.md) | Phase 0 complete; Phase 1 entered in local-only mode |
| 2026-07-20 | [Implementation readiness review](reviews/2026-07-20-implementation-readiness-review.md) | Blocking items identified before any implementation |

## Superseded

Kept for history. Do not use as a basis for work.

- [Open product decisions](product/open-decisions.md) — superseded for active tracking by the [decision register](product/phase-1-decision-register.md)
- [Zero-cost proposal](archive/clinic-zerocost-proposal.md) — the Firebase Spark / Vercel Hobby / Apps Script proposal, superseded by the enterprise project plan. Kept verbatim for history; its data handling does not meet the current privacy baseline.

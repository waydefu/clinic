# Phase 1 Approval Gate

> **更正與分層說明（E3-12／E4-02，2026-11-25 附註；僅新增，下方 2026-08-11 原文與表格逐字保留）：**
> 本檔仍是 `document-lifecycle.md` 指定的路徑例外（現行 gate 檔），但**下方的文字、Decision
> dashboard 與 Expansion S dashboard 是 2026-08-11 的盤點快照**，不是即時狀態；其中
> 「未實作」「未授權」這類單一概括已被較新的 Canon 分層取代。各項 D-series 的現況只以
> [決策登錄](../product/phase-1-decision-register.md) 為準；安全邊界只以
> [AGENTS.md Safety Floor](../../AGENTS.md) 為準；`docs/state/current.md` 是生成投影，不是 Canon。
>
> **逐能力分四層**（決策、實作、同版本證據、部署授權互相獨立，一層不代表另一層；
> 本表只轉述 AGENTS.md 與登錄的既有文字，不判斷目前實際狀態，動態狀態未讀取者為 `UNVERIFIED`）：
>
> | 能力 | 決策（Decision） | 實作（Implementation） | 同版本證據（Same-revision evidence） | 部署授權（Deploy authority） |
> | --- | --- | --- | --- | --- |
> | 公開 production `/v1/bookings` 與 go-live | 登錄 IP-001 把 internal test 與 public production 分開；go-live 仍為禁用 | 不得在 `AppModule` 無閘門匯入 `AppointmentController`／`BookPilotModule` | 以該 exact commit 的 CI 與日期證據為準，不沿用舊 PASS | 無；需另行取得 production 部署授權 |
> | 內部測試預約（IP-001 `INTERNAL_TEST_ROUTE_AUTHORIZED`） | 登錄已記錄 | 只可經 `InternalTestBookingModule`，fail-closed（開關＋UTC 到期＋隔離專案或模擬器） | 該 commit 的 CI；C1 窗口讀回是日期證據 | 僅隔離專案 `beauessence-clinic-stg-c1a01` 或 Firestore 模擬器 |
> | D-006 身分／D-010 雲端目標 | 登錄記錄為已核准（目標值） | 與核准分開；需 Stage 2 change plan | 需逐 commit／環境驗證 | 核准不等於 production 部署授權 |
> | Calendar | CAL-PILOT 僅合成範圍；production 投影待 production D-009、回寫待 D-016 | CAL-PILOT 的合成日曆可完成技術同步 | 以 exact commit 與日期證據為準 | production 診所日曆維持封鎖 |
> | Hosting preview | 登錄與 AGENTS.md 規定每次需新授權 | 靜態檔、到期頻道 `synthetic-review` | exact SHA 的 `verify:preview` 等日期證據 | 每次需 exact commit、專案、頻道與到期；不可升為 live |
> | D-001～D-005、D-007／D-014／D-015、D-011 | D-001～D-005 維持 `pending`（IP-001 僅允許內部暫行實作）；D-007／D-014／D-015 為 `DEFERRED_OUTSIDE_CURRENT_PHASE1_DELIVERY`；D-011 為 `GO_LIVE_DEFERRED` | 依該決策是否核准而定，不得以程式預設值取代 | 同上 | 無 |
>
> **Dashboard 與 canonical scope 對照（E4-02）：** 下方兩張 dashboard 列的是 2026-08 的 D-001～D-011
> 與 D-014～D-016，現行對應來源為：Phase 1 D-series 狀態 → 決策登錄；安全底線 → AGENTS.md；
> internal test 與 public production 分界 → 登錄 IP-001 與 AGENTS.md「Remain disabled」；
> 路線與執行順序 → [roadmap](../roadmap.md) 與 [phase-1-execution-plan](../phase-1-execution-plan.md)；
> 近期收斂紀錄 → [2026-11-25 SOL-INTEGRATION 讀回](2026-11-25-sol-integration-readback.md)。
> 本檔仍保留為 live gate 例外，未移動、未改 lifecycle／索引／gate 測試，也未更動任何 D-series 狀態。

**Current status (2026-08-11 read-only reconciliation):** Stage 0／Checkpoint A is complete and the
project is in Stage 1 owner decisions. D-010 target architecture/SLO is now
approved; D-004 has recorded hours/multi-service direction but remains pending,
D-006 identity/security is approved but unimplemented, and Stage 2 now awaits a
reviewed change plan plus deployment authority. D-012 and D-013 have separate
scoped approvals recorded in the decision register. D-014～D-016 gate a
separate Expansion S and do not change the current Phase 1 sequence. This
document is the single
start/stop dashboard for Phase 1 and does not replace that dated approval
record. The latest modernization audit added P0 correctness and gate-truthfulness
work without changing Stage or granting authority. See the
[test-only checkpoint](phase-1-test-only-checkpoint-2026-07-20.md) for the
original evidence and the
[current UI baseline](ui-visual-baseline-2026-08-10.md) for dated synthetic UI
evidence and the
[2026-08-11 audit](2026-08-11-enterprise-modernization-audit.md) for current
limits and Roadmap IDs. The last recorded preview expiry was 2026-08-04;
current remote availability is `UNVERIFIED`.

## Non-negotiable state

- Do not collect, import, copy or test with real patient, calendar, payroll,
  social-message or NAS data.
- Do not create a cloud Firebase project, deploy infrastructure, connect
  Calendar, or enable a public booking write route.
- A `pending` decision blocks every capability named in its “unlocks” column.
  Do not work around a pending business decision with a source-code default.
- The documented [synthetic test-only profile](../product/test-only-sandbox-baseline.md)
  and a freshly recorded per-deploy preview authorization are the narrow
  exceptions. The 2026-07 preview authority is expired and not reusable. A new
  approval may permit browser-local synthetic state in an exact-commit,
  expiring `noindex` static channel. It never permits real data, a booking API,
  cloud backend, production configuration or external operational effect.

## Decision dashboard

| Gate | Decision | Owner | Approval packet | Unlocks after approval |
| --- | --- | --- | --- | --- |
| Privacy | D-001 controller, contact, rights process | Clinic + privacy/legal | [Privacy packet](../legal/phase-1-privacy-approval-packet.md#d-001--controller-contact-and-rights-requests) | Publishable controller/contact wording and rights workflow |
| Privacy | D-002 retention, deletion, vendors/regions | Privacy/legal + operations | [Privacy packet](../legal/phase-1-privacy-approval-packet.md#d-002--retention-deletion-and-vendors) | Approved data lifecycle and processor review |
| Privacy | D-003 final policy/version/publication | Clinic + privacy/legal | [Privacy packet](../legal/phase-1-privacy-approval-packet.md#d-003--published-policy-and-acceptance-record) | Versioned policy-acceptance contract design |
| Booking | D-004 services, resources, slots | Operations | [Operations packet](../product/phase-1-appointment-operations-approval-packet.md#d-004--服務資源與可預約時段) | Availability model and reservation transaction tests |
| Booking | D-005 cancellation/no-show/fees | Operations + legal | [Operations packet](../product/phase-1-appointment-operations-approval-packet.md#d-005--取消爽約與例外處理) | Cancellation path and rule-version tests |
| Access | D-006 identity, staff roles, completion/audit — **approved 2026-07-28** | Clinic + security | [Operations packet](../product/phase-1-appointment-operations-approval-packet.md#d-006--身分角色與到診完成權限) | Reviewed Stage 2 identity/session implementation; approval alone creates no route |
| Case/payroll | D-007 assignment/reassignment | Case-management + operations | [Case/payroll packet](../product/phase-1-case-management-payroll-approval-packet.md#d-007--個案建立指派與改派) | Assignment/reassignment state model |
| Case/payroll | D-008 payroll metric/month close | Finance + case-management | [Case/payroll packet](../product/phase-1-case-management-payroll-approval-packet.md#d-008--計薪案件月結與調整) | Credit, monthly lock and adjustment tests |
| Integration | D-009 Calendar ownership/scopes/projection | Clinic + security | [Integration packet](../product/phase-1-integration-launch-approval-packet.md#d-009--google-calendar-整合準備) | Calendar integration review only; no production connection |
| Cloud | D-010 environments/IAM/backups/monitoring — **target approved 2026-07-28** | Technical + security | [Integration packet](../product/phase-1-integration-launch-approval-packet.md#d-010--firebase環境與維運責任) | Reviewed infrastructure/change plan; no deployment from target approval alone |
| Public UX | D-011 URL/accessibility/manual fallback | Operations | [Integration packet](../product/phase-1-integration-launch-approval-packet.md#d-011--公開預約網站與人工備援) | Public UX specification and fallback design |

## Expansion S dashboard

The
[surgery, follow-up, payment and settlement expansion plan](../product/2026-07-28-surgery-follow-up-expansion-plan.md)
is plan-only and does not enlarge the Phase 1 release automatically.

| Gate | Decision | Owner | Unlocks after approval |
| --- | --- | --- | --- |
| Clinical | D-014 surgical/clinical record boundary | Medical + privacy/legal | Surgery, anesthesia and clinical follow-up persistence |
| Finance | D-015 payment/refund/accounting ledger | Finance/accounting + clinic | Persisted patient money and settlement source transactions |
| Calendar inbound | D-016 matching/review/conflict/delete semantics — workbench synchronization direction recorded | Clinic + security + operations | Calendar-to-system change candidates and review flow; D-016 remains pending |

## Approval sequence

```text
D-001, D-002, D-003 ─┐
D-004, D-005, D-006 ─┼─> policy-backed contract/authorization design
                      │
D-007, D-008 ─────────┼─> local-only case/payroll tests
                      │
D-009, D-010, D-011 ──┴─> integration/launch review (never direct deployment)

D-014, D-015, D-016 ─────> separate Expansion S only
```

Stage 0 has dated synthetic appointment write-path evidence, but the 2026-08-11
audit found untested slot-release/rebooking, cyclical occurrence-ID and stale
worker-settle cases (`DATA-R01/02`, `ARC-R01`). Do not describe the write path
as fully verified until those regressions pass. D-006 policy values are
approved, while D-001 through D-005 remain required before their corresponding
production contract, intake and cancellation values can be treated as
approved. D-006 still requires implementation and verification before it is a
security boundary.
Case/payroll tests additionally require D-007 and D-008. Cloud or Calendar work
needs the relevant integration decisions **and** a separately approved change
plan; it is never unlocked merely by completing this document.

## Evidence required for an approved decision

For every row, the decision register must include:

1. The concrete answer—not a link to an unfilled template.
2. The accountable owner and approval date in `Asia/Taipei`.
3. A durable evidence or policy reference.
4. A follow-up implementation issue when a code, contract, runbook or test
   change is required.
5. A superseding record when the policy later changes; prior approvals must
   remain auditable.
6. Four separate states: policy approval, implementation, same-commit/environment
   verification, and deployment/real-data authority. One never implies another.
7. Dynamic evidence metadata: as-of date, commit/environment, coverage, owner,
   artifact/URL and expiry or next review. Unread remote state is `UNVERIFIED`.

## Required verification after each approval group

| Approval group | Minimum local verification before its capability is considered designed |
| --- | --- |
| D-001 to D-003 | Policy-version acceptance schema, rights-request workflow and retention/vendor record review using synthetic IDs only |
| D-004 to D-006 | Reservation success/conflict, cancellation cutoff, idempotency, unauthorized role and direct-Firestore-denial Emulator tests |
| D-007 to D-008 | Assignment/reassignment audit, one-credit uniqueness, Taipei monthly cutoff, lock and adjustment tests |
| D-009 to D-011 | Calendar outbox/idempotency and failure-runbook drills; infrastructure review, rollback plan and accessibility review |
| D-014 to D-016 | Clinical correction/retention and field-scope tests; immutable payment/refund/settlement ledger tests; Calendar inbound renewal/410/review/conflict rehearsal |

## Source of truth and next action

The source of truth for status is
[`../product/phase-1-decision-register.md`](../product/phase-1-decision-register.md).
When the clinic approves a decision, update that register first, then make only
the corresponding implementation change and tests. D-006/D-010 approvals are
recorded; the next step is review of the plan-only
[Stage 2 identity/cloud change plan](../architecture/stage-2-identity-and-cloud-change-plan-2026-07-28.md),
followed by a separate deployment decision. D-009 then gates Stage 3 Calendar
projection. Before those gates, the only permitted operational path is the explicitly documented
synthetic-only local profile. A static preview additionally needs fresh
per-deploy authority; neither path may infer or set a clinic answer. Expansion S remains plan-only until its existing and new
decisions are separately approved.

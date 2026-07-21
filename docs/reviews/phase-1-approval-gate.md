# Phase 1 Approval Gate

**Current status:** The synthetic test-only checkpoint is verified; no formal
clinic decision is approved yet. This document is the single start/stop
dashboard for Phase 1. It does not replace the dated approval record in the
decision register. See the [test-only checkpoint](phase-1-test-only-checkpoint-2026-07-20.md)
for evidence and limitations.

## Non-negotiable state

- Do not collect, import, copy or test with real patient, calendar, payroll,
  social-message or NAS data.
- Do not create a cloud Firebase project, deploy infrastructure, connect
  Calendar, or enable a public booking write route.
- A `pending` decision blocks every capability named in its “unlocks” column.
  Do not work around a pending business decision with a source-code default.
- The documented [synthetic test-only profile](../product/test-only-sandbox-baseline.md)
  is the narrow exception: it permits pure in-memory tests and a double-gated
  loopback browser harness with opaque IDs, never a public route, production
  configuration or external effect.

## Decision dashboard

| Gate | Decision | Owner | Approval packet | Unlocks after approval |
| --- | --- | --- | --- | --- |
| Privacy | D-001 controller, contact, rights process | Clinic + privacy/legal | [Privacy packet](../legal/phase-1-privacy-approval-packet.md#d-001--controller-contact-and-rights-requests) | Publishable controller/contact wording and rights workflow |
| Privacy | D-002 retention, deletion, vendors/regions | Privacy/legal + operations | [Privacy packet](../legal/phase-1-privacy-approval-packet.md#d-002--retention-deletion-and-vendors) | Approved data lifecycle and processor review |
| Privacy | D-003 final policy/version/publication | Clinic + privacy/legal | [Privacy packet](../legal/phase-1-privacy-approval-packet.md#d-003--published-policy-and-acceptance-record) | Versioned policy-acceptance contract design |
| Booking | D-004 services, resources, slots | Operations | [Operations packet](../product/phase-1-appointment-operations-approval-packet.md#d-004--服務資源與可預約時段) | Availability model and reservation transaction tests |
| Booking | D-005 cancellation/no-show/fees | Operations + legal | [Operations packet](../product/phase-1-appointment-operations-approval-packet.md#d-005--取消爽約與例外處理) | Cancellation path and rule-version tests |
| Access | D-006 identity, staff roles, completion/audit | Clinic + security | [Operations packet](../product/phase-1-appointment-operations-approval-packet.md#d-006--身分角色與到診完成權限) | Authenticated API guards and completion authorization tests |
| Case/payroll | D-007 assignment/reassignment | Case-management + operations | [Case/payroll packet](../product/phase-1-case-management-payroll-approval-packet.md#d-007--個案建立指派與改派) | Assignment/reassignment state model |
| Case/payroll | D-008 payroll metric/month close | Finance + case-management | [Case/payroll packet](../product/phase-1-case-management-payroll-approval-packet.md#d-008--計薪案件月結與調整) | Credit, monthly lock and adjustment tests |
| Integration | D-009 Calendar ownership/scopes/projection | Clinic + security | [Integration packet](../product/phase-1-integration-launch-approval-packet.md#d-009--google-calendar-整合準備) | Calendar integration review only; no production connection |
| Cloud | D-010 environments/IAM/backups/monitoring | Technical + security | [Integration packet](../product/phase-1-integration-launch-approval-packet.md#d-010--firebase環境與維運責任) | Reviewed infrastructure plan; no deployment without change approval |
| Public UX | D-011 URL/accessibility/manual fallback | Operations | [Integration packet](../product/phase-1-integration-launch-approval-packet.md#d-011--公開預約網站與人工備援) | Public UX specification and fallback design |

## Approval sequence

```text
D-001, D-002, D-003 ─┐
D-004, D-005, D-006 ─┼─> local-only booking transaction + authorization tests
                      │
D-007, D-008 ─────────┼─> local-only case/payroll tests
                      │
D-009, D-010, D-011 ──┴─> integration/launch review (never direct deployment)
```

The first policy-backed local-only appointment write-path test requires D-001
through D-006. The explicit synthetic-only profile may test a pure in-memory
model before that, but it does not establish policy-backed behaviour.
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

## Required verification after each approval group

| Approval group | Minimum local verification before its capability is considered designed |
| --- | --- |
| D-001 to D-003 | Policy-version acceptance schema, rights-request workflow and retention/vendor record review using synthetic IDs only |
| D-004 to D-006 | Reservation success/conflict, cancellation cutoff, idempotency, unauthorized role and direct-Firestore-denial Emulator tests |
| D-007 to D-008 | Assignment/reassignment audit, one-credit uniqueness, Taipei monthly cutoff, lock and adjustment tests |
| D-009 to D-011 | Calendar outbox/idempotency and failure-runbook drills; infrastructure review, rollback plan and accessibility review |

## Source of truth and next action

The source of truth for status is
[`../product/phase-1-decision-register.md`](../product/phase-1-decision-register.md).
When the clinic approves a decision, update that register first, then make only
the corresponding local-only implementation change and tests. Before approval,
the only permitted code path is the explicitly documented synthetic-only
profile; it must not infer or set a clinic answer.

# API v1 Contract Baseline

Status: Phase 0 baseline.  This file is the human navigation layer for the
executable schemas in `packages/contracts`.

## Boundary

- All public endpoints are under `/v1`.
- `apps/api` is the only writer for appointments, availability, cases, payroll
  credits, policy acceptances and audit records.
- Browser, future mobile apps, social channels and NAS integrations must not
  read or write Firestore directly.
- Every future write endpoint requires authentication, role authorization,
  schema validation, idempotency handling and an audit event before it is
  declared ready.

## Phase 0 endpoint

| Method | Path | Contract | Purpose |
| --- | --- | --- | --- |
| `GET` | `/v1/health` | `HealthResponseSchema` | Deployment and local-runtime liveness only; it exposes no patient data. |

## Reserved booking contracts

The following schemas exist in `@beauessence/contracts` but are **not exposed
by a route yet**:

| Future endpoint | Request | Response | Guardrails |
| --- | --- | --- | --- |
| `POST /v1/appointments` | `CreateAppointmentRequestSchema` | `CreateAppointmentResponseSchema` | Verified patient identity from server context, transaction-based slot reservation, idempotency and audit. |
| `POST /v1/appointments/{id}/cancellations` | `CancelAppointmentRequestSchema` | `CancelAppointmentResponseSchema` | Cancellation rule must be resolved server-side; no free-text reason is collected. |
| `POST /v1/appointments/{id}/transitions` | `TransitionAppointmentRequestSchema` | `TransitionAppointmentResponseSchema` | Staff-only `confirm_cancellation`/`complete`/`no_show`; body carries only the key and action, and `STAFF_TRANSITION_TO_DOMAIN` maps each to the domain transition that `planTransition` authorizes. |
| `POST /v1/appointments/{id}/reschedules` | `RescheduleAppointmentRequestSchema` | `RescheduleAppointmentResponseSchema` | Server resolves capacity, cancellation window and role; the appointment stays confirmed and the server returns authoritative start/end. |
| `POST /v1/appointments/{id}/deletions` | `DeleteAppointmentRequestSchema` | `DeleteAppointmentResponseSchema` | Administrator-only record hygiene, not a lifecycle step: `planDeletion` releases the slot and patient booking guard and cancels the Calendar event. The reason comes from a closed list and is mandatory because the audit event outlives the record. Patient-initiated erasure is **not** this endpoint; it is a data-rights workflow gated on D-002. |

`CreateAppointmentRequestSchema` is an appointment command only:
`idempotencyKey`, `slotId`, `serviceId` and `bookingKind`. It deliberately
omits the patient profile, email, actor, role, patient ID, client timestamp,
policy version, medical notes, diagnosis, uploaded images, social-message
transcripts and arbitrary free text.

Patient intake and verification remain a separate decision-gated boundary.
The application service accepts only a server-produced authentication context
and maps its verified opaque patient ID and actor ID, plus a server-generated
appointment ID and UTC timestamp, into the domain `BookingRequest`. D-001
through D-006 must be approved before a real intake/authentication adapter or
booking route is enabled.

The Stage 0 application service, authorization policy and repository port are
present under `apps/api/src/appointments`, but they are intentionally not
registered in `AppModule`; `/v1/health` remains the only route.

The application boundary also creates a server-owned audit context containing
the authenticated actor ID and opaque role, correlation ID and source. None is
accepted from the appointment command. Reason code and policy version remain
explicitly `null` until their decision owners approve real values.

## Stage 0 command / response inventory

Inventory means the boundary, owner and decision dependency are explicit. It
does **not** mean every row has an executable schema or an enabled route.
Only health is routed; create/cancellation schemas remain reserved.

| Capability / command | Executable contract | Domain / application mapping | Current state and decision gate |
| --- | --- | --- | --- |
| Health query | `HealthResponseSchema` | `HealthController` | Routed; no patient data |
| Patient intake / identity verification | None | Future protected patient application service | Boundary fixed by ADR-0005; fields, verification and matching remain TBD pending D-001～D-003, D-006, D-011 |
| Create appointment | `CreateAppointmentRequestSchema` / `CreateAppointmentResponseSchema` | `AppointmentApplicationService.create` → `BookingRequest` | Unrouted Stage 0 executable mapping; D-001～D-006, D-010, D-011 |
| Request cancellation | Provisional `CancelAppointmentRequestSchema` / `CancelAppointmentResponseSchema` | Future application mapping → `TransitionRequest(request_cancellation)` | Unrouted; exact cutoff and patient verification pending D-005/D-006 |
| Confirm cancellation | `TransitionAppointmentRequestSchema` (`confirm_cancellation`) / `TransitionAppointmentResponseSchema` | Future staff application mapping → `TransitionRequest(cancel)` via `STAFF_TRANSITION_TO_DOMAIN` | Unrouted Stage 0 schema; route/authorization pending D-005/D-006 |
| Complete / no-show | `TransitionAppointmentRequestSchema` (`complete`/`no_show`) / `TransitionAppointmentResponseSchema` | Future staff application mapping → `TransitionRequest(complete/no_show)` | Unrouted Stage 0 schema; route/authorization pending D-004/D-006 |
| Reschedule | `RescheduleAppointmentRequestSchema` / `RescheduleAppointmentResponseSchema` | Future application mapping → `RescheduleRequest` | Unrouted Stage 0 schema; capacity/cancellation/roles pending D-004～D-006 |
| Delete appointment record | `DeleteAppointmentRequestSchema` / `DeleteAppointmentResponseSchema` | Future staff application mapping → `DeleteAppointmentRequest` → `planDeletion` | Unrouted Stage 0 schema; administrator-only per the 2026-07-24 owner direction, but the role matrix and retention answer stay pending D-006/D-002 |
| Appointment note update | None | Browser-only synthetic behavior; protected application/domain command required | Inventory only; data classification, fields and roles pending D-001～D-003/D-006 |
| Follow-up decision | None | Browser-only synthetic behavior; follow-up domain contract required | Inventory only; D-004/D-006/D-007 |
| Schedule draft / publish / rollback | None | Browser-only synthetic behavior; versioned schedule planner required | Inventory only; D-004/D-006/D-010 |
| Case assignment / reassignment | None | Existing workload domain is not a persistence contract | Inventory only; D-006/D-007 |
| Payroll close / adjustment | None | Existing deterministic credit rule is not a close API | Inventory only; D-006～D-008 |

No controller may infer a missing schema from the browser implementation. A
row moves from “inventory only” to executable only when its decision
dependency is approved, strict request/response schemas exist, the domain
invariant and application mapping are tested, and its authorization,
idempotency, audit and error behavior are defined.

## Audit v2

`AuditEventV2Schema` is an internal persistence/evidence contract rather than
an exposed API response. It requires:

```text
eventId, occurredAt, actorId, actorRole, action,
resourceType, resourceId, before, after, reasonCode,
result, correlationId, source, policyVersion, schemaVersion
```

For appointment events, `before` and `after` contain only `status` and
`slotId`. The strict schema rejects patient/contact fields and free text.
Audit writes use Firestore transaction `create`, so an existing event cannot
be updated through the booking repository.

## Error envelope

All future errors use `ApiErrorResponseSchema`:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "A safe, user-facing explanation.",
    "correlationId": "opaque-request-id"
  }
}
```

`correlationId` is opaque and must never be a phone number, email address,
calendar event ID, access token or patient identifier.

### Reserved transport mapping

This is the complete v1 error-code inventory. No appointment route currently
emits it; future controllers must centralize this mapping and must not expose a
domain message, stack trace, SDK error or identifier in `message`.

| API code | HTTP | Source / domain mapping |
| --- | ---: | --- |
| `VALIDATION_FAILED` | 400 | Zod parse failure; `INVALID_TIMESTAMP`, `INVALID_VALUE` |
| `AUTHENTICATION_REQUIRED` | 401 | Missing or invalid server authentication context |
| `AUTHORIZATION_DENIED` | 403 | Policy denial; `COMPLETION_NOT_AUTHORIZED` |
| `POLICY_ACCEPTANCE_REQUIRED` | 428 | Missing decision-approved policy acceptance |
| `NOT_FOUND` | 404 | `APPOINTMENT_NOT_FOUND`, `SLOT_NOT_FOUND` after resource-scope policy |
| `CONFLICT` | 409 | State/capacity/guard/assignment/payroll conflicts, including `APPOINTMENT_NOT_CONFIRMABLE`, `APPOINTMENT_NOT_CANCELLABLE`, `BOOKING_KIND_MISMATCH`, `CANCELLATION_WINDOW_CLOSED`, `DUPLICATE_ACTIVE_BOOKING`, `INVALID_ASSIGNMENT`, `PATIENT_BOOKING_GUARD_MISMATCH`, `PAYROLL_DUPLICATE_CREDIT`, `PAYROLL_NOT_ELIGIBLE`, `SLOT_UNAVAILABLE`, `TRANSITION_NOT_ALLOWED` |
| `IDEMPOTENCY_MISMATCH` | 409 | `IDEMPOTENCY_KEY_REUSED` |
| `RATE_LIMITED` | 429 | API rate-limit / anti-automation boundary |
| `INTERNAL_ERROR` | 500 | Unexpected fault; generic safe message and server correlation only |
| `SERVICE_UNAVAILABLE` | 503 | Maintenance gate or temporarily unavailable required dependency |

Authentication and resource-scope checks happen before existence-sensitive
mapping so that `NOT_FOUND` cannot become a patient or appointment enumeration
oracle.

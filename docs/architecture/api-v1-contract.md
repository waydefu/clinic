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

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
| `POST /v1/appointments` | `CreateAppointmentRequestSchema` | `CreateAppointmentResponseSchema` | Current privacy-policy acceptance, transaction-based slot reservation, idempotency and audit. |
| `POST /v1/appointments/{id}/cancellations` | `CancelAppointmentRequestSchema` | `CancelAppointmentResponseSchema` | Cancellation rule must be resolved server-side; no free-text reason is collected. |

`CreateAppointmentRequestSchema` deliberately omits medical notes, diagnosis,
uploaded images, social-message transcripts and arbitrary free text.  Those
data must not enter this appointment platform without a separate approved
privacy and clinical-data design.

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

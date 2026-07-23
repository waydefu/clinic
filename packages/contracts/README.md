# Contracts Package

Versioned Zod schemas and inferred TypeScript DTOs shared by API, worker and
web code. `docs/architecture/api-v1-contract.md` is the human-readable map.

Schemas must minimise patient data and reject unexpected free-text fields. They
are not an authorization mechanism: the API service still owns authentication,
role checks, idempotency and audit behavior.

The reserved create-appointment schema is an appointment command, not a
patient-intake form. Patient details, actor/role, patient ID, timestamps and
policy versions are absent by design; the future authenticated application
boundary must supply only server-verified or server-generated values.

`AuditEventV2Schema` is the executable append-only audit envelope. Its
`before`/`after` appointment state accepts only `status` and `slotId`; strict
parsing rejects patient identifiers, contact fields and arbitrary free text.
The real role identifiers, reason codes, policy versions, retention and read
permissions remain decision-gated.

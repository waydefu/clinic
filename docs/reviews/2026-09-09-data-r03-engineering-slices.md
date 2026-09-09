# DATA-R03 engineering slices — 2026-09-09

**Type:** dated evidence. Records five authorised DATA-R03 engineering
slices that landed on `main`. It does **not** close the DATA-R03 ID, does
not enable persistence of case/payroll, and is not D-007 / D-008, D-004 /
D-005, Stage 2, or production.

---

## 1. What landed

| Slice | PR | `origin/main` squash | What it does |
| --- | --- | --- | --- |
| Unknown Calendar status fail-closed | [#95](https://github.com/waydefu/clinic/pull/95) | `dbbeed7` | `actionForStatus` maps only explicit upsert vs cancel; unknown → `INVALID_VALUE`, non-retryable dead-letter |
| Slot / appointment dual-readers | [#98](https://github.com/waydefu/clinic/pull/98) | `21a3ee9` | `parseSlotSnapshot` / `parseAppointmentSnapshot`; legacy missing `schemaVersion` still parses; present must be `1`; no dual-write |
| Idempotency `resourceType` enum | [#99](https://github.com/waydefu/clinic/pull/99) | `3f726d8` | Stored Zod enum expanded to `appointment` \| `schedule` \| `case_assignment` \| `payroll_period`. Codec only |
| Outbox job dual-reader | [#101](https://github.com/waydefu/clinic/pull/101) | `90c9c3e` | `parseOutboxSnapshot`; unreadable job → `dead_letter` + `lastError: 'The outbox job is unreadable.'` inside the claim transaction; summary `claimed: 0` / `deadLettered: 0`; Calendar not called; no dual-write |
| CAL-PILOT idempotency envelope | [#102](https://github.com/waydefu/clinic/pull/102) | `0dae4ee` | `parsePilotIdempotencyRecord`; envelope only (non-null non-array object, non-empty `fingerprint` string, `response` present); else `ConflictError`; does not schema-validate `T`; no dual-write; other CAL-PILOT collections remain unchecked casts |

Exact-head `Verification evidence` for #101:
[verify run 34317140020](https://github.com/waydefu/clinic/actions/runs/34317140020)
SUCCESS (squash `90c9c3e`, also included js-yaml 4.3.2 same-major pin).

Exact-head `Verification evidence` for #102:
[verify run 34321577899](https://github.com/waydefu/clinic/actions/runs/34321577899)
SUCCESS on `5a2c43e3daefd45a7dc28153d4aeb651e3f7a59b` (squash `0dae4ee`).

---

## 2. What this is not

- Not dual-write / backfill of `schemaVersion`.
- Not D-007 case persistence or D-008 payroll persistence.
- Not production `/v1/bookings` or mounting `AppointmentController`.
- Not closing DATA-R03. Remaining unchecked casts are other CAL-PILOT
  `documentData<T>` / `as T` collection reads in
  `apps/api/src/firestore/calendar-pilot.repository.ts`; worker
  `firestore-calendar-sync.repository.ts`, `calendar-pilot-runtime.ts`,
  and `apps/api/src/auth/calendar-pilot-session.ts`. Dual-write /
  schemaVersion backfill still out. Corrupt-doc alerting still out
  (outbox `dead_letter` is isolation, not an alert sink). A further
  CAL-PILOT codec or alerting slice is a new scope decision, not an
  implied continuation of the booking/outbox slices above.

---

## 3. Live remaining-work claim

`DATA-R03` stays **OPEN**: authorised slices landed; ID acceptance in the
2026-08-11 audit still names enum alignment plus codec/`schemaVersion`
dual-reader behaviour, plus corrupt-doc isolate-and-alert. Dual-write and
remaining collection codecs are out of the locked slices above.

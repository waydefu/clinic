# DATA-R03 engineering slices — 2026-09-09

**Type:** dated evidence. Records three authorised DATA-R03 engineering
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

Exact-head `Verification evidence` for #99:
[verify run 34277645976](https://github.com/waydefu/clinic/actions/runs/34277645976)
SUCCESS on `68c5a89730573799f998b2914ee99bf138bc5d8c` (squash `3f726d8`).

---

## 2. What this is not

- Not dual-write / backfill of `schemaVersion`.
- Not D-007 case persistence or D-008 payroll persistence.
- Not production `/v1/bookings` or mounting `AppointmentController`.
- Not closing DATA-R03. Remaining codec casts include Calendar-pilot
  `as IdempotencyRecord<…>` in
  `apps/api/src/firestore/calendar-pilot.repository.ts` and `as OutboxJob`
  in `apps/worker/src/outbox-processor.ts`.

---

## 3. Live remaining-work claim

`DATA-R03` stays **OPEN**: authorised slices landed; ID acceptance in the
2026-08-11 audit still names enum alignment plus codec/`schemaVersion`
dual-reader behaviour. Dual-write and remaining collection codecs are
out of the locked slices above.

# D-series Approval Packet Template

**Copy this file to `docs/approval-packets/D-XXX-<short-name>.md` and fill in every section.**

---

## Metadata (required for every packet)

| Field | Value |
|-------|-------|
| **Decision ID** | D-XXX (e.g., D-001, D-004, D-009) |
| **Title** | Short human-readable title |
| **Owner** | Named person (clinic owner, privacy/legal owner, medical owner, finance owner, security owner, technical owner, operations owner) |
| **Approval Date** | YYYY-MM-DD (Asia/Taipei) — **blank until approved** |
| **Status** | `pending` → `approved` / `deferred` (updated by owner) |
| **Scope** | What this approval covers (exact capabilities, endpoints, data types) |
| **Exclusions** | What is **not** covered (explicit boundaries) |
| **Engineering Impact** | Routes unlocked, modules enabled, Terraform resources, schema changes |
| **Open Questions** | List of unresolved items that block approval |

---

## Recorded Input (from owner)

> Paste the owner's raw answer here (from the 39-question sheet or later clarification).
> Do not paraphrase.

```
[owner's exact words]
```

---

## Legal / Privacy / Medical / Security Review (if required)

| Review Type | Required? | Reviewer | Date | Outcome |
|-------------|-----------|----------|------|---------|
| Privacy / Legal (D-001, D-002, D-003) | | | | |
| Medical (D-014, D-016 inbound) | | | | |
| Security / IAM (D-006, D-010) | | | | |
| Financial / Payroll (D-008, D-015) | | | | |
| Calendar / Integration (D-009, D-016) | | | | |

---

## Approval Ceremony (all required for `approved`)

- [ ] Named **owner** recorded above
- [ ] **Approval date** (Asia/Taipei) recorded
- [ ] **Scope** explicitly written (not "see FS-001")
- [ ] **Exclusions** explicitly written
- [ ] **Engineering impact** enumerated
- [ ] No open questions remain (or each has a named follow-up owner/date)

---

## Register Update (only after ceremony)

Update `docs/product/phase-1-decision-register.md` table row for this D-XXX:

| ID | Decision | Owner | Status | Needed before |
|----|----------|-------|--------|---------------|
| D-XXX | [title] | [owner] | **approved** | [unlocks] |

**Do not** flip status to `approved` until the ceremony checklist above is complete.

---

## Post-Approval Actions (Luna)

- [ ] Regenerate `docs/state/current.*` via `corepack pnpm run generate:governance-state`
- [ ] Run `corepack pnpm run check:architecture` and `check:docs`
- [ ] If engineering impact includes code: open PR on `cursor/luna-dXXX-<topic>`
- [ ] Update checkpoint with new `BLOCKERS` status
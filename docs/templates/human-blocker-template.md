# Human Blocker Template

**Use this exact format for every HUMAN BLOCKER. Do not improvise.**

---

```text
HUMAN BLOCKER
PHASE: <Phase letter + Card number, e.g., "Phase B Card 13" or "Phase C Card 14">
DECISION OR RESOURCE: <What specific decision, approval, or resource is needed>
ONE QUESTION: <Single, answerable question — no multiple choice unless options are mutually exclusive and exhaustive>
WHY I CANNOT PROCEED: <Which Safety Floor rule, register gate, or authority boundary blocks this work>
WHAT I WILL NOT DO UNTIL ANSWERED: <Exact engineering action that stays paused>
SAFE OPTIONS (if any): <What Luna can safely continue on other tracks while this blocks>
```

---

## Examples (from the playbook)

### Card 14 — Phase C Booking Route
```text
HUMAN BLOCKER
PHASE: Phase C (Card 14)
DECISION OR RESOURCE: D-001～D-005 named approval with owner/date/scope/exclusions
ONE QUESTION: Which pending D-001～D-005 IDs are approved with owner, date, scope, and exclusions?
WHY I CANNOT PROCEED: Safety Floor forbids routing /v1/bookings before those IDs are approved
WHAT I WILL NOT DO UNTIL ANSWERED: import AppointmentController / BookPilotModule in AppModule
SAFE OPTIONS (if any): stay UNROUTED; continue Card 16 synthetic UI
```

### Phase D — Production Calendar
```text
HUMAN BLOCKER
PHASE: Phase D
DECISION OR RESOURCE: Production D-009 and D-016 approved with calendar owner, calendar IDs, scopes, minimum fields, reviewer roles, conflict/delete semantics, SLO
ONE QUESTION: Are production D-009 and D-016 approved with all required fields?
WHY I CANNOT PROCEED: Production Calendar projection requires explicit production D-009/D-016 approval
WHAT I WILL NOT DO UNTIL ANSWERED: Route CalendarWatchController, enable watch channels, write to production calendar
SAFE OPTIONS (if any): Continue CAL-PILOT synthetic-only; Phase E infra prep
```

### Phase E — Production Infrastructure
```text
HUMAN BLOCKER
PHASE: Phase E
DECISION OR RESOURCE: Exact-SHA production deploy authority packet naming this HEAD SHA, project, region, window, billing account
ONE QUESTION: Is there a written production authority packet for this exact SHA, project, and window?
WHY I CANNOT PROCEED: Terraform apply on production requires explicit exact-SHA authority
WHAT I WILL NOT DO UNTIL ANSWERED: Run `terraform apply` on production project
SAFE OPTIONS (if any): Prepare plan, validate, draft on isolated project; continue Phase F DNS prep
```

### Phase G — Data Migration
```text
HUMAN BLOCKER
PHASE: Phase G
DECISION OR RESOURCE: Real-data authority + freeze window agreement + export location
ONE QUESTION: Is real-data authority granted and is the freeze window agreed?
WHY I CANNOT PROCEED: Cannot move production data without explicit real-data authority
WHAT I WILL NOT DO UNTIL ANSWERED: Export, normalize, import legacy Calendar data
SAFE OPTIONS (if any): Generate anonymised fixture; dry-run import scripts
```

---

## Rules

1. **One question only** — if you have multiple, split into separate blockers
2. **Never ask the human to paste secrets** (passwords, tokens, ADC JSON, keys)
3. **Never ask the human to choose engineering implementations** when a domain planner, ADR, or existing packet already decides it
4. **SAFE OPTIONS must be real** — something Luna can actually do without the blocked resource
5. **Stop the blocked phase** — do not "continue anyway" or work around the blocker
6. **Copy this template verbatim** — keep formatting exactly as shown
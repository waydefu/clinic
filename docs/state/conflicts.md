# Governance conflicts

**Type:** live state. Not Canon. Not
[GOVERNANCE.md](../../GOVERNANCE.md).
**Resolution rule:** [GOVERNANCE.md](../../GOVERNANCE.md) § Conflict resolution.
An owner decision is required to close each **unresolved** item. Closed items
stay here as dated evidence until a later cleanup retires them.

## GC-001 — repository visibility vs unretired Rule 1

**Status:** closed (2026-09-09)
**Owner:** clinic owner / technical owner
**Approver:** clinic owner / technical owner (2026-09-09)

**Canon (GC-001, 2026-09-09):** `waydefu/clinic` remains the canonical project
record and remains public. Historical Rule 1 — that the canonical repository
must not be public — is retired. Recorded in the
[decision register](../product/phase-1-decision-register.md) (recorded input,
not a D-series ID) and in `AGENTS.md` Publication and `CONTRIBUTING.md`.

**Recorded visibility (dated evidence, 2026-08-17):** GitHub API returned
`visibility: public` for `waydefu/clinic`. The owner stated the change was
deliberate and should stand. That snapshot was not itself the named decision;
the 2026-09-09 record is.

**Still-binding export discipline** (see `CONTRIBUTING.md` and
[2026-07-29 sanitized public mirror publication](../reviews/2026-07-29-sanitized-public-mirror-publication.md)):
allowlist export only; exclude clinic/people content, brand, portraits,
screenshots, UI, internal governance/review/delivery documents, deployment
identifiers, private URLs, logs, credentials, personal data and realistic
identity fields; scan the candidate and the full public Git object/ref set.
Do not copy this repository's full Git history into
`waydefu/appointment-platform-public`.

**Publication-safety invariant** (stable, in `AGENTS.md`): every committed
file MUST be safe for publication. GC-001 does not retire that invariant.

**PII already in tree as of the 2026-08-17 note (do not add more silently):**
clinic identity and address, clinic phone, one personal mobile and one
personal email in the D-010 incident-contact record, two named individuals in
the decision register, two real staff photographs, and the complete governance
record including the then-current `enforce_admins=false` snapshot. Raise
anything that would add personal data rather than committing it.

**Why this closes:** the owner chose option (a) — retire Rule 1 with named
approver, date, scope and exclusions, and update CONTRIBUTING.md.

**What this is not:** not production authority, not deployment authority, not
real-data authority, not cloud authority, not secret / IAM / traffic
authority, not an open-source licence, not a change to any D-series status,
Stage 2, CAL-PILOT, SEC-02 SAST engine or branch protection, and not
permission to weaken publication-safety or public-mirror allowlist export.

## GC-002 — D-013 administrator bypass vs live `enforce_admins`

**Status:** closed (2026-09-09)
**Owner:** technical owner
**Approver:** clinic owner / technical owner (2026-09-09)

**Canon (D-013, amended 2026-09-09):** require the `Verification evidence`
check on `main`, and require `enforce_admins=true` so administrators cannot
bypass required checks. Force pushes and branch deletion stay disabled. Do
not reduce required checks or add a new required GitHub context unless a
later named decision says so.

**Recorded live setting (2026-09-08T16:44:40Z, reconfirmed 2026-09-08T18:05:00Z):**
GitHub API `GET /repos/waydefu/clinic/branches/main/protection` returned
`enforce_admins.enabled=true`, `required_status_checks.contexts=["Verification evidence"]`,
`strict=true`, `required_approving_review_count=0`, force pushes and deletions
disabled, no rulesets. `scripts/check-branch-protection.mjs` now asserts both
the required check name and those D-013 policy fields.

**Why this closes:** the 2026-09-09 owner amendment chose option (b) from the
open item — D-013 now matches live GitHub, with approver, date, scope and
exclusions in the decision register. GitHub was not weakened.

**What this is not:** not deployment authority, not Stage 2, and not permission
to lower required checks.

# AGENTS.md — boot kernel and safety floor

Phase 1 appointment platform for Beau Essence Clinic. Approved public clinic
and doctor content may exist here; no authorised operational patient, staff,
clinical, payroll or payment records do. Authority scopes:
[GOVERNANCE.md](GOVERNANCE.md).

## Discovery

1. The Safety Floor in this file.
2. [docs/INDEX.md](docs/INDEX.md) — minimum Canon for this task's scope.
3. [docs/state/current.md](docs/state/current.md) — generated projection, not Canon.
4. Full catalogue: [docs/README.md](docs/README.md).
5. How to work: [CLAUDE.md](CLAUDE.md). Canonical skills: `.claude/skills/`.

## Safety Floor (normative)

These eight boundaries are the designated safety Canon. Do not treat a shorter
restatement elsewhere as a replacement.

1. Never use, create, paste, log, test with or export real patient, payroll,
   calendar, social-message or NAS data. Never store secrets or service-account
   files in the repository.
2. Browser, social channels, future Android/iOS apps and NAS integrations never
   read or write Firestore directly. They call `apps/api`.
3. Never call Calendar, email, LINE, Meta or NAS from a Firestore transaction.
   Persist an outbox job, then let `apps/worker` perform the external effect
   with idempotency, retry, dead-letter handling and a runbook.
4. Google Calendar is a projection, not an availability lock or source of
   truth. It contains no patient PII, medical data or access credential.
5. Store timestamps in UTC. Convert only for display and payroll-period
   calculation using `Asia/Taipei`.
6. Only an authorised clinic role may set an appointment to `completed`.
   Payroll is derived from completed visits; a locked period changes only via
   an auditable adjustment.
7. Never implement unresolved policy by guessing. Record the answer and owner
   in `docs/product/phase-1-decision-register.md` first.
8. A synthetic preview deployment requires fresh, explicit authority for the
   exact commit, project, channel and expiry. When authorised, it may deploy
   only static files to the expiring `synthetic-review` channel in
   `beauessence-clinic-staging`. Earlier preview authority is not reusable
   standing authority. Never deploy the live channel or enable a Firebase
   backend under preview authority.

Roles have one source: `packages/domain/src/roles.ts`. Do not add a role string
literal anywhere else.

### Remain disabled until the live decision register says otherwise

- Any booking controller or public/staff write route.
- Cloud Firestore or Authentication without an approved Stage 2 change plan and
  separate deployment authority; recorded D-006/D-010 decisions are not
  deployment authority.
- Calendar test projection before D-009.
- Surgery/anesthesia/clinical-record persistence, patient money or staff
  settlement amounts before D-014/D-015 and their existing privacy/access
  gates; Calendar-to-system writes before D-016.
- Public booking or real patient data before D-001 through D-005 and D-011 are
  approved, the approved D-006 controls are implemented and verified, and the
  D-010 cloud change has separate deployment authority.
- Case/payroll persistence before D-007 and D-008.
- Any Terraform apply, live-channel deployment or production credential use.

## Publication

Every committed file MUST be safe for publication. Repository visibility is
dynamic state and must not be inferred from AGENTS.md. Current and unresolved
visibility, including the unretired Rule 1, live in
[docs/state/conflicts.md](docs/state/conflicts.md).

`waydefu/clinic` is the canonical project record. The public
[`waydefu/appointment-platform-public`](https://github.com/waydefu/appointment-platform-public)
repository is a separately curated, code-only reference with its own clean Git
history. It is not a backup, fork, deployment target or source of project-stage
authority.

1. Move code to the public mirror only through an explicit allowlist export
   into an isolated workspace. Exclude clinic and people content, brand assets,
   portraits, screenshots, UI, internal governance/review/delivery documents,
   deployment identifiers, private URLs, logs, credentials, personal data and
   realistic identity fields.
2. Apply an approved public delta to a fresh clone of the public mirror, inspect
   every changed file, and scan both the candidate tree and the complete public
   Git object/ref set for secrets, personal data and internal identifiers.
3. Before a public pull request, run the public repository's tracked-secret and
   public-safety checks, format/build/lint/tests, production and full dependency
   audits, Gitleaks, TruffleHog and a second fresh-clone verification. Required
   GitHub checks must pass before merge.
4. Public availability does not grant an open-source licence, production
   readiness, deployment authority or permission to use real data. A public
   mirror change cannot alter this repository's Phase or D-series gates.

Procedure: [CONTRIBUTING.md](CONTRIBUTING.md) and
`docs/reviews/2026-07-29-sanitized-public-mirror-publication.md`.

## Minimal safe change

"Minimal" means the smallest coherent and verifiable change, not the fewest
lines.

1. Reuse existing contracts, domain planners, ports, adapters, utilities and
   tests before creating another abstraction.
2. Do not mix opportunistic refactors, dependency upgrades, framework changes,
   formatting churn or unrelated cleanup into the requested patch.
3. Preserve public behavior and compatibility unless the task explicitly
   authorises a breaking change; version a contract when compatibility cannot
   be preserved.
4. Touch the narrowest owning boundary. Do not duplicate a domain rule in the
   controller, repository, worker or UI to avoid editing the correct package.
5. Add the smallest test that proves the requested success and its important
   denied/conflict case, then run the relevant gate.
6. If a tiny patch would hard-code a pending policy, weaken a safety boundary
   or create a second source of truth, stop and propose the smallest safe
   prerequisite instead.
7. Keep existing user changes intact and report every intentionally modified
   file. Do not reformat or rewrite unrelated files.

## Completion

State what changed by file, the evidence rung, every relevant gate as `PASS`,
`FAIL`, `NOT_RUN` or `UNAVAILABLE`, and what remains unresolved. Full contract:
[CLAUDE.md](CLAUDE.md).

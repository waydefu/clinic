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

Register IP-001-2026-09-13 splits **internal test** from **public
production**. Do not collapse those two.

**Public production / go-live (still disabled):**

- Public production `/v1/bookings` traffic and any ungated
  `AppointmentController` / `BookPilotModule` import on `AppModule`.
- Cloud Firestore or Authentication as a **production** backend without an
  approved Stage 2 change plan and separate **production** deployment
  authority; recorded D-006/D-010 decisions are not production deployment
  authority.
- Production Calendar projection before production D-009, and
  Calendar-to-system writes before production D-016. The Decision Register's
  CAL-PILOT synthetic-only sub-scope (expiry/exclusions there) is the only
  recorded production-Calendar exception and is not production launch.
- Real patient data. Functional completeness is not real-data authority.
- Official DNS, custom domains, live-channel Hosting, production Terraform
  apply, or production credential use.
- Clinic public marketing / corporate website takeover (vendor lease;
  `DELIVERY_DEFERRED_DUE_TO_EXISTING_VENDOR_LEASE`).

**Internal test (IP-001 `INTERNAL_TEST_ROUTE_AUTHORIZED`):**

- Isolated-test / emulator booking create, query, reschedule, cancel and
  supporting staff routes may be imported only through
  `InternalTestBookingModule`, with fail-closed production default
  (`INTERNAL_TEST_BOOKING_ENABLED` + UTC expiry + allowlisted isolated
  project `beauessence-clinic-stg-c1a01` or the Firestore emulator).
- CAL-PILOT / dedicated synthetic calendars may complete technical sync
  behaviour. Production clinic Calendar stays blocked.
- Firebase Hosting **preview** / isolated-test deploy only with fresh
  exact-SHA, project, channel and expiry. Preview URLs are public and are
  not authentication. Never promote preview to live.
- D-001–D-005 stay `pending`; their IP-001 provisional rules may be
  implemented internally. Do not mark them `approved` from this packet.
- D-007 / D-014 / D-015 are `DEFERRED_OUTSIDE_CURRENT_PHASE1_DELIVERY`.
- D-011 is `GO_LIVE_DEFERRED` for this stage.

## Publication

Every committed file MUST be safe for publication. That invariant does not
depend on GitHub visibility and is not retired by GC-001.

**GC-001 (clinic owner, 2026-09-09):** `waydefu/clinic` remains the canonical
project record and remains public. Historical Rule 1 — that the canonical
repository must not be public — is retired. Closed-item evidence lives in
[docs/state/conflicts.md](docs/state/conflicts.md). Public visibility does
not grant production, deployment, real-data, cloud, or secret / IAM /
traffic authority, and does not grant an open-source licence.

`waydefu/clinic` is the canonical project record. The separately curated
[`waydefu/appointment-platform-public`](https://github.com/waydefu/appointment-platform-public)
repository is a code-only reference with its own clean Git history. It is not
a backup, fork, deployment target or source of project-stage authority.

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

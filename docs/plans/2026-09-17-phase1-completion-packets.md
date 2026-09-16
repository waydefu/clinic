# Phase 1 completion packets — 2026-09-17

Status: **plan-only / execution context**. This document does not authorize
implementation, merge, deployment, Terraform apply, human login, M11 or M12.
The owner separately authorized publishing this plan as a documentation PR.
No Phase 1 completion is claimed.

## A. CURRENT_GAP_MATRIX

Planning authority: `24f43542ef7f4271f6d67ba8686838410d8eae51`.
Remote main was read back at that SHA on 2026-09-17. PR #139 is merged;
the older handoff's OPEN/DRAFT statement is obsolete.

Source observations below come from the bounded planning read. Runtime facts
come from the supplied FACT PACK and the dated
[Stage F handoff](../reviews/2026-09-17-stage-f-cal-pilot-handoff.md);
they were not re-probed in this planning round.

| Item | Gap / evidence | Packet |
| --- | --- | --- |
| Login, Workbench, M10 | FACT PACK PASS; confirm applicability after deployment | 05 / 08 |
| Logout | Workbench DELETE is fire-and-forget and lacks Firebase signOut | 01 → 05 |
| Durable denied audit | Existing filter already calls a port, but uses void recordDenial, optional injection and swallowed errors. Unrouted legacy in-memory sink does not prove the routed durable path is absent | 00 → 02 |
| Calendar secret | Shared version input can regress Calendar :2 to :1 | 03 |
| Runtime provenance | API deployed source is older than main | 04 / 08 |
| WP-B4 | Implemented; deployment and human inbox proof remain | 06 |
| M11 / M12 | Not executed / not started | 07 → 08 |
| WP-B2 / booking SoT | Already implemented; verification only | 09 |
| Completion evaluator | Accepts IMPLEMENTED_NOT_DEPLOYED and treats human login as nonblocking; its PASS is insufficient for this completion scope | 09 strict matrix |

## B. CRITICAL_PATH

```text
00 → {01 || 02 || 03} → 04 → 05 → 07 → 08 → 09
                         └────→ 06 ────┘
```

P1-02's known partial integration is handled by Luna against the existing contract;
Sol is needed only if unresolved durability/security semantics trigger escalation.
Independent packets continue. P1-06 may run alongside 05/07; alerts must be
proven before P1-08 enables processing. Merge source fixes before one consolidated
API/web deployment. Align worker at P1-08. After the logout proof, reuse the
fresh Google+TOTP session for M11 and applicable staff checks in one planned
operator window. Session expiry is never bypassed.

## C. PHASE1_CONTEXT_CAPSULE

Paste this capsule, one complete packet and the latest CHAIN_STATE for each
Luna task. Evidence references must be accessible without conversation history.

**Authority.** Repository `waydefu/clinic`; baseline
`24f43542ef7f4271f6d67ba8686838410d8eae51`. Verify checkout/remote/status;
source work uses an isolated `agent/` branch. Priority: AGENTS Safety Floor,
latest approved owner decision, current source, tests, Stage F handoff, older
plans. Read only named files and directly necessary contracts.

**Scope.** Synthetic internal preproduction only, project
`beauessence-clinic-stg-c1a01`, preview channel `internal-preproduction`.
Read current URL/expiry from evidence. Exclude real patients, public production,
official DNS, live Hosting, production Calendar/inbound, marketing-site takeover,
D-007/D-014/D-015, clinical records and finance/payment expansion. No fake
credentials, bypasses, or weakened revocation/disabled-account checks.

**Product.** Patient booking has no login/OTP. Phone+DOB lookup occurs only on
explicit return selection. Staff uses real Google + existing TOTP + server
`__session` + CSRF + RBAC. Firestore is SoT; Calendar is an outbox projection.
No external effects inside Firestore transactions. Arrived is not completed;
follow-up need is a human decision.

**Known state.** Login, Workbench and M10 PASS in FACT PACK; logout FAIL.
M11/M12 incomplete; worker=false, scheduler=PAUSED. Current approved C1 Calendar
pin is `c1-synthetic-calendar-id:2`, not a permanent module constant. Independent
explicit inputs must support future authorized rotation (for example 2→3)
without structural code changes. API source is newer than runtime. Do not reimplement
WP-B2 or booking SoT. Denial filter already exists: repair its durable lifecycle,
not a second parallel recording path.

**SOURCE_GATE.** Small coherent fix and positive/negative regression → scoped
checks → PR → exact-head required CI and Verification evidence PASS → authorized
merge. New head requires matching evidence. Source merge grants no cloud authority.

**CLOUD_GATE.** Infrastructure/deployment mutations only: Terraform apply, Cloud
Run revision/deploy, Hosting release, IAM, monitoring infrastructure, worker enable
configuration and scheduler state. Require source authority (source PR →
exact-head required CI/Verification evidence where applicable → merge →
fresh origin/main), explicit cloud authority, saved/reviewed plan or equivalent
mutation diff, rollback and runtime read-back.
Authority names SHA, project, resources/operations, channel/expiry where applicable,
synthetic boundaries, limits and rollback. If missing, finish reviewable materials,
mark OWNER_DECISION_NEEDED and stop before mutation. Full Terraform plan is
inspection-only until resolved Calendar version equals its explicit approved pin
(currently 2). Any unapproved :2→:1 is STOP/NOT_APPLIED.
Do not reuse stale tfvars image/SHA pins. Follow repository command-execution
boundaries, including handing approved guarded commands to the owner when required.

**RUNTIME_WRITE_GATE.** Authorized synthetic writes through deployed application
APIs, including session creation/revocation, DELETE /v1/calendar-session,
POST /v1/schedule/publish and booking/write verification. Require correct deployed
runtime/source provenance, isolated project, synthetic-only boundary, real
auth/RBAC/CSRF where required, specified fixed idempotency, bounded authorized
write scope, before/after application evidence and STOP on unexpected state.
Missing operation authority means OWNER_DECISION_NEEDED. No Terraform saved plan
or infrastructure deployment ceremony is required for these application writes.

**HUMAN_GATE.** Google/TOTP login, logout UI, browser E2E and inbox observation:
one bounded attempt, exact expected PASS condition, no credential/token/cookie
disclosure, no blind retry; failure → read evidence → diagnose before next action.
A human action invoking an application write uses both RUNTIME_WRITE_GATE and
HUMAN_GATE, not CLOUD_GATE unless it also changes infrastructure.

**Evidence.** CHAIN_STATE stores summaries and a manifest reference, never secrets.
The manifest binds SHA, CI/test artifacts, revisions/digests, timestamps, sanitized
observations and authority references. No tokens, cookies, CSRF/TOTP values,
recipient addresses, Calendar IDs or PII in repo/chat. Recipient/config secrets
remain in protected secret/local tfvars. SOURCE needs scoped tests; CLOUD needs
before/after read-back. HUMAN gets one bounded attempt, no debugging loop;
retry only after a diagnosed fix, evidence and renewed applicable authority.

Luna is the default executor, including expected cloud operations.
`SOL_REVIEW_IF_TRIGGERED` applies only to the exceptions in G, not every cloud
packet or the already-known partial audit integration. No Astra revisit
unless the owner changes scope. This plan itself is not execution authority.

## D. CHAIN_STATE_SCHEMA

```yaml
AUTHORITY_SHA: 24f43542ef7f4271f6d67ba8686838410d8eae51
LAST_PR: 139
FACT_PACK_DRIFT: AUDIT_PATH_PARTIALLY_IMPLEMENTED
SOURCE_GATES: {}
DEPLOYED_REVISION_REF: `internal-test-api-00007-rg4`
API_IMAGE: sha256:824b7d990ca799c7d2eca777511ae8e346d370b12ac722f9b4a129ec67d653fd
WORKER_REVISION: internal-test-outbox-00008-xpw
WORKER_IMAGE: sha256:73fc6a294567b7da0de2e590403b1f1a2251f2753c75ef1c04bc24b2116a5eb3
PROVENANCE: { api_source: 7dbe50a575b5d8e101da2e76b797eebf7a443cc6, worker_source: UNVERIFIED, web_source: UNVERIFIED }
CALENDAR_SECRET_VERSION: 2
WORKER_ENABLED: false
SCHEDULER_STATE: PAUSED
M10: PASS
M11: NOT_EXECUTED
M12: NOT_STARTED
LOGOUT_E2E: FAIL
ALERT_PROOF: IMPLEMENTED_NOT_DEPLOYED
AUTHORITY_REFS: {}
EVIDENCE_MANIFEST: PENDING
COMPLETION: TODO:P1-09
```

## E. PACKETS

Paths are repository-relative. Every prompt is pasted with its entire packet,
capsule and latest CHAIN_STATE. Tests listed below are future execution
requirements, not tests performed by this planning PR.

### P1-00

```text
ID: P1-00
TITLE: Cheap current-state drift check
MODEL: LUNA_EASY
TYPE: READ_ONLY
DEPENDS_ON: NONE
PARALLEL_WITH: NONE
GOAL: Verify only whether the FACT PACK changed.
FILES_TO_READ: AGENTS.md; apps/web/public/admin-bootstrap.js;
  apps/web/{src,public}/calendar-pilot-entry.js;
  apps/api/unrouted-inventory.json;
  apps/api/src/platform/errors/api-exception.filter.ts;
  apps/api/src/{appointments/appointment.controller.ts,
  schedule/schedule.controller.ts,internal-test-booking/return-lookup.controller.ts};
  apps/web/public/modules/internal-test-booking-transport.js;
  infra/terraform/c1-internal-test-run/{main.tf,variables.tf};
  scripts/stage-f-human-alert-proof.mjs.
FILES_TO_EDIT: NONE
DO_NOT_TOUCH: Other repository areas, cloud, tests.
STEPS: Read main SHA; inspect only baseline..current delta and named symbols.
  Classify known partial audit integration separately from unexpected drift.
  Keep expected partial integration with Luna; escalate new contradictory evidence
  under SOL_REVIEW_IF_TRIGGERED.
TESTS_OR_EVIDENCE: SHA, changed paths, symbol locations, small drift table.
STOP_IF: New safety/dependency contradiction; stop affected packet only.
PASS_IF: Every drift classified; NONE only if no discrepancy remains.
PR_SCOPE: NONE
CLOUD_MUTATION: NONE
HUMAN_ACTION: NONE
CHAIN_STATE_INPUT: AUTHORITY_SHA, FACT_PACK_DRIFT.
CHAIN_STATE_UPDATES: AUTHORITY_SHA, FACT_PACK_DRIFT, EVIDENCE_MANIFEST.
LUNA_PROMPT: Use PHASE1_CONTEXT_CAPSULE + this packet only.
  Inspect the listed symbols and current-main delta, not the whole repository.
  Record AUDIT_PATH_PARTIALLY_IMPLEMENTED; escalate only unexpected contradictions
  or unresolved semantics. Return authority, exact drift and evidence references.
  Continue independent packets; do not call Astra.
```

### P1-01

```text
ID: P1-01
TITLE: Two-layer logout regression and teardown
MODEL: LUNA_NORMAL
TYPE: SOURCE
DEPENDS_ON: P1-00
PARALLEL_WITH: P1-02, P1-03
GOAL: Workbench terminates server and Firebase sessions coherently.
FILES_TO_READ: apps/web/public/admin-bootstrap.js;
  apps/web/{public,src}/calendar-pilot-entry.js;
  apps/web/public/modules/pilot-google-totp-session.js;
  apps/api/src/auth/calendar-pilot-session{,.controller}.ts; corresponding tests.
FILES_TO_EDIT: Listed web owners and corresponding logout regression tests.
DO_NOT_TOUCH: Login/TOTP/RBAC/server verification semantics.
STEPS: Add failing regression; reuse Firebase auth instance/teardown;
  await credentialed DELETE; signOut; clear bounded client state;
  suppress rehydrate during logout; reload only after completion.
TESTS_OR_EVIDENCE: Delayed/failed DELETE, failed signOut, duplicate click,
  cached-CSRF bootstrap, success ordering, no false logout-success on failure.
STOP_IF: Session protocol/server revocation change needed -> Sol.
PASS_IF: Both layers clear; failure locks privileged UI and remains visible;
  SOURCE_GATE PASS.
PR_SCOPE: Logout and regression only.
CLOUD_MUTATION: NONE
HUMAN_ACTION: NONE
CHAIN_STATE_INPUT: AUTHORITY_SHA.
CHAIN_STATE_UPDATES: LAST_PR, SOURCE_GATES.P1-01, EVIDENCE_MANIFEST.
LUNA_PROMPT: Use PHASE1_CONTEXT_CAPSULE + this packet only.
  Read named logout owners, add two-layer regression, implement smallest shared
  teardown. Attempt local signOut/cleanup even when DELETE fails without claiming
  server revocation succeeded. Run targeted web tests and required gates;
  open scoped PR and return exact head, tests and CI evidence.
```

### P1-02

```text
ID: P1-02
TITLE: Durable routed denial lifecycle
MODEL: LUNA_NORMAL; SOL_REVIEW_IF_TRIGGERED for unresolved durability/security semantics
TYPE: SOURCE
DEPENDS_ON: P1-00
PARALLEL_WITH: P1-01, P1-03
GOAL: One routed denial yields one durable append with observable lifecycle.
FILES_TO_READ: apps/api/src/platform/errors/api-exception.filter.ts;
  apps/api/src/platform/authorization/denied-access-audit.port.ts;
  apps/api/src/firestore/denied-access-audit.repository.ts;
  apps/api/src/platform/runtime/observability.module.ts;
  apps/api/src/internal-test-booking/internal-test-booking.module.ts;
  directly corresponding domain contract/tests.
FILES_TO_EDIT: Necessary existing filter/adapter/wiring and corresponding tests.
DO_NOT_TOUCH: Broad RBAC refactor, second sink, unrelated inventory entries.
STEPS: Trace routed provider -> filter -> adapter; repair actual awaited persistence,
  request/event deduplication and append-only behavior; expose bounded failure
  evidence while preserving denial status/body. Do not trust client event IDs.
TESTS_OR_EVIDENCE: Routed emulator read-back; one denial/one event;
  two requests/two events; duplicate handling; visible append failure;
  successful request emits none; no PII/secrets.
STOP_IF: Provider mismatch or unresolved durability/failure policy -> Sol;
  owner-policy ambiguity -> OWNER_DECISION_NEEDED.
PASS_IF: Durable read-back, visible failure and SOURCE_GATE PASS;
  any triggered security/durability review resolved.
PR_SCOPE: One existing denied-audit integration boundary.
CLOUD_MUTATION: NONE
HUMAN_ACTION: NONE
CHAIN_STATE_INPUT: AUTHORITY_SHA, FACT_PACK_DRIFT.
CHAIN_STATE_UPDATES: LAST_PR, SOURCE_GATES.P1-02, FACT_PACK_DRIFT, EVIDENCE_MANIFEST.
LUNA_PROMPT: Use PHASE1_CONTEXT_CAPSULE + this packet only.
  Verify existing wiring before editing; unrouted legacy sink is not proof that
  all persistence is absent. Repair actual void/optional/swallowed-failure gaps.
  Add routed durability/dedup/failure tests; escalate only unresolved durability
  semantics or security-boundary changes under SOL_REVIEW_IF_TRIGGERED; run scoped
  tests and gates, then open PR. Report the append-failure limit honestly;
  do not claim durable persistence while the storage service is unavailable.
```

### P1-03

```text
ID: P1-03
TITLE: Per-service secret version pins
MODEL: LUNA_NORMAL
TYPE: SOURCE
DEPENDS_ON: P1-00
PARALLEL_WITH: P1-01, P1-02
GOAL: Remove shared-version Calendar regression structurally.
FILES_TO_READ: infra/terraform/c1-internal-test-run/{main.tf,variables.tf,
  noop.tftest.hcl,terraform.tfvars.example,README.md};
  scripts/c1-internal-test-run.test.mjs.
FILES_TO_EDIT: Same files where needed.
DO_NOT_TOUCH: Secret payload/rotation, IAM, worker/scheduler activation.
STEPS: Remove shared secret_resource_version coupling using independent explicit
  per-secret/per-service version inputs with the smallest module-consistent layout.
  Missing required pin fails closed; reject latest; protected current C1 input
  pins Calendar to approved version 2. Support future authorized 2->3 rotation
  through input changes only; document local-input migration.
TESTS_OR_EVIDENCE: terraform validate and mocked terraform test;
  current fixture Calendar=2; changing another pin cannot alter Calendar;
  resolved Calendar equals explicit approved input, including a future-version
  fixture; missing pin/latest rejected; no-authority noop; old shared input
  cannot govern all mounts. Never encode version==2 as a permanent invariant.
STOP_IF: Calendar :2->:1, secret replacement, unrelated resource changes.
PASS_IF: Targeted tests and SOURCE_GATE PASS; real saved-plan proof belongs to 04.
PR_SCOPE: Version inputs/mounts/tests/migration documentation.
CLOUD_MUTATION: NONE
HUMAN_ACTION: NONE
CHAIN_STATE_INPUT: AUTHORITY_SHA, CALENDAR_SECRET_VERSION.
CHAIN_STATE_UPDATES: LAST_PR, SOURCE_GATES.P1-03, EVIDENCE_MANIFEST.
LUNA_PROMPT: Use PHASE1_CONTEXT_CAPSULE + this packet only.
  Replace shared secret-version coupling with per-service explicit pins.
  Test current fixture=2, independent pins, future input-only rotation,
  missing-value/latest rejection and no-authority behavior. Never hard-code 2
  or read secret payloads. Run mocked Terraform and specified script
  tests; open PR with precise local tfvar migration instructions.
```

### P1-04

```text
ID: P1-04
TITLE: Consolidated API/web deployment
MODEL: LUNA_NORMAL; SOL_REVIEW_IF_TRIGGERED for unexpected cloud diff
TYPE: CLOUD
DEPENDS_ON: P1-01, P1-02, P1-03 merged
PARALLEL_WITH: NONE
GOAL: Align API/web once to merged source.
FILES_TO_READ: docs/templates/stage-f-exact-sha-authority-packet.md;
  containers/internal-test.cloudbuild.yaml; firebase.isolated-api-preview.json;
  infra/terraform/c1-internal-test-run/{main.tf,variables.tf,README.md};
  scripts/internal-test-image-names.mjs.
FILES_TO_EDIT: Sanitized authority/evidence; protected local pins.
DO_NOT_TOUCH: Worker enable, scheduler resume, production, secret payload.
STEPS: Enforce complete CLOUD_GATE; build API/web; inspect saved full plan's
  mounts/images/SHA; preserve worker runtime pins until 08 unless explicitly
  reviewed otherwise; deploy only approved diff; read back releases and expiry.
TESTS_OR_EVIDENCE: API/web provenance, health/fail-closed smoke,
  resolved Calendar version equals explicit approved C1 input (currently 2),
  worker=false, scheduler=PAUSED, prior safe rollback pins.
STOP_IF: Missing authority -> OWNER_DECISION_NEEDED; CI mismatch;
  unapproved drift or Calendar regression.
PASS_IF: New API/web source serves; bounded smoke and runtime read-back PASS.
PR_SCOPE: Source from 01-03; no incidental fixes.
CLOUD_MUTATION: Explicitly approved isolated API/web changes via CLOUD_GATE.
HUMAN_ACTION: Exact authority approval; no login.
CHAIN_STATE_INPUT: SOURCE_GATES, AUTHORITY_SHA, runtime pins.
CHAIN_STATE_UPDATES: AUTHORITY_SHA, API_REVISION, API_IMAGE, PROVENANCE,
  AUTHORITY_REFS.P1-04, EVIDENCE_MANIFEST.
LUNA_PROMPT: Use PHASE1_CONTEXT_CAPSULE + this packet only.
  Execute each CLOUD_GATE prerequisite, prepare reviewable saved-plan/rollback,
  and mutate only after explicit authority. Deploy API/web together once;
  reject stale tfvar worker/image/secret drift. Read back digest/revision,
  Hosting release/expiry and build-source evidence.
```

### P1-05

```text
ID: P1-05
TITLE: One human logout/session E2E
MODEL: LUNA_EASY
TYPE: HUMAN
DEPENDS_ON: P1-04
PARALLEL_WITH: P1-06
GOAL: Prove real browser logout across both layers and fresh authentication.
FILES_TO_READ: P1-01 tests; P1-04 evidence manifest.
FILES_TO_EDIT: Sanitized evidence only.
DO_NOT_TOUCH: Site-data reset, credential export, auth bypass.
STEPS: RUNTIME_WRITE_GATE + HUMAN_GATE; prepare status/boolean-only observer;
  real login -> Workbench -> logout; inspect both layers; fresh Google+TOTP
  must precede re-entry. Reuse that new session for 07 when still valid.
TESTS_OR_EVIDENCE: DELETE success; Firebase currentUser=null; bounded CSRF/role
  absent; revoked record; old __session rejected via protected in-memory probe;
  no cookie output; reload/back cannot rehydrate or auto-create a session.
STOP_IF: Any assertion fails; end human attempt, read evidence and diagnose in 01;
  SOL_REVIEW_IF_TRIGGERED only for protocol/security changes or conflicting evidence.
PASS_IF: All logout assertions PASS; fresh login works.
PR_SCOPE: NONE
CLOUD_MUTATION: NONE; bounded session creation/revocation uses RUNTIME_WRITE_GATE.
HUMAN_ACTION: One login/logout/fresh-login sequence; no token/cookie/CSRF/TOTP paste.
  No blind retry. Agent reads sanitized HTTP/auth-state/revocation evidence.
CHAIN_STATE_INPUT: API_REVISION, PROVENANCE, AUTHORITY_REFS.
CHAIN_STATE_UPDATES: LOGOUT_E2E, AUTHORITY_REFS.P1-05, EVIDENCE_MANIFEST.
LUNA_PROMPT: Use PHASE1_CONTEXT_CAPSULE + this packet only.
  Apply RUNTIME_WRITE_GATE + HUMAN_GATE; prepare non-sensitive observations
  and bounded session-operation authority, without a Terraform saved plan.
  Guide one sequence; verify every assertion including old-session rejection.
  On failure stop; never ask to clear site data as a fix. Arrange 07 in the same
  operator window after successful fresh login. Return only sanitized evidence.
```

### P1-06

```text
ID: P1-06
TITLE: WP-B4 apply and real inbox proof
MODEL: LUNA_NORMAL; SOL_REVIEW_IF_TRIGGERED for unexpected cloud/alerting diff
TYPE: CLOUD
DEPENDS_ON: P1-04; P1-02 evidence PASS
PARALLEL_WITH: P1-05, P1-07
GOAL: Deploy existing alert path and prove one real human notification.
FILES_TO_READ: infra/monitoring/wp-b4-alert-policies.json;
  scripts/wp-b4-alert-definitions.mjs; scripts/stage-f-human-alert-proof.mjs;
  infra/terraform/wp-b4-alerting/{main.tf,variables.tf,README.md}.
FILES_TO_EDIT: Protected local tfvars; sanitized authority/evidence.
DO_NOT_TOUCH: Recipient in repo/chat, budget Pub/Sub, production alerts.
STEPS: Complete CLOUD_GATE; verify signal/policy/channel wiring;
  apply reviewed WP-B4 saved plan; bounded synthetic threshold stimulus ->
  incident -> channel -> inbox via HUMAN_GATE; stop stimulus and confirm recovery.
  Application-API stimuli additionally use RUNTIME_WRITE_GATE.
  Existing proof script is a planner, not an executor.
TESTS_OR_EVIDENCE: Metric/policy/channel read-back, incident ID/time window,
  real inbox receipt. Authz-spike proof must correlate with P1-02 durable events.
STOP_IF: Missing recipient/authority -> OWNER_DECISION_NEEDED;
  absent signal, runaway notifications or timeout.
PASS_IF: Deployed policy and actual inbox evidence correlate to one incident.
PR_SCOPE: Reuse merged source and CI; no new alerting project.
CLOUD_MUTATION: WP-B4 infrastructure under CLOUD_GATE; application-API stimulus
  uses RUNTIME_WRITE_GATE, while direct cloud operations need explicit cloud scope.
HUMAN_ACTION: Check email once in bounded window; report received/time only,
  no address/full message. Timeout stops; agent inspects incident/delivery.
  Retry only after diagnosis and approved correction.
CHAIN_STATE_INPUT: SOURCE_GATES.P1-02, API_REVISION, AUTHORITY_SHA.
CHAIN_STATE_UPDATES: ALERT_PROOF, AUTHORITY_REFS.P1-06, EVIDENCE_MANIFEST.
LUNA_PROMPT: Use PHASE1_CONTEXT_CAPSULE + this packet only.
  Complete CLOUD_GATE using protected recipient input. Review threshold/duration
  and use one bounded synthetic proof. A single log emit alone is not proof of
  incident or delivery. Use HUMAN_GATE for inbox observation and RUNTIME_WRITE_GATE
  for application-API stimuli; correlate incident and receipt, then stop stimulus.
```

### P1-07

```text
ID: P1-07
TITLE: M11 fixed-key synthetic schedule publication
MODEL: LUNA_NORMAL
TYPE: HUMAN
DEPENDS_ON: P1-05
PARALLEL_WITH: P1-06
GOAL: Publish synthetic schedule using real staff session.
FILES_TO_READ: scripts/stage-f-synthetic-schedule-bootstrap.mjs;
  apps/api/src/schedule/schedule.controller.ts; directly referenced publish contract.
FILES_TO_EDIT: Sanitized evidence only.
DO_NOT_TOUCH: Random idempotency key, fake auth, M12.
STEPS: RUNTIME_WRITE_GATE + HUMAN_GATE; inspect schedule version/key state; planner generates
  body; real manager/system_admin same-origin session submits
  POST /v1/schedule/publish with stagef_c1_schedule_publish_v0; read schedule/slots.
TESTS_OR_EVIDENCE: publishedVersion>=1; open-day slots within horizon;
  closed/blocked/occupied behavior; same-key/same-body replay has no duplicate publish.
STOP_IF: Runtime conflicts with expectedVersion=0, different payload already
  bound to key, or session expires; do not change key or overwrite schedule.
PASS_IF: Fixed-key publish and replay proof PASS; M11 explicitly PASS.
PR_SCOPE: NONE
CLOUD_MUTATION: NONE; approved synthetic schedule write uses RUNTIME_WRITE_GATE.
HUMAN_ACTION: Reuse 05 fresh session; authorize one publish plus same-body replay.
  No credentials pasted. Agent reads status/version/idempotency/audit.
CHAIN_STATE_INPUT: LOGOUT_E2E, M10, AUTHORITY_SHA, AUTHORITY_REFS.
CHAIN_STATE_UPDATES: M11, AUTHORITY_REFS.P1-07, EVIDENCE_MANIFEST.
LUNA_PROMPT: Use PHASE1_CONTEXT_CAPSULE + this packet only.
  Apply RUNTIME_WRITE_GATE + HUMAN_GATE, without a Terraform saved plan.
  Planner generates body only; do not pass --execute.
  Submit fixed key with real same-origin staff session and CSRF retained inside
  controlled browser. Verify version, slots and identical replay. Stop on conflict.
```

### P1-08

```text
ID: P1-08
TITLE: M12 bounded worker activation and projection
MODEL: LUNA_NORMAL; SOL_REVIEW_IF_TRIGGERED for unexpected cloud/rollback risk
TYPE: CLOUD
DEPENDS_ON: P1-07, P1-06
PARALLEL_WITH: NONE
GOAL: Align worker source and prove synthetic Calendar projection.
FILES_TO_READ: infra/terraform/c1-internal-test-run/{main.tf,variables.tf,README.md};
  apps/worker/src/{internal-test-outbox-main.ts,internal-test-outbox-runtime.ts,
  outbox-processor.ts}; docs/runbooks/stage-e-operational.md outbox/rollback sections.
FILES_TO_EDIT: Protected local pins; sanitized authority/evidence.
DO_NOT_TOUCH: Production Calendar, events.watch, real data, M10 ACL recreation.
STEPS: Complete CLOUD_GATE; read-only verify M10 applicability and synthetic queue;
  deploy aligned worker with processing enabled but scheduler PAUSED;
  bounded drain succeeds before scheduler resume; controlled retry/replay proof.
TESTS_OR_EVIDENCE: Firestore->outbox->Calendar mapping, no PII, no duplicate event
  on replay/retry, bounded backlog/errors, digest/source;
  resolved Calendar equals explicit approved C1 pin (currently 2).
STOP_IF: Non-synthetic job, ACL failure, error/backlog over approved bounds,
  duplicate projection. Pause scheduler, disable processing, inspect in-flight
  effects; preserve audit/outbox/idempotency. Restore approved digest only as
  authorized and keep processing disabled until corrected.
PASS_IF: Projection/retry/idempotency PASS; scheduler healthy; M12=PASS.
PR_SCOPE: Merged worker source with CI; no live patching.
CLOUD_MUTATION: Worker image/processing, bounded drain and resume under CLOUD_GATE.
HUMAN_ACTION: No additional login.
CHAIN_STATE_INPUT: M10, M11, ALERT_PROOF, worker pins, CALENDAR_SECRET_VERSION.
CHAIN_STATE_UPDATES: WORKER_REVISION, WORKER_IMAGE, PROVENANCE, WORKER_ENABLED,
  SCHEDULER_STATE, M12, AUTHORITY_REFS.P1-08, EVIDENCE_MANIFEST.
LUNA_PROMPT: Use PHASE1_CONTEXT_CAPSULE + this packet only.
  Complete CLOUD_GATE; pre-review maximum jobs/time/errors and rollback.
  Deploy once, perform bounded drain, then resume. Stop/disable on limits;
  account for in-flight effects and preserve evidence. Return projection,
  retry/idempotency and runtime-source proofs.
```

### P1-09

```text
ID: P1-09
TITLE: Strict Phase 1 convergence and closure
MODEL: LUNA_NORMAL; SOL_REVIEW_IF_TRIGGERED for conflicting evidence
TYPE: CLOSURE
DEPENDS_ON: P1-05, P1-06, P1-07, P1-08
PARALLEL_WITH: NONE
GOAL: Prove every item in F and publish a usable closure record.
FILES_TO_READ: Evidence manifest; scripts/internal-preproduction-complete.mjs;
  scripts/stage-f-acceptance-matrix.mjs;
  docs/architecture/stage-f-deployed-acceptance-matrix.md;
  dated Stage F handoff status sections.
FILES_TO_EDIT: Closure/evidence matrix and corresponding handoff status documents.
DO_NOT_TOUCH: Gate weakening, production approval, redeploy solely for docs SHA.
STEPS: Map every F item to artifact/source/runtime; fill only missing targeted
  evidence; require existing inspect AND strict matrix; update/index handoff docs
  using repository handoff procedure, then required CI.
TESTS_OR_EVIDENCE: PROVEN/DEFERRED/TODO per item; existing backup/migration/
  historical-artifact inspect requirements still apply; no unsupported ok=true.
STOP_IF: Missing runtime-write authority, failed feature, provenance mismatch;
  mark TODO:owning packet, continue independent rows; conflicting evidence -> Sol.
PASS_IF: All in-scope PROVEN, valid exclusions DEFERRED, required CI PASS.
PR_SCOPE: Closure documents/evidence only.
CLOUD_MUTATION: NONE; missing infrastructure proof returns to 04/06/08 CLOUD_GATE;
  application writes return to their owning packet's RUNTIME_WRITE_GATE,
  with HUMAN_GATE when human action is required.
HUMAN_ACTION: Reuse 05/07 evidence; any extra action needs exact missing proof
  and one bounded authorized sequence.
CHAIN_STATE_INPUT: Entire CHAIN_STATE and evidence manifest.
CHAIN_STATE_UPDATES: LAST_PR, AUTHORITY_SHA, SOURCE_GATES.P1-09,
  EVIDENCE_MANIFEST, COMPLETION.
LUNA_PROMPT: Use PHASE1_CONTEXT_CAPSULE + this packet only.
  Check every F row. Existing inspect PASS is insufficient; login/logout,
  human notification and M12 cannot be waived. Fill only missing scoped checks.
  Preserve deployed source/digest evidence and demonstrate docs-only delta for
  newer closure SHA. Open closure docs PR; report strict outcome after required CI.
```

## F. FINAL_DEFINITION_OF_DONE

Each item records status, artifact, source SHA, applicable runtime and timestamp.
Allowed statuses only: `PROVEN`, `DEFERRED:<valid authority>`, `TODO:<packet>`.

| Required proof | Evidence owner |
| --- | --- |
| Booking Page uses real isolated backend; patient create/query/reschedule/cancel | 04 / 07 / 09 |
| Staff operations/login/logout, server session, CSRF, RBAC, disabled account enforcement | 01 / 05 / 07 / 09 |
| WP-B2, durable denied audit, fail-closed isolated routes | 02 / 04 / 09 |
| Firestore SoT, idempotency, concurrency, audit, outbox | 02 / 07 / 08 / 09 |
| Schedule, M10, M11, M12, Calendar projection | 07 / 08 |
| Monitoring and real human alert receipt | 06 |
| Resolved Calendar version equals explicit approved C1 pin (currently 2); independent inputs allow authorized rotation; safe saved Terraform plan | 03 / 04 / 08 |
| API/web/worker source -> build -> digest/release -> runtime provenance | 04 / 08 / 09 |
| Exact-head required CI, Verification evidence, indexed handoff/docs | 09 |
| Existing evaluator's backup, migration, Hosting and historical evidence requirements | 09 |

Unit tests do not prove unobserved runtime behavior. Missing authorized runtime
proof returns to its owning packet, not an improvised closure mutation.
Every in-scope item must be PROVEN; only actual excluded scope with valid
authority may be DEFERRED. Existing evaluator AND this strict matrix must pass.

Only then may a future closure claim:

```text
INTERNAL_PREPRODUCTION_COMPLETE = PASS
PRODUCTION_READY = NOT_CLAIMED
PUBLIC_PRODUCTION_LAUNCHED = false
REAL_PATIENT_DATA_AUTHORIZED = false
```

Current completion remains unclaimed. The planning read ran no tests or cloud
operations. This document's commit is located with
`git log -- docs/plans/2026-09-17-phase1-completion-packets.md`, not a self-hash.

## G. SOL_ESCALATION_CONDITIONS

Use `SOL_REVIEW_IF_TRIGGERED` only when:

- A security boundary or auth/session protocol/server revocation semantics changes.
- IAM/resource/alerting diff is unexpected, Terraform contains unrelated mutations,
  or rollback cannot be bounded. An unapproved Calendar :2->:1 always stops.
- Durability semantics cannot be resolved from the current contract.
- Current main contradicts packet assumptions beyond the documented partial
  audit integration, or new delta changes dependencies/safety boundaries.
- Evidence conflicts, including denial durability or disabled-account enforcement.
- Closure proof conflicts with gate semantics; never relax the gate to pass.

Expected-path Luna execution has no mandatory Sol review dependency.

`ASTRA_REQUIRED = 0`, unless the owner changes Phase 1 scope.

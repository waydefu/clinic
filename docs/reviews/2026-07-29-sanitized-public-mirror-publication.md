# Sanitized public mirror publication — 2026-07-29

## Status and decision

The canonical `waydefu/clinic` repository remains private. A separately
curated, code-only reference was published at
<https://github.com/waydefu/appointment-platform-public> from an explicit
allowlist and an independent clean Git history.

The public repository is not an automatic mirror, backup, fork, release branch
or deployment target. It is not authoritative for project status or policy.
Publication does not change Phase 1 Stage 1, close a D-series decision, grant
cloud/deployment authority, establish production readiness or permit real data.
No open-source licence is granted.

## Initial publication identity

| Item | Recorded value |
| --- | --- |
| Public repository | `waydefu/appointment-platform-public` |
| Initial public commit | `4dcc3f43a5d8879ea1d5c8759c7fb1fc86649960` |
| History at initial publication | One root commit, one branch, no private-source history |
| Tracked files at initial publication | 72 |
| Public verification | [successful run 30447698211](https://github.com/waydefu/appointment-platform-public/actions/runs/30447698211) |
| CodeQL | [successful run 30447700486](https://github.com/waydefu/appointment-platform-public/actions/runs/30447700486) |

The earlier publication workspace was not reused after it became unsuitable as
a clean release candidate. Its remote was renamed
`appointment-platform-public-staging-20260729`, kept private and archived.

## Included and excluded scope

The allowlist contains only the appointment command contracts, domain planning
and state transitions, appointment-only audit events, an application repository
port, a health-only API skeleton and synthetic unit tests.

The export excludes:

- clinic website/UI code, brand assets, portraits, screenshots and binary
  assets;
- patient identity intake and jurisdiction-specific identity fields;
- scheduling, follow-up, case-management, payroll and clinic policy;
- authentication-provider, Calendar, database, backup and deployment adapters;
- internal governance, architecture, legal, incident, review and delivery
  documents;
- live identifiers, managed-preview details, private URLs, credentials, logs,
  personal data and private Git metadata/history.

An interface in the public reference does not imply that the excluded
implementation exists, is safe or is production-ready.

## Secret, personal-data and history audit

The following results were recorded against the isolated candidate and then
repeated against a fresh clone of the published repository:

| Gate | Scope | Result |
| --- | --- | --- |
| Manual allowlist and tracked-file review | Every candidate path and public diff | Passed |
| Git topology and metadata | Branches, refs, commits, tags, tracked files and object reachability | Only the clean public root history was present |
| Gitleaks | Complete public Git history | 0 findings |
| TruffleHog | Complete public Git history | 0 verified and 0 unverified findings |
| Personal/internal pattern scan | Taiwan identity and phone shapes, local absolute paths, source-project IDs/brand terms, managed-preview patterns and realistic identities | 0 findings |
| Synthetic-data boundary | Tests and fixtures | Only opaque IDs, `example.invalid` and explicit `PRIVATE_FIELD_SENTINEL_*` values |
| Repository verification | Format, build, lint, public-safety checks and tests | Passed; 14 test files and 164 tests |
| Dependency audit | Production and complete dependency graphs | No known vulnerabilities reported |
| Fresh-clone comparison | Commit, tree, refs and repeated scans | Matched the intended public release |

These zero-result scans are scoped evidence, not a proof that arbitrary future
content is safe. They do not make the canonical private history publishable and
do not remove or rewrite that history.

The filesystem secret scan is intentionally assembled from `git ls-files`.
Ignored package installations and build outputs are not publication artifacts;
their dependency risk is assessed from the committed lockfile and dependency
audits rather than by treating third-party example credentials as repository
secrets.

## GitHub safeguards

At publication time:

- `main` required pull requests, linear squash history, resolved review threads,
  `Public verification` and `CodeQL`;
- default-branch deletion and non-fast-forward updates were blocked;
- workflow actions were pinned to full commit SHAs with read-only default
  permissions;
- secret scanning, push protection, Dependabot security updates and Private
  Vulnerability Reporting were enabled; and
- merge commits and rebase merges were disabled.

The repository owner has an administrative ruleset bypass. It is reserved for
recovery or ruleset maintenance and is not publication approval; normal public
updates must use the pull-request and required-check path.

These controls are defense in depth. A passing workflow is not certification
that the repository is free of vulnerabilities or sensitive information.

## Required gate for every future public update

1. Start from the canonical private change and define a file-level allowlist.
   Export only those paths to an isolated candidate without private `.git`
   metadata.
2. Start from a fresh clone of the public mirror and apply only the approved
   candidate delta. Never push, fork or graft private commits/history.
3. Review every changed path and line for scope creep, identity-like values,
   internal terminology, private URLs, operational identifiers, logs,
   screenshots, assets and documentation.
4. Run the public tracked-secret and public-safety checks, format, build, lint,
   unit tests and both production/full dependency audits.
5. Run Gitleaks and TruffleHog across the complete resulting public Git history,
   plus the explicit personal/internal-pattern scan across tracked files and
   reachable objects/refs.
6. Clone the proposed public branch into another clean directory; verify the
   expected commit/tree/refs and repeat the scanners and repository checks.
7. Commit with a GitHub noreply identity, open a public pull request and require
   both `Public verification` and `CodeQL` before squash merge.
8. Record any material scope or control change here or in a newer dated review.
   If a result is ambiguous, stop publication and keep the candidate private.

Changes flow one way by explicit review. The public mirror must not be merged
back as the canonical project record.

## AI review-technique fit

### GRILL ME

**Recommendation: use for high-impact decisions.** It fits privacy,
authentication/authorization, data boundaries, external integrations,
deployment/rollback and public-release decisions because unresolved ownership,
failure and acceptance questions can materially change the design. Use it
manually and only for unanswered questions; do not reopen recorded decisions
without new evidence.

### PONYTAIL

**Recommendation: conditional, low-risk use only.** A one-time simplification
review can help after correctness and security are proven, but it is unsuitable
for personal data, RBAC, Firestore Rules/transactions, idempotency, audit/outbox,
payroll, backup/incident response, IaC/deployment, legal text or governance.
Do not install it as a persistent hook or allow it to replace explicit safety
logic and evidence.

## Residual limitations

- The public reference is intentionally incomplete and exposes no booking write
  route, database, identity provider or production integration.
- The public checks do not validate the excluded private application.
- The public CodeQL result does not establish that CodeQL upload is available
  for the private canonical repository.
- All future public changes require the complete gate above; the initial audit
  is not reusable approval.

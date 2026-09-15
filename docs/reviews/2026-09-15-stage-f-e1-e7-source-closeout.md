# Stage F E1–E7 source closeout

Dated evidence for `cursor/stage-f-e1-e7-source-f9d6`. Not a deployment.
Not `INTERNAL_PREPRODUCTION_COMPLETE = PASS`. Does not tick owner
APPROVE. Does not supersede PR #131 as executable apply authority.

```text
CLOUD_MUTATION = NONE
STAGE_F_APPLY = NOT_STARTED
AUTHORITY_PACKET = WAITING_FOR_POST_MERGE_SHA
INTERNAL_PREPRODUCTION_COMPLETE = FAIL
PUBLIC_PRODUCTION_LAUNCH = DEFERRED
PRODUCTION_CALENDAR_INBOUND = GO_LIVE_DEFERRED
```

## Baseline at this closeout

- `origin/main` at branch-off: `186f1f9ca7afe2fe03ca55dfaf1326149bfa9919`
  (merge of PR #130 / Stage E).
- PR #131 remains **open** historical Stage F0 evidence. Head
  `20e2633361e09e12fb43fef79e2996a53966e2b8`. Bound
  `AUTHORITY_SHA = 186f1f9…` with
  `APPLY_ON_THIS_SHA = BLOCKED_BY_SOURCE_GAPS`. Do not rewrite that
  packet into a pretend-closed E1–E7 apply.
- This engineering change is the E1–E7 source closeout. It is not the
  post-merge exact-SHA apply packet.

## Closure set

| ID | Terminal state | Notes |
| --- | --- | --- |
| E1 Isolated API Hosting | `FIXED` (source) | `firebase.isolated-api-preview.json` rewrites `/v1/**` to `internal-test-api` / `asia-east1`. Static rollback stays Cloud Run-free. Live `firebase.json` untouched. 404 after intended rewrite = FAIL. |
| E2 Cloud Run Terraform | `FIXED` (source) | `infra/terraform/c1-internal-test-run/`. Default SHA creates zero resources. Staging / wrong region / `:latest` refused. |
| E3 Image / Artifact Registry | `FIXED` (source) | SHA-tagged `internal-test/{api,worker}`. Digest pin required to deploy. AR API enablement is future apply. |
| E4 Cloud outbox worker | `FIXED` (source) | Isolated cloud execution path, synthetic Calendar only, processing-off rollback, no `events.watch`. Unscheduled follow-up does not invent an appointment event. |
| E5 WP-B4 Terraform | `FIXED` (source) | Nine immediate signals, 60s outbox age, Pub/Sub + email channel (address tfvar-only). Not applied. |
| E6 Config contract | `FIXED` (source) | Classified contract, fail-closed readiness, no secret values in git. Secret Manager versions are future apply. |
| E7 Firestore indexes | `FIXED` (source) | Composite indexes + query matrix. Rules remain deny-all. Not deployed. |

Cloud apply, Firebase deploy, API enablement, IAM mutation, monitoring
mutation, Secret Manager versions, DNS, and real patient data stay
`OUT-OF-SCOPE` for this round.

## Authority after merge

Do not invent `AUTHORITY_SHA` while this engineering branch is unmerged.

After owner/authorized workflow merges this engineering:

1. Fresh-resolve `origin/main`.
2. Run `pnpm inspect:stage-f-graph`.
3. Generate the packet as an **artifact bound to that SHA** using
   [stage-f-exact-sha-authority-packet.md](../templates/stage-f-exact-sha-authority-packet.md).
4. `APPLY_ON_THIS_SHA = READY` only if E1–E7 inspect is still `CLOSED`
   on that SHA.
5. Owner checkbox remains `[ ] APPROVE` until the clinic owner signs.

The packet must not be a follow-up `main` commit that moves
`origin/main` off the engineering merge SHA. Preferred: GitHub artifact
or unsigned review attached to the merge commit.
`PACKET_COMMIT_IS_NOT_AUTHORITY_SHA = true`.

## Dry-run graph

build immutable images → Cloud Run plan → worker plan → Firestore
indexes plan → Hosting rewrite plan → WP-B4 plan → config/secret
validation → rollback plan → deployed acceptance plan.

Every step: `execute = false`.

## Human blocker after source closeout

```text
HUMAN BLOCKER
PHASE: Stage F (post E1–E7 source)
DECISION OR RESOURCE: OWNER_EXACT_SHA_CLOUD_MUTATION_APPROVAL_REQUIRED
ONE QUESTION: After this engineering is merged, does the clinic owner APPROVE the new packet bound to that exact origin/main SHA, project beauessence-clinic-stg-c1a01, region asia-east1, preview-only Hosting, synthetic Calendar only?
WHY I CANNOT PROCEED: Safety Floor 8 and exact-SHA apply. This closeout is source only.
WHAT I WILL NOT DO UNTIL ANSWERED: terraform apply, firebase deploy, Cloud Run deploy, API enablement, IAM/Monitoring/Pub/Sub/Secret Manager mutation
SAFE OPTIONS (if any): keep PR #131 historical; regenerate the packet only after merge
```

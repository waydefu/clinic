# INTERNAL_PREPRODUCTION_COMPLETE — 2026-09-14

Dated evidence, not a production grant. `pnpm inspect:internal-preproduction`
returned `ok: true` for isolated C1. D-001–D-005 stay `pending`.
`projectComplete: NOT_CLAIMED`. `dSeriesForged: false`. Laptop Luna playbook
remains `GROK_RESTS` / `LUNA_SOLE_EXECUTOR`.

This file cannot cite its own commit. Lookup: `git log -- docs/reviews/2026-09-14-internal-preproduction-complete.md`.

## 一句話

Squash-merge PR #123 onto `main`, bind three owner packets to that SHA, deploy
the isolated static preview channel, apply only the C5 daily backup schedule and
the C1 IAM SetIamPolicy alert, smoke and inspect, and judge
`INTERNAL_PREPRODUCTION_COMPLETE = PASS`.

## 交付的修訂版本

| Item | Value |
| --- | --- |
| Merge | PR [#123](https://github.com/waydefu/clinic/pull/123) squash-merged 2026-09-14T04:11:41Z |
| `AUTHORIZED_SHA` / `origin/main` | `a9a445a4e9bae83f779a9914bc7203961813f916` |
| Pre-merge branch HEAD | `ebf4cea68baf6753849c32eb257d14429a902433` (tree-identical to the squash) |
| Project | `beauessence-clinic-stg-c1a01` |
| Forbidden | `beauessence-clinic-staging`, live Hosting, production, Cloud Run enablement |
| Operator | `wayde.fu@gmail.com` (gcloud + Firebase CLI; ADC token; `GOOGLE_APPLICATION_CREDENTIALS` unset) |
| Approver | clinic owner |
| Packets | `INTERNAL_TEST_PREVIEW_DEPLOY`, `INTERNAL_TEST_C5_BACKUP_APPLY`, `INTERNAL_TEST_C1_IAM_MONITORING_APPLY` bound to `a9a445a` |

## 驗收證據

Evidence rung: **GATE-VERIFIED** for isolated C1 mutations + inspect; **CI-VERIFIED**
for `a9a445a` `Verification evidence`. Not `DEPLOYED` to live/production. Not
`VERIFIED-PRODUCTION`.

| Gate | Status | Numbers / pointer |
| --- | --- | --- |
| Exact-head CI `verify` on `a9a445a` | `PASS` | Run [34805133378](https://github.com/waydefu/clinic/actions/runs/34805133378); 12/12 jobs success including `Verification evidence`; artifact `commit` = `a9a445a4e9bae83f779a9914bc7203961813f916`; `ref` = `refs/heads/main` |
| `pnpm plan:internal-test-preview` | `PASS` | `execute: false`; channel `internal-preproduction`; config `firebase.isolated-preview.json`; not live |
| Firebase preview channel deploy | `PASS` | Channel id `internal-preproduction`; version `0c39c54909388fd4`; expires `2026-09-21T04:14:28Z`; **live `updateTime` unchanged** `2026-09-13T19:22:42Z` |
| `pnpm inspect:internal-test-hosting` | `PASS` | 2 channels, 1 live, 1 usable preview |
| `pnpm smoke:internal-test-booking` against the **suffix** preview URL | `PASS` | 11/11 probes HTTP 404 (static fail-closed, no Cloud Run rewrite); `/clinic` `/staff` `/booking` HTTP 200 (refuses empty-channel 404 gaming) |
| C5 targeted plan | `PASS` | 1 add, 0 change, 0 destroy — `google_firestore_backup_schedule.daily[0]` only |
| C5 targeted apply | `PASS` | 1 added, 0 changed, 0 destroyed; schedule `190509f6-cc1d-4255-a487-67e1e4b559e6`; retention `2592000s` |
| `pnpm inspect:internal-test-backup` | `PASS` | `asia-east1`, `FIRESTORE_NATIVE`, PITR `604800s`, delete protection on, daily `2592000s` |
| C1 IAM targeted plan | `PASS` | 1 add, 0 change, 0 destroy — `google_monitoring_alert_policy.iam_setiampolicy[0]` only; notify existing budget Pub/Sub `15226239816943508159`; no email recipients |
| C1 IAM targeted apply | `PASS` | 1 added, 0 changed, 0 destroyed; policy `10735229316443092488`; display name `C1 IAM SetIamPolicy` |
| `pnpm inspect:internal-test-monitoring` | `PASS` | metric `c1-iam-setiampolicy`; 1 alert policy |
| `pnpm inspect:internal-test-migration` | `PASS` | empty C1: 0 appointments/slots/follow-ups/legacy CAL-PILOT candidates; did not retarget staging migrate |
| `pnpm inspect:internal-preproduction` | `PASS` | `ok: true`; `humanBlockers: []`; `issues: []` |
| Production terraform / live Hosting / DNS / Calendar | `NOT_RUN` | not in packet; Safety Floor |
| Backup restore / clone | `NOT_RUN` | no restore packet; PITR left on; no in-place restore |
| Real SetIamPolicy firing of the new alert | `NOT_RUN` | inspect proves the policy exists; did not mutate IAM to generate a signal |
| Interactive Auth / TOTP / TW-05 / named reviewers | `NOT_RUN` | HUMAN queue, not stage-blocking |
| `pnpm verify` locally on this handoff commit | `NOT_RUN` | docs-only follow-on; exact-head CI of `a9a445a` already covers the merged product; this record’s `check:docs` is the local gate |

Inspect result (abridged):

```json
{
  "execute": false,
  "ok": true,
  "stage": "INTERNAL_PREPRODUCTION",
  "projectComplete": "NOT_CLAIMED",
  "dSeriesForged": false,
  "humanBlockers": [],
  "issues": []
}
```

### Artifact SHA-256 (session evidence, not in git)

| Path | SHA-256 |
| --- | --- |
| `internal-preproduction-complete-a9a445a.json` | `b80d92b70dea2564376732f95d8897bbdeca4bf7a26b875235e8d78ef23f5454` |
| `internal-preproduction-complete-a9a445a.result.json` | `bb34e7c18e46687e2762866b1b00135efa2ce5038841c41f74466e0cf2c710e6` |
| `ci-verification.json` | `9efe81ca35109abf42b02ac8c33f2438df067319778686ab698c1e9e0a7b9285` |
| `hosting-inspect.json` | `5022f9928ed91138e4b8611a8eb09b4772234312a6579c82bda8752a3b1bf7d4` |
| `backup-inspect.json` | `2f076905c4df15330919efc85b64d4a3029f0df7a31a93b6738237081714dc2f` |
| `monitoring-inspect.json` | `4fb41f9546d9c8a53071257873990a43360791675c702786b5d48c64ffbddf2b` |
| `migration-inspect.json` | `b392e7b5c6d2fd1e06940547d8cc84488f33b49908d70c488dcc6e13e438295f` |
| `smoke-probes.json` | `00a138d677c207cb244c5c7fb3d70c15cf4e4896da81ce9d9a92463a7baf281a` |
| `c5-backup-schedule-apply-a9a445a.txt` | `0cee46ea71f32c568d031b66e8f63443ef7696ff4232cb6329e6e6130334589e` |
| `c1-iam-alert-apply-a9a445a.txt` | `9b0eeb2cfc86dce1afd47640f7a978ac6dfa29d843fecfdba2882e81ab821b94` |
| `firebase-preview-deploy-a9a445a.log` | `bc1afd4d80ebf2b36d27e4a032e3e1c6ef52a41aefd8a04355584306442e713c` |
| `hosting-channels-a9a445a.json` | `8fbda6dbcee9136fbc15a056a364c9e86761a3fec6921913a29d83a793104a42` |

Preview URL actually hosted (Firebase channel suffix):
`https://beauessence-clinic-stg-c1a01--internal-preproduction-3u85hkcz.web.app/`
Channel id remains `internal-preproduction`. Rollback (preview only):
`firebase hosting:channel:delete internal-preproduction --force --project=beauessence-clinic-stg-c1a01 --config=firebase.isolated-preview.json`

Do not destroy the C5/C1 stacks. Do not re-apply with
`exact_apply_authority_sha=not_granted`.

## 稽核範圍與未覆蓋面

Covered: isolated project `beauessence-clinic-stg-c1a01` Hosting channels,
Firestore `(default)` database + daily backup schedule, logging metric
`c1-iam-setiampolicy`, one IAM alert policy, empty-document migration inspect,
unauthenticated HTTP smoke of `/v1/*` on the preview channel, exact-head GitHub
Actions for `a9a445a`.

Not covered: `beauessence-clinic-staging`; production GCP; live Hosting
contents (only `updateTime` read-back); Cloud Run (API disabled on C1);
authenticated booking writes; backup restore drill; alert-policy notification
delivery; interactive Firebase Auth / Google+TOTP; TW-05 AT; named-reviewer
person-names; official DNS.

## 發現的真缺陷

1. **CONFIRMED — canonical preview host is not bound.**
   `https://beauessence-clinic-stg-c1a01--internal-preproduction.web.app/`
   returns Firebase’s generic 404 HTML for `/clinic` and `/v1/*` alike
   (~21 KiB). Completeness smoke on that host would be empty-channel 404
   gaming. The hosted URL is the suffix channel URL from
   `firebase hosting:channel:list`. Static pages on the suffix URL return 200;
   `/v1/*` returns 404. Completeness used the suffix URL. Not a product-code
   defect.
2. **CONFIRMED — Firebase CLI prints the live Hosting URL** even for
   `hosting:channel:deploy`. Live channel `updateTime` stayed
   `2026-09-13T19:22:42Z`. Do not treat the printed `https://beauessence-clinic-stg-c1a01.web.app` as the smoke target.

No product-code fix required.

## 未處理事項

- Interactive patient Firebase Auth / staff Google+TOTP
- TW-05 manual assistive-technology packet
- Named-reviewer person-names (`NAMED_REVIEWER_METADATA_PENDING`)
- D-001–D-005 production/legal ceremony (still `pending`)
- GO_LIVE_DEFERRED: official DNS / custom domain; clinic main-website
  takeover; production Calendar D-009/D-016; real patient data; live Hosting;
  terraform apply to production
- Isolated C1 has no Cloud Run; `/v1` on the preview is static 404 by design
- Preview channel expires 2026-09-21T04:14:28Z
- Backup restore was not exercised
- IAM alert was not live-fired
- This handoff commit is not `a9a445a`; it only records that SHA

## 本機環境陷阱

- gcloud config nickname may be `[clinic-staging]` while **project id** is
  `beauessence-clinic-stg-c1a01`. Always `gcloud config get-value project`.
- Naive `has_run` greps match Permissions-Policy `run-ad-auction`. That is not
  Cloud Run. Isolated preview config has no `run` rewrite.
- `terraform apply` of the whole C1 stack hits the budget
  `billing_account_id` precondition. Target only
  `google_monitoring_alert_policy.iam_setiampolicy`.
- Re-applying with `exact_apply_authority_sha=not_granted` count-gates live C1
  resources to zero. Do not do that. Do not `terraform destroy`.
- Node 24.20.0 via nvm. Do not `pkill -f`. Never `firebase login:ci`.

## 記錄的決策與剩餘風險

- IP-001 remains `INTERNAL_TEST_ROUTE_AUTHORIZED` /
  `PUBLIC_PRODUCTION_ROUTE_NOT_AUTHORIZED`.
- Owner packets for this SHA authorised preview deploy + two targeted applies
  on isolated C1 only.
- Remaining risk: preview expiry; static-only `/v1` 404 is not an API 503 from
  Nest; operators must not smoke live `{project}.web.app` as a substitute.

## 下一位從這裡開始

1. `git fetch origin main && git rev-parse origin/main` — expect `a9a445a`
   until a later merge.
2. Open the suffix preview URL, not the unbound canonical host. Opt-in
   `?internalTestBooking=1` is still fail-closed without Auth.
3. HUMAN: interactive Auth/TOTP on isolated-test surfaces; TW-05; named
   reviewers. Do not paste passwords, TOTP, or tokens into chat.
4. Do not mark D-001–D-005 `approved`. Do not claim `PROJECT_COMPLETE`.
5. Next authorised product work is whatever the register names next — not
   production launch. Luna laptop playbook stays `GROK_RESTS`.

## 目前 Stage 位置是否改變

Yes, for the internal-preproduction **inspect**: `INTERNAL_PREPRODUCTION_COMPLETE = PASS`.
No change to production Stage, D-series rows, or `PROJECT_COMPLETE`.

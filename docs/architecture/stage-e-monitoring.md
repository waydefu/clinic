# Stage E monitoring and operational contract

Status: **engineering complete, not applied.** This file is the human
navigation layer for `packages/domain/src/observability.ts`,
`infra/monitoring/`, and the SHA-gated module
`infra/terraform/wp-b4-alerting`. It is not Cloud Run, Firebase, or
Monitoring apply authority.

```text
HUMAN_NOTIFICATION_PATH = IMPLEMENTED_NOT_DEPLOYED
INTERNAL_PREPRODUCTION_COMPLETE = FAIL
PRODUCTION_CALENDAR_INBOUND = GO_LIVE_DEFERRED
```

## Health

| Path | Meaning | Probe use |
| --- | --- | --- |
| `GET /v1/health` | Process liveness (`{service:'api', status:'ok'}`) | Compatible with existing smoke |
| `GET /v1/health/live` | Process alive | Infrastructure liveness |
| `GET /v1/health/ready` | Process + required config + Firestore not unavailable → 200; otherwise 503 | Readiness. Dead-letter and Calendar lag do **not** fail this |
| `GET /v1/health/operational` | Always 200. Body `healthy` / `degraded` / `unhealthy` plus checks | Humans and Stage F inspect |

Worker `/live` stays 200 when `/health` is `degraded`.

## Signals

Low-cardinality only: route family, stable error code, retry state.
Forbidden as labels: phone, DOB, patient name, appointment free text,
tokens, cookies, session ids.

Immediate WP-B4 thresholds (stricter existing Canon kept for outbox age):

| Alert | Threshold |
| --- | --- |
| HTTP 5xx | ≥ 3 / 5 min (not fail-closed `SERVICE_UNAVAILABLE`) |
| Booking write failures | ≥ 3 / 5 min |
| Auth / authz spike | ≥ 10 / 5 min |
| Dead-letter | > 0 |
| Outbox oldest age | ≥ 60 s |
| Backup failure | ≥ 1 |
| IAM SetIamPolicy | ≥ 1 |

Notification path: alert policy → Pub/Sub `c1-application-alerts` + email
channel → human. Recipient is tfvar/secret only. Do not claim
`HUMAN_NOTIFICATION_PROVEN` until Stage F inbox proof.

Weekday summary is a structured payload
(`pnpm render:weekday-summary`). Stage E does not send email.

## Completeness

Fail-closed API with the gate closed is **503**, never **404**.
Unauthenticated staff/private routes are 401/403. Public booking with the
gate open is accountless create (2xx), not login.

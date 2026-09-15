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

## Framing / CSP

```text
CURRENT_WIDGET_EMBED = DISABLED
FUTURE_WIDGET_EMBED = ARCHITECTURALLY_SUPPORTED_BUT_NOT_AUTHORIZED
```

Current internal-preproduction widget embedding is intentionally disabled by
CSP `frame-ancestors 'none'`.

The absence of a site-wide X-Frame-Options DENY on the widget route preserves
the ability to authorize explicit parent origins in a future integration
change, but does not make the current widget embeddable.

Staff remains non-embeddable: `X-Frame-Options: DENY` and
`frame-ancestors 'none'`. Booking standalone stays non-embeddable for this
stage (`X-Frame-Options: DENY` and `frame-ancestors 'none'`). Isolated CSP
must not trust `beauessence-clinic-staging.firebaseapp.com`, must not use
`frame-ancestors *`, and must not list speculative vendor hosts.

Future vendor integration architecture (do **not** build a second booking
stack; do **not** activate embed in Stage E):

```text
Vendor / clinic marketing website
        │
        ├─ direct link
        │
        └─ approved embed
                │
                ▼
       Booking Widget / Booking Page
                │
                ▼
       Canonical Booking API
                │
                ▼
       Firestore source of truth
```

When embedding is actually authorised, the change must use an explicit
allowlist conceptually:

```text
frame-ancestors 'self' https://approved-clinic-or-vendor-origin.example
```

Exact production hostname must not be invented now. Activation requires a
confirmed embedding origin, security review, CSP regression tests,
iframe/widget E2E, and explicit deployment authority.

# Stage E monitoring / security / operational readiness

Dated evidence for `cursor/stage-e-monitoring-f9d6`. Not a deployment.
Not `INTERNAL_PREPRODUCTION_COMPLETE = PASS`.

```text
INTERNAL_PREPRODUCTION_COMPLETE = FAIL
PUBLIC_PRODUCTION_LAUNCH = DEFERRED
PRODUCTION_CALENDAR_INBOUND = GO_LIVE_DEFERRED
HUMAN_NOTIFICATION_PATH = IMPLEMENTED_NOT_DEPLOYED
```

## Scope

Application observability, WP-B4 alert definitions, CSP/header hygiene,
PII-safe structured logs, operational runbooks, reproducible evidence
tooling, completeness semantics (404 ≠ fail-closed PASS). No Cloud Run,
Firebase, or GCP apply. No production Calendar. No real patient data.

## WP-B6 historical artifacts

The twelve SHA-256 values in
[2026-09-14-internal-preproduction-complete.md](2026-09-14-internal-preproduction-complete.md)
remain the originals. `pnpm inspect:historical-artifacts` searches
`/opt/cursor/artifacts` and `output/evidence`. Missing originals are
`HISTORICAL_ARTIFACTS_LOST` plus `NEW_EVIDENCE_SET`. New files must not
reuse those names.

## Framing / CSP closeout

```text
CURRENT_WIDGET_EMBED = DISABLED
FUTURE_WIDGET_EMBED = ARCHITECTURALLY_SUPPORTED_BUT_NOT_AUTHORIZED
```

Current internal-preproduction widget embedding is intentionally disabled by
CSP `frame-ancestors 'none'`.

The absence of a site-wide X-Frame-Options DENY on the widget route preserves
the ability to authorize explicit parent origins in a future integration
change, but does not make the current widget embeddable.

Staff remains `X-Frame-Options: DENY` plus `frame-ancestors 'none'`. Booking
standalone remains non-embeddable for this stage. Isolated CSP still omits
`beauessence-clinic-staging.firebaseapp.com`. No `frame-ancestors *`. No
speculative vendor host. Future activation requires an explicit
`frame-ancestors` origin allowlist, security review, CSP regression tests,
iframe/widget E2E, and deployment authority — not Stage E.

Do not read `denyFrame: false` on `/widget` as “iframe permitted”. CSP
`frame-ancestors` is authoritative for modern browsers.

## What Stage F still owes

Exact-SHA authority, isolated API deploy, Hosting rewrite, monitoring
apply, one human inbox proof, deployed E2E, backup inspect, final
completeness inspect.

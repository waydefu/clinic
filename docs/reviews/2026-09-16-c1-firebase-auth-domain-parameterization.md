# Stage F C1 Firebase authDomain parameterization

Dated evidence for `cursor/c1-firebase-auth-domain-parameterization-f9d6`.
Not a deployment. Not OAuth mutation. Not Identity Platform mutation.
Does not tick owner APPROVE. Does not enter M11 or M12.

```text
CLOUD_MUTATION = NONE
SOURCE_MUTATION = AUTH_DOMAIN_PARAMETERIZATION
OLD_AUTHORITY_SHA = 950d346d00c4d5dcaac985b1df4e931cd6eb3cd6
FUTURE_CLOUD_MUTATIONS_UNDER_NEW_SOURCE = NOT_AUTHORIZED
EXPECTED_FUTURE_AUTH_DOMAIN =
beauessence-clinic-stg-c1a01--internal-preproduction-3u85hkcz.web.app
EXPECTED_FUTURE_REDIRECT_URI =
https://beauessence-clinic-stg-c1a01--internal-preproduction-3u85hkcz.web.app/__/auth/handler
INTERNAL_TEST_OUTBOX_PROCESSING_ENABLED = false
SCHEDULER = PAUSED
M10_CALENDAR_ACL = PASS
M11_SCHEDULE_PUBLISH = BLOCKED
M12_WORKER_ENABLE = NOT_STARTED
INTERNAL_PREPRODUCTION_COMPLETE = FAIL
PUBLIC_PRODUCTION_LAUNCH = DEFERRED
PRODUCTION_CALENDAR_INBOUND = GO_LIVE_DEFERRED
```

This document cannot cite its own commit hash. Lookup:
`git log -- docs/reviews/2026-09-16-c1-firebase-auth-domain-parameterization.md`.

## Baseline

Fresh `origin/main` at branch-off:
`950d346d00c4d5dcaac985b1df4e931cd6eb3cd6`.

Staff Google login diagnosis on the isolated preview isolated the
failure at Firebase redirect completion: Google consent PASS, return to
preview PASS, Identity Platform user created NO, `getRedirectResult`
NULL_OR_ERROR, `auth.currentUser` NULL, TOTP NOT_REACHED,
`POST /v1/calendar-session` NOT_REACHED.

App origin:

`https://beauessence-clinic-stg-c1a01--internal-preproduction-3u85hkcz.web.app`

Deployed `authDomain` was `beauessence-clinic-stg-c1a01.firebaseapp.com`
because Terraform hardcoded
`CALENDAR_PILOT_FIREBASE_AUTH_DOMAIN = "${var.project_id}.firebaseapp.com"`.

CSP on `/staff` was not changed. `require-trusted-types-for 'script'`
and `frame-ancestors 'none'` stay. No wildcard `connect-src`.

## Source change

`infra/terraform/c1-internal-test-run` now takes explicit non-secret
`firebase_auth_domain`. Empty is allowed only for the default
`exact_apply_authority_sha = not_granted` no-op. Apply fails closed
unless the value is the exact authorized isolated Hosting host (no
scheme). `firebaseapp.com`, `beauessence-clinic-staging`, official
`beauessence.com.tw` hosts, production domains, wildcards, schemes, and
arbitrary hosts are refused. Runtime does not infer authDomain from the
request `Host` header.

`infra/config/c1-internal-test-config-contract.json` still classifies
`CALENDAR_PILOT_FIREBASE_AUTH_DOMAIN` as `NON_SECRET_CONFIG`,
`requiredFor = api`, `cloudRequired = true`. No secret is added.

TOTP, staff allowlist, CSRF, RBAC, accountless public `/booking`, M10
Calendar config, worker processing false, and paused scheduler are
unchanged.

## Future cloud mutation (documented, not executed)

After this source merges, old exact-SHA authority `950d346…` is invalid
for leftover mutations. A later packet on the new `origin/main` SHA
would still need owner APPROVE. That future packet, if authorized, must:

1. Add
   `https://beauessence-clinic-stg-c1a01--internal-preproduction-3u85hkcz.web.app/__/auth/handler`
   to Authorized Redirect URIs on existing OAuth client
   `clinic-c1-internal-preproduction-staff`. The JavaScript origin for
   the preview host is already present.
2. Apply C1 API runtime
   `CALENDAR_PILOT_FIREBASE_AUTH_DOMAIN=beauessence-clinic-stg-c1a01--internal-preproduction-3u85hkcz.web.app`.

Do not execute those steps from this engineering PR. Do not terraform
apply. Do not deploy. Do not change Identity Platform. Do not merge
automatically.

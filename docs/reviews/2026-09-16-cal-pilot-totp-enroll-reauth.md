# Stage F C1 TOTP enrollment reauthentication

Dated evidence for `cursor/fix-totp-enroll-reauth-f9d6`.
Not a deployment. Not OAuth mutation. Not Identity Platform mutation.
Does not reset MFA, delete the human test user, or alter the allowlist.
Does not tick owner APPROVE. Does not enter M11 or M12.

```text
CLOUD_MUTATION = NONE
SOURCE_MUTATION = TOTP_ENROLL_REAUTH
AUTHORITY_SHA = 5ea2fa2c6b81164fc75b46adf7b35398b7f5f95d
SERVER_TOTP_CLAIM_REQUIREMENT_CHANGED = false
INTERNAL_TEST_OUTBOX_PROCESSING_ENABLED = false
SCHEDULER = PAUSED
M10_CALENDAR_ACL = PASS
M11_SCHEDULE_PUBLISH = BLOCKED
M12_WORKER_ENABLE = NOT_STARTED
INTERNAL_PREPRODUCTION_COMPLETE = FAIL
```

This document cannot cite its own commit hash. Lookup:
`git log -- docs/reviews/2026-09-16-cal-pilot-totp-enroll-reauth.md`.

## Root cause

TOTP enrollment persisted on the Identity Platform account, but the
enrollment session was immediately exchanged for a server session.
That ID token does not prove `firebase.sign_in_second_factor === 'totp'`.
`POST /v1/calendar-session` therefore returned 401
`AUTHENTICATION_REQUIRED`. The login UI then restored the same
first-factor Firebase user from IndexedDB, repeating the exchange.

## Fix

After `factors.enroll(...)` the client signs Firebase Auth out, clears
only `calPilotCsrf` / `calPilotRole`, and shows the login card with an
explicit reauthentication instruction. It does not call `getIdToken` or
`POST /calendar-session` on the enrollment session, and it does not
start a Google redirect until the human clicks.

When `POST /calendar-session` returns `AUTHENTICATION_REQUIRED`, the
client signs out the stale first-factor user and shows recovery copy.
Already-enrolled accounts recover with the current Authenticator code;
no new QR enrollment is required.

## Security

`tokenHasTotpSecondFactor` and
`decoded.firebase.sign_in_second_factor === 'totp'` are unchanged.
Enrolled factor count is not an authorization signal. The backend
remains the authority for session creation.

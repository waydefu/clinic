# API Service

The NestJS/Fastify API is the single HTTP and business-write boundary.

Phase 0 exposes only `GET /v1/health`; it does not connect to Firebase,
Calendar, email, social channels or NAS. Booking routes are reserved as schemas
only until the privacy, authentication, service-capacity and cancellation-policy
gates are resolved.

Before adding a write route, update `packages/contracts` and
`packages/domain`, then implement and test authentication, authorization,
validation, idempotency, transaction behavior and an audit event.

## Test-only local harness

When `ENABLE_TEST_ONLY_BOOKING=true` is explicitly set before startup, the API
loads a synthetic in-memory `/v1/test-only/*` harness for the local browser
prototype. It has no patient/contact fields, Firestore connection, Calendar
call or external side effect, and it enables CORS only for
`http://127.0.0.1:3100`. The module is absent when the flag is unset; it is not
a public or production booking route.

# API Service

The NestJS/Fastify API is the single HTTP and business-write boundary.

Formal booking **public production** routes remain unauthorised.
The Stage 1 `AppModule` registers `GET /v1/health`, the Decision
Register's CAL-PILOT surface (`/v1/calendar-session`, `/v1/calendar`),
and IP-001 `InternalTestBookingModule`. `/v1/bookings` is fail-closed
(HTTP 503) unless `INTERNAL_TEST_BOOKING_ENABLED=true`, a future UTC
expiry, and the isolated project `beauessence-clinic-stg-c1a01` or the
Firestore emulator are set. That is not a production booking route,
production Calendar, or general cloud authority. Production D-009/D-016
stay pending.

Before adding a write route, update `packages/contracts` and
`packages/domain`, then implement and test authentication, authorization,
validation, idempotency, transaction behavior and an audit event.

The completed Stage 0 baseline includes an unrouted application-service
boundary under `src/appointments`: a server-owned authentication context,
authorization policy port, repository port and explicit contract-to-domain
mapper. D-006 identity/security policy is approved, but no real identity
provider, session enforcement or production role mapping is implemented;
`AppModule` registers `AppointmentController` only through
`InternalTestBookingModule` (IP-001). Public production booking stays
unauthorised. CAL-PILOT must not be read as production Calendar authority.

The process binds to `127.0.0.1` by default. Any non-loopback `HOST` requires
the exact, separate `ALLOW_NON_LOOPBACK_BIND=true` opt-in. That opt-in never
permits a non-loopback bind while `ALLOW_UNAUTHENTICATED_ROUTES=true`; an
unauthenticated route remains loopback-only.

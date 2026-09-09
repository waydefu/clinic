# API Service

The NestJS/Fastify API is the single HTTP and business-write boundary.

Formal booking routes remain unrouted. The Stage 1 `AppModule` registers
`GET /v1/health` and the Decision Register's CAL-PILOT surface
(`/v1/calendar-session`, `/v1/calendar`): an expiring, synthetic-only
Google+TOTP exception. That exception is not a production booking route,
production Calendar, production Auth, or general cloud authority. Production
D-009/D-016 stay pending. Formal booking schemas stay reserved until the
privacy, authentication, service-capacity and cancellation-policy gates are
resolved.

Before adding a write route, update `packages/contracts` and
`packages/domain`, then implement and test authentication, authorization,
validation, idempotency, transaction behavior and an audit event.

The completed Stage 0 baseline includes an unrouted application-service
boundary under `src/appointments`: a server-owned authentication context,
authorization policy port, repository port and explicit contract-to-domain
mapper. D-006 identity/security policy is approved, but no real identity
provider, session enforcement or production role mapping is implemented;
`AppModule` does not register `AppointmentController`. Any future formal
booking work follows the plan-only
[Stage 2 change plan](../../docs/architecture/stage-2-identity-and-cloud-change-plan-2026-07-28.md)
and still requires separate change/deployment authority. CAL-PILOT must not be
read as that authority.

The process binds to `127.0.0.1` by default. Any non-loopback `HOST` requires
the exact, separate `ALLOW_NON_LOOPBACK_BIND=true` opt-in. That opt-in never
permits a non-loopback bind while `ALLOW_UNAUTHENTICATED_ROUTES=true`; an
unauthenticated route remains loopback-only.

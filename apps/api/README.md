# API Service

The NestJS/Fastify API is the single HTTP and business-write boundary.

Phase 0 exposes only `GET /v1/health`; it does not connect to Firebase,
Calendar, email, social channels or NAS. Booking routes are reserved as schemas
only until the privacy, authentication, service-capacity and cancellation-policy
gates are resolved.

Before adding a write route, update `packages/contracts` and
`packages/domain`, then implement and test authentication, authorization,
validation, idempotency, transaction behavior and an audit event.

Stage 0 includes an unrouted application-service boundary under
`src/appointments`: a server-owned authentication context, authorization
policy port, repository port and explicit contract-to-domain mapper. No real
identity provider or role values are implemented while D-006 is pending, and
`AppModule` still registers only the health controller.

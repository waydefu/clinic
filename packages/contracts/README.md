# Contracts Package

Versioned Zod schemas and inferred TypeScript DTOs shared by API, worker and
web code. `docs/architecture/api-v1-contract.md` is the human-readable map.

Schemas must minimise patient data and reject unexpected free-text fields. They
are not an authorization mechanism: the API service still owns authentication,
role checks, idempotency and audit behavior.

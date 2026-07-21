# ADR-0003: Direct Firestore Client Access Is Deny by Default

Status: Accepted for Phase 0  
Date: 2026-07-20

## Context

The platform handles appointment contact data, policy acceptances, case
assignments and payroll credits.  Direct browser/mobile access to Firestore
would multiply the authorization paths that need to protect those records.

## Decision

`firestore.rules` denies every direct client read and write.  The API service
is the single business-write boundary.  Server-side Firestore access must still
be protected by API authentication, authorization, validation, audit and
transaction logic; Admin SDK privilege is not permission to bypass those
controls.

## Consequences

- The public booking site and future apps call versioned API endpoints.
- Rules tests begin from denied access rather than accidental open access.
- A future direct client read path requires a new ADR, explicit collection
  allow-list, Rules tests and privacy review.

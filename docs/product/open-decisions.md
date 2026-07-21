# Open Product Decisions

Status: Superseded for active tracking by
`docs/product/phase-1-decision-register.md`. This document preserves the
original decision categories that must not be guessed in implementation.

## Original decision categories

| Category | Decision needed | Current handling |
| --- | --- | --- |
| Booking operation | Services, resources, duration, capacity, booking horizon and blackout periods | Do not implement a real slot policy. |
| Completion | Definition of `completed`, authorised roles and correction process | Domain permits only authorised clinic roles; final role matrix is pending. |
| Case management | Assignment, reassignment, patient merge and exception evidence | No automatic merge or unreviewed reassignment. |
| Payroll | Metric, rule version, month-close owner and adjustments | Default deterministic credit key exists; final finance rule is pending. |
| Cancellation | Cutoff, patient/admin flow, no-show handling and fees | The domain receives a resolved cutoff; no policy value is embedded. |
| Patient communication | Appointment notice channels and content | No SMS in scope; do not add email/social delivery without approval. |
| Calendar | Owner, selected calendar, authorization model, scopes and recovery SOP | Calendar remains a future projection only. |
| Privacy | Legal controller, contact, retention, vendor/data region and published text | The policy is a draft and cannot receive a real acceptance. |
| Environments | Local, staging, production ownership, IAM, backups and monitoring | Local Emulator only; no cloud environment is configured. |
| NAS | Purpose, data contract, protocol, access model and retention | Deferred; requires an ADR and security review. |
| Public UX | Booking URL, language/accessibility needs and manual fallback | Pending clinic operations approval. |

## Rule for implementation

An unanswered decision is not a default. Record the approved answer, owner,
date, evidence and implementation follow-up in the Phase 1 decision register
before creating policy-dependent behavior.

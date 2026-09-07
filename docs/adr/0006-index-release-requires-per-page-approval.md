# ADR-0006: Index Release Requires Per-Page Publication Approval

Status: Draft for review in WEB-P0-01; takes force on merge
Date: 2026-09-07

## Context

`WEB_PUBLIC_INDEXABLE=true` was sufficient to strip `noindex` from every page
marked `indexable` in `apps/web/public-pages.json`. The `/privacy` page is
still an unapproved draft (D-003 pending), yet it was marked `indexable` and
listed in `sitemap.xml`. The execution plan and the synthetic-preview runbook
already require route-specific approval: no global switch may substitute for
per-page publication approval, and the draft must stay `noindex` and out of
the sitemap until the policy authority exists.

## Decision

Publication is a per-page canonical decision, not a global flag:

- `indexAllowed = globalPublicIndexRelease AND pageIsIndexEligible AND
  requiredPolicyApprovalSatisfied`.
- `public-pages.json` keeps `indexable` as technical eligibility and adds an
  optional `requiresDecision` (a `D-NNN` id) as the policy-approval
  requirement. Absence of approval closes the page; nothing defaults open.
- Approval state is read from the decision register, which remains the sole
  Canon for D-series status. The build reads it; it never writes it.
- `sitemap.xml` and `<meta name="robots">` derive from the same decision.
  An approved page missing from the sitemap template fails the build instead
  of shipping an inconsistent release.

## Consequences

- `/privacy` stays `noindex` and out of the sitemap while D-003 is pending,
  even with `WEB_PUBLIC_INDEXABLE=true`. This ADR does not approve D-003 and
  changes no policy text.
- A future indexable page that needs policy approval must declare
  `requiresDecision`; a reference to an unknown decision id fails
  `check:pages`.
- Preview builds (no release switch) remain fully `noindex` with an empty
  release sitemap, as before.

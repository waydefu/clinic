# Clinic website integration delivery — 2026-07-27

Status: delivered to the authorised expiring synthetic preview. This is dated
delivery evidence, not production-launch approval.

## Delivered revision

| Field | Value |
| --- | --- |
| Git branch | `agent/clinic-site-integration` |
| Deployed commit | `aea12d44cfb5f4cfa1c7733dce449dff5602b69c` |
| Firebase project | `beauessence-clinic-staging` |
| Hosting channel | `synthetic-review` |
| Preview URL | `https://beauessence-clinic-staging--synthetic-review-gpt86j36.web.app` |
| Expires | 2026-08-03 16:34:32 Asia/Taipei |
| Live channel | Not deployed |

The deployment was built from a detached clean worktree at the commit above.
The main workspace's pre-existing uncommitted changes to shared UI, privacy and
test files were not included.

## Delivered scope

- responsive clinic home at `/clinic`;
- medical-team list and two doctor profiles;
- four nasal-functional-medicine pages;
- no plastic-surgery, injectable or medical-aesthetic category routes;
- a shared white, mist-green and deep-forest visual direction;
- clinic navigation and appointment calls to action connected to `/booking`;
- the existing patient booking interface restyled through a token-based
  override layer without changing its state machine or validation; and
- README, documentation map, route contract, performance budget and browser
  regression coverage updated with the implementation.

## Verification evidence

### Repository gates

`corepack pnpm verify` passed against the final source:

- structure, architecture, UI guard, design tokens, documentation links,
  tracked-secret scan, formatting, ESLint, TypeScript build and vendored-domain
  sync passed;
- all five HTML entry points have explicit performance budgets; and
- 42 unit-test files passed, 513 tests in total.

The same gate passed again from the detached deployment worktree. That worktree
reused the main workspace's already verified dependency installation because a
fresh pnpm install correctly refused an unapproved `re2` build script. No
supply-chain policy was weakened and no dependency or lockfile was changed.

### Browser gates

Final targeted Playwright runs passed:

- all eight clinic routes render a single expected `h1`, expose a booking link
  and retain the visible test title boundary;
- clinic home scope, mobile menu, `Escape` handling and `/booking` handoff
  passed;
- clinic, booking and workbench layouts passed at 1280, 1025, 1024, 769, 768,
  481, 480, 390 and 320 CSS px without horizontal page overflow; and
- six axe scans passed with no serious or critical findings, covering clinic
  home, a nasal-functional-medicine detail page, patient booking, privacy,
  workbench login and the signed-in workbench.

The first nasal-detail axe run identified a 4.43:1 muted-text contrast against a
4.5:1 requirement. The shared muted colour was darkened and the complete
six-page axe run then passed.

### Online preview

`corepack pnpm verify:preview` passed 439 of 439 checks against the channel URL.
Additional live HTTP checks confirmed `200`, the expected clinic or booking
entry document, and `X-Robots-Tag: noindex` for `/booking` plus all eight
`/clinic` routes.

Firebase reported that it could not synchronise the channel domain to Firebase
Authentication. This is expected and non-blocking: the synthetic preview does
not enable Firebase Authentication, a backend, a cloud database or a real
patient-data path.

## Retained safety boundary

The preview remains static, expiring and noindex. Clinic information pages
collect no data. The booking form stores synthetic values only in the visitor's
browser and must not receive real patient data. No production Firebase Hosting
release, Firestore route, authentication, Calendar integration or external
patient-data transmission was enabled.

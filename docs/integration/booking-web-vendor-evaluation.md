# Booking Web Vendor Evaluation Package

## 1. Integration objective

The production user journey is intended to remain on the clinic's official
website:

- Official reservations page: <https://beauessence.com.tw/reservations/>
- Vendor evaluation route: `/booking` **only**
- Current C4 preview URL:
  <https://beauessence-clinic-staging--synthetic-review-xvqa68cx.web.app>
- Current C4 preview expiry: **2026-08-29 16:10:26 Asia/Taipei**
  (`2026-08-29T08:10:26.405373913Z`)
- Exact deployed C4: `b3bc47721aaf2ca8de89ed62159dd7461d0eae30`
- Hosting release/version: `1787386261863000` / `11f4ad12b13c1512`
  (`FINALIZED`)
- Online verification: **PASS — 474/474 repository-defined checks**

The C3 deployment (`d9b6965c0e3ae62df33e89744f12c6d7fcc16480`)
at the previously published `synthetic-review-xvqa68cx` URL, plus candidate C
and C2, are historical evidence. None may be presented as the current vendor
handoff because C4 changes the patient and workbench behavior.

The preview is for layout, interaction and technical evaluation only. It is
`noindex`, uses synthetic browser-local state and must never receive real
patient or health data.

> **SYNTHETIC TEST ONLY — DO NOT ENTER REAL PATIENT DATA.** The link is public
> to anyone who has it and expires automatically; it is not a production
> booking service.

## 2. Recommended integration

**Recommendation: Widget + API**, delivered as a first-party component within
the official `/reservations/` page and connected to a future clinic-owned API.
This keeps the experience, navigation, accessibility and analytics under the
official site while preserving the system rule that all booking writes cross a
server API boundary.

The API does not yet exist as a production endpoint. This package defines the
integration shape; it does not hand over a live API or production credential.

| Model | Status | Vendor responsibility |
| --- | --- | --- |
| API-only | Supported target | Build and own the complete official-site UI, error/loading states and accessibility; call only the future clinic API. |
| Widget + API | **Recommended target** | Mount the clinic-approved first-party booking component on `/reservations/`; own its host container, navigation and release coordination. |
| iframe | Future fallback only | Requires a separately designed embed surface and an explicit security/header decision. The current preview cannot be embedded. |

## 3. Preview evaluation

Use only the exact-C4 URL and expiry recorded above. The vendor-facing route is
only:

- `/booking` — patient Booking Preview and the source reference for the future
  official `/reservations/` surface.

The reference interaction is a three-step flow: type and service; month/date
selection with only available dates and non-empty 上午／中午／晚間 groups; then
two semantically grouped patient-information sections. Success is a result
after Step 3, not a fourth step. The synthetic booking horizon is 60 days and
is enforced by the command path, not just hidden in the UI. The separate
query/cancel dialog requires phone plus birth date or identity-document number
plus birth date; it does not support one-field lookup. In this synthetic MVP,
direct self-cancellation is available only when the appointment is strictly
more than 20 minutes away. At 20 minutes or less it makes the clinic telephone
`02-2577-1314` primary and also offers the published LINE, Instagram, Messenger
and Facebook contacts, with an explicit warning that social messages are not
immediate and do not automatically cancel a booking.

These interactions are evaluation behavior, not an approved production policy
or API contract. D-005 remains pending, and the production implementation must
obtain the clinic's approved cancellation window, identity controls, server
time and audited API transition before release.

The synthetic staff workbench, Case workflow, doctor pages, clinic pages and
other internal or public repository routes are not part of this vendor
evaluation package. `/clinic` remains frozen and must not be used as an active
handoff route.

Expected preview markers:

- `LOCAL TEST ONLY` on `/booking` and a warning not to enter real patient or
  health data.
- `noindex` response/meta policy on the preview.
- Data isolated to the current browser. Different browsers do not share state;
  clearing site data resets it.

For technical questions, route decisions and acceptance results through the
clinic owner/repository owner. Do not exchange credentials in this document or
in screenshots. Record the tested URL, route, browser/viewport and exact time
when reporting an issue.

## 4. Host-page and frontend expectations

### Route and navigation

- The official public entry is `/reservations/`; do not expose implementation
  filenames such as `patient.html`.
- Preserve a clear return path to the clinic website and normal browser
  Back/Forward behavior.
- The host owns canonical URL, production indexing approval, analytics/consent
  decisions, global navigation and the not-found route.

### Container and responsive behavior

- Provide a full-width content container that can reflow down to 320 CSS px.
- Do not impose a fixed iframe-style height or nested scrolling region. Booking
  steps, validation summaries and confirmations change height.
- Do not clip focus rings, dialogs, status messages or 200% text zoom. Avoid a
  host CSS reset that overrides component controls or design tokens.
- Test mobile portrait, tablet and desktop widths with no horizontal page
  overflow.

### Accessibility

- All actions must remain keyboard-operable with visible focus.
- Preserve programmatic labels, headings, error associations, live status
  announcements and a skip path to the booking content.
- Loading, unavailable, validation and submission failures must be expressed in
  text and remain associated with the affected control; color alone is not a
  status.
- Automated accessibility checks do not replace the clinic's manual keyboard,
  zoom, forced-colors and screen-reader acceptance.

### Loading and errors

- Reserve stable space for initial loading to avoid layout shifts.
- Distinguish no available slots, temporary API failure, validation failure,
  stale/reserved slot conflict and successful completion.
- Never convert an unknown or failed state into an apparently successful
  booking. Submission controls must prevent accidental duplicate commands while
  a request is pending.

## 5. iframe and security limitation

The current Firebase preview sends both:

```text
X-Frame-Options: DENY
Content-Security-Policy: …; frame-ancestors 'none'; …
```

It therefore **cannot be embedded in an iframe**. Do not point an iframe at the
preview URL. An iframe fallback would require a dedicated delivery surface,
explicitly allowed parent origin, reviewed CSP/cookie/session/message behavior,
responsive height coordination and separate security acceptance.

## 6. Data and API boundary

- Current preview state is synthetic and stored only in browser `localStorage`.
- No production API endpoint, database, credential or service account is part
  of this handoff.
- The browser must never access Firestore directly.
- Future production browser traffic must call the clinic backend API; domain
  state and server-side transactions remain booking authority.
- Calendar is an operational projection, not availability source, lock or
  booking transaction authority. External effects follow transaction → outbox
  → worker.

Do not send or request secrets, internal credentials, service-account details,
real PII, production Firebase configuration, a full repository archive or an
expired preview URL. Payload measurements are supplied separately in
[Booking frontend payload report](booking-frontend-payload-report.md).

## 7. Production domains and responsibility matrix

These names define the target handoff; PR #24 does not create DNS records,
certificates, API infrastructure or CORS policy.

- Primary patient experience: <https://beauessence.com.tw/reservations/>
- Future production API target: <https://api.beauessence.com.tw>
- Optional isolated/fallback booking host: <https://book.beauessence.com.tw>
  (not the primary journey and not required for Widget + API)

| Surface/control | Accountable party | C4 handoff state |
| --- | --- | --- |
| `/reservations/` route and host-page navigation | Website vendor | Mount point specified; no official-site change made here. |
| Clinic-approved Booking Widget artifact | Clinic product/repository owner + website vendor | Vendor evaluates `/booking`; production packaging remains a later release. |
| `beauessence.com.tw` and subdomain DNS | Clinic/domain administrator | No DNS change made. Create API/optional booking records only after a real target is approved. |
| TLS certificates and renewal | Production hosting/API platform + clinic/domain administrator | Not provisioned by this preview; verify complete chains and automated renewal before production. |
| API deployment and server-side booking authority | Clinic backend owner | Future target only; no production endpoint or credential exists in this package. |
| CORS response policy | Clinic backend/security owner | Future API must use an explicit approved-origin allowlist; the website vendor supplies the final required origins. |

Initial production-origin candidates are
`https://beauessence.com.tw` and `https://www.beauessence.com.tw`. If the
optional booking host is approved, add `https://book.beauessence.com.tw`
explicitly. Do not use wildcard origins, reflect arbitrary request origins or
mix staging origins into production. Credential/cookie use, allowed methods,
headers, preflight cache, CSP `connect-src` and CSRF/session design require a
separate backend security decision and real endpoint tests.

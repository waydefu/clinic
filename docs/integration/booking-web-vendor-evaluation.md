# Booking Web Vendor Evaluation Package

## 1. Integration objective

The production user journey is intended to remain on the clinic's official
website:

- Official reservations page: <https://beauessence.com.tw/reservations/>
- Current synthetic preview route: `/booking`
- Preview URL: **PENDING DEPLOYMENT**
- Preview expiry: **PENDING DEPLOYMENT** (the authorized preview will expire
  after seven days)

The preview is for layout, interaction and technical evaluation only. It is
`noindex`, uses synthetic browser-local state and must never receive real
patient or health data.

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

Use the current preview only after the verified URL replaces `PENDING
DEPLOYMENT`. The relevant routes are:

- `/booking` — patient Booking Preview.
- `/` — synthetic staff workbench used to check the shared booking lifecycle.
- `/privacy` — draft, test-only privacy page.
- `/clinic` — frozen reference surface; it is not part of the vendor change
  scope.

Expected preview markers:

- `LOCAL TEST ONLY` on `/booking` and a warning not to enter real patient or
  health data.
- `ONLINE PREVIEW` on the workbench and a warning that anyone with the URL can
  access it.
- `noindex` response/meta policy on every preview route.
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

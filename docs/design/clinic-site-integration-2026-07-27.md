# Clinic website and booking integration — 2026-07-27

Status: implemented for the expiring synthetic preview. This document records
the presentation and routing boundary; it does not approve a production launch
or change any Phase 1 decision.

## Outcome

The static preview now presents one coherent public journey:

1. visitors enter at `/clinic`;
2. they can read the medical-team and nasal-functional-medicine pages;
3. every appointment call to action goes to the existing `/booking` flow; and
4. the booking page links back to the clinic home and medical team.

The clinic pages and patient booking share a white, mist-green and deep-forest
visual language. The booking application keeps its existing state machine,
validation, privacy notice, synthetic-only storage and theme support. The work
changes presentation and navigation only.

## Included scope

| Area | Preview route |
| --- | --- |
| Clinic home | `/clinic` |
| Medical team | `/clinic/doctors` |
| 顏正安院長 | `/clinic/doctors/yan-cheng-an` |
| 楊昇峯醫師 | `/clinic/doctors/yang-sheng-feng` |
| 止鼾五合一 | `/clinic/nasal/snoring-five-in-one` |
| 下鼻甲手術 | `/clinic/nasal/inferior-turbinate-surgery` |
| 鼻中隔手術 | `/clinic/nasal/septoplasty` |
| 止鼾好眠牙套 | `/clinic/nasal/snore-relief-mouthguard` |
| Existing patient booking | `/booking` |

Plastic-surgery and injectable/medical-aesthetic category pages are explicitly
excluded. A doctor's professional background may still mention nasal
reconstruction where it is part of the source biography; that does not create
an additional treatment category or route.

## Page and code structure

- `clinic.html` is the stable entry document for every `/clinic` route.
- `clinic-content.js` owns public clinic, doctor, service and route content.
- `clinic-site.js` selects the current route and creates accessible DOM nodes.
  It does not use `innerHTML`, preserving the existing Trusted Types boundary.
- `clinic-site.css` owns the public clinic presentation and responsive layout.
- `clinic-booking.css` is a small override layer after `styles.css`. It uses the
  existing booking design tokens, so light, warm and dark themes remain
  functional.
- `server.mjs` and `firebase.json` declare matching local and Hosting routes.

The public clinic shell contains a desktop and mobile navigation, breadcrumb
navigation on detail pages, a safety-labelled preview boundary, contact
details, clinic hours and direct booking links.

## Visual direction

The source site's recognisable direction is retained without importing its
WordPress runtime:

- white navigation and surfaces;
- mist-green editorial sections;
- deep-forest primary actions and footer;
- restrained serif headings paired with system sans-serif body text;
- generous spacing, rounded information cards and soft green shadows; and
- the supplied clinic, doctor and nasal-care imagery served locally.

No remote script, stylesheet, font or analytics dependency was introduced.

## Medical-content boundary

The service copy is a concise adaptation of the clinic's public patient
information. Every detail page states that the content is general education,
that suitability and risk depend on an in-person medical assessment, and that
the page cannot replace diagnosis.

The static pages do not collect health or identity data. `/booking` remains a
browser-local synthetic form and must not be used for real patients until the
recorded privacy, policy, identity and production gates are approved.

## Accessibility and responsive rules

- all routes expose one primary `h1`;
- the page includes a skip link, labelled landmarks and keyboard-operable
  mobile navigation;
- the menu closes on link selection or `Escape`;
- images have meaningful alternatives when they carry information;
- focus indicators remain visible;
- reduced-motion preferences disable non-essential transitions; and
- the layout collapses to a single column without horizontal page scrolling.

## Verification and deployment

The code-level contract is pinned by
`apps/web/src/clinic-site.test.ts`. The full repository verification, browser
checks, Firebase preview URL, expiry and commit are recorded in the dated
delivery review after deployment.

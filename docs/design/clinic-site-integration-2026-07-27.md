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

The current homepage information architecture is recorded in the
[2026-08-10 homepage handoff](../reviews/2026-08-10-clinic-homepage-restructure.md).
Its `HOME_*` content is deliberately separated from the renderer, and the
homepage only promotes nasal function, snoring and sleep-breathing care.

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

### Structure and expression are governed differently (2026-08-06)

The clinic site keeps its own `--clinic-*` token system, because
`clinic.html` loads only `clinic-site.css` and cannot reference the shared
tokens in `styles.css`. What changed is that the token gate now applies its
full rule set to that file rather than two of nine rules.

The split is deliberate:

- **Structure** — type scale, weight, spacing, radius, touch targets, contrast.
  These decide whether a patient can read and tap, so they follow the shared
  system. The scale values are declared locally but are identical step for
  step; the prefix differs because the load boundary does, not because the
  sizes should. The site carries two steps above `3xl` that the workbench has
  no use for, on the same 1.2 ratio, because a marketing hero compressed into
  a page-title size is a redesign rather than convergence.
- **Expression** — the white/mist/forest palette, the ambient motion, the
  organic shapes. These stay, but as a named, gated token set instead of
  scattered literals.

Motion is where the two surfaces legitimately differ, and the difference is
now written down rather than accidental. The workbench uses Carbon's
*productive* timing because reception staff scan tables all day; the clinic
site runs slower because a public information page benefits from gentler
spatial transitions. The 2026-08-10 homepage removed the orb, aurora and
ticker—including their dead selectors and duration tokens—so the current
homepage keeps only finite staged entrances and interaction feedback.

`--clinic-ease-linear` is a real token, not an unconverted keyword. Constant
velocity is still required by the border sheen and scroll-progress animation;
an easing curve would decouple progress from the scroll position.

Two items are recorded rather than changed, because both need a contrast
measurement first: the focus ring uses the brand gold (`--clinic-focus-ring`),
which R-16 reserves for decoration on the shared system; and six
inverse-text shades on dark backgrounds are named but not yet collapsed into
a scale.

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
checks, Firebase preview URL, expiry and commit are recorded in the
[dated delivery review](../reviews/2026-07-27-clinic-site-integration-delivery.md).

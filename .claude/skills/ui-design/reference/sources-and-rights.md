# Sources, allocation and authority

Preserve source files, source URLs/hashes, derivative operations, intended
roles and review status. Keep owned masters separate from served derivatives.
An image already visible online is not evidence of an open-source licence.
Record the owner's authority to reuse or selectively redraw assets. Generated
illustrations need their prompt, reference inputs, output and review state.

Every served asset needs a rights record **per file** in
`apps/web/clinic-assets.manifest.json`: the 2026-08-02 confirmation covers
only what was listed then, and each later batch is listed by file in
`additionalLicences` with origin, basis, who confirmed and when. Ask the owner
before adding an image whose basis is unknown; do not extend an older
confirmation to new files. AI-generated images also carry an open item to check
the tool's commercial terms before launch.

All medical statements, comparisons, numbers, instruments, effects,
eligibility, treatment sequences, advantages/disadvantages and postoperative
care need a traceable source plus a review state. A source on the old official
website does not establish medical approval for the redesign. Retain uncertain
material as pending clinic review; do not complete it by guessing or turn a
comparison symbol into a stronger medical assertion.

Keep meaningful information in native HTML. Give complex images a short
description plus readable equivalent/long-description content. Transcribe
comparison/type labels from the identified source, rather than inferring them
from an attractive diagram. Record ambiguities for clinical review.

Maps and other third-party embeds default to something self-hosted. The
homepage map is drawn from OpenStreetMap data (a Produced Work under ODbL): the
page itself shows '地圖資料 © OpenStreetMap 貢獻者' linked to
https://www.openstreetmap.org/copyright, because a cropped image can lose its
own credit. A live Google map is click-to-load only (owner decision
2026-10-12): no request to Google before the click, one exact origin added to
the clinic CSP in `apps/web/csp-policy.mjs`, and `security-headers.test.ts`
proving no other surface gained it.

## Allocate before adding requests

The `/clinic.html` limits (owner-approved image increase of 30–60 KiB,
2026-10-11; current values and justification in
`apps/web/performance-budget.json`):

| Resource | Limit |
| --- | --- |
| Total | 250 KiB |
| JavaScript | 20 KiB |
| CSS | 14 KiB |
| Images | 228 KiB / 14 resources |
| Fonts | 0 KiB |

`check:perf` measures the built `apps/web/dist`; rebuild before reading it.

Use the repository's complete transfer/count/module-depth policy, including
its document, script and stylesheet limits. Six gallery frames do not grant
six extra requests. First identify which existing references are replaced,
reused or safely packed. Count every CSS/JS/srcset/hidden/lazy reference and
every relevant variant. Reusing a photograph in the gallery and environment
section should use the same URL when appropriate.

A route-specific prototype ledger is useful design evidence, not proof that
the formal shared entry passes. Combining the route assets into one shared
module can enlarge its transitive union. Reconcile that union or propose an
explicitly reviewed route-aware build/measurement boundary; never hide assets
from the collector, increase limits by default or call prototype allocation a
formal CI PASS.

## Keep the project boundaries

Use HTML/CSS/ES Modules, native semantics and the existing Trusted Types/CSP
boundary. Keep keyboard/focus, 44px targets, 200% text and reduced motion.
Reduced motion means manual-only gallery switching; cancel queued autoplay
work and remain paused until explicit resume when returning to normal motion.

Keep `/booking` as the existing separate project boundary. Do not add a new
booking form, model, controller or individual-physician booking flow. The
clinic freeze is open for the redesign branch only (2026-10-11 decision): the
same 30 files stay protected, hashes are rebased in the branch, and the branch
merges only after the next C1 deployment. No React migration, deployment
or implied production authority. After the Anime.js research, the owner decided
on 2026-10-10 not to add the library: apply its techniques through CSS and native
WAAPI as [ui-motion](../../ui-motion/SKILL.md) describes. Images and motion are
also subject to the medical-advertising limits in
[ui-content](../../ui-content/SKILL.md).

Finish with reusable boundaries, source/review records, rendered evidence,
honest validation status and a concrete integration handoff. Preserve formal
lease/freeze authority instead of treating a polished prototype as takeover
permission.

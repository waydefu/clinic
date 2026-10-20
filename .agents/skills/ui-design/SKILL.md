---
name: "ui-design"
description: "Lead the clinic website's visual design from brief to polished pages - concept, inspected references, style tiles, grayscale layout, token system, programmatic scoring plus visual critique, and a dedicated polish pass. Use for design direction, redesigns, visual hierarchy, reference comparison and visual review. Concrete values live in reference/visual-foundations.md, scoring in ui-score, implementation verification in ui-check."
metadata:
  generated: "true"
  generator: "scripts/generate-agent-skills.mjs"
  source: ".claude/skills/ui-design/SKILL.md"
---
# Lead the clinic's visual design

Since 2026-10-12 the owner has asked Claude to lead the clinic site's design and
to replace opinion-only review with research-backed method and programmatic
scoring (decision register, 2026-10-12 entry). The research behind every number
in this skill is [`docs/design/2026-10-12-design-research.md`](../../../docs/design/2026-10-12-design-research.md).
Acceptance is unchanged: [`ui-ux-rules.md`](../../../docs/design/ui-ux-rules.md)
R-1–R-26 and §5, then [ui-check](../ui-check/SKILL.md) and
[verify-gates](../verify-gates/SKILL.md). Aesthetic scoring never overrides a gate.

References, each with one canonical copy here (the `.agents` adapter links to them):

- [Concept and direction](../../../.claude/skills/ui-design/reference/visual-direction.md):
  brief, governing concept, asset-led composition, style tiles, page roles, mobile.
- [Visual system values](../../../.claude/skills/ui-design/reference/visual-foundations.md):
  type and Traditional Chinese typesetting, colour, space, grid, images, depth, details.
- [Critique and polish](../../../.claude/skills/ui-design/reference/visual-review.md):
  the critique protocol, the score-and-critique loop, the polish checklist, evidence.
- [Verified award benchmarks](../../../.claude/skills/ui-design/reference/award-benchmarks.md):
  calibrated quality bar, health/clinic award corpus, inspected work.
- [Sources and rights](../../../.claude/skills/ui-design/reference/sources-and-rights.md):
  asset allocation, per-file rights records, medical review state.

## The bar, calibrated

"Award-level" means the judged band, not a feeling. Awwwards weighs Design 40%,
Usability 30%, Creativity 20%, Content 10%; Honorable Mention starts at 6.5 and
sampled Sites of the Day score 7.1–7.5. Aim for **no weak criterion** (each at
least 7.2) rather than one spectacular idea. The developer jury scores semantics,
animation, accessibility, performance, responsiveness and markup; accessibility
is the lowest sub-score on winning sites, so this project's strict accessibility
and small budgets are an advantage to keep. Phones are judged separately.

The strongest evidence on first impressions: judgement forms in about 50 ms,
and **low visual complexity plus a familiar, prototypical structure** predict
appeal far better than colour or ornament. Premium comes from craft in type,
space, imagery and motion, not from added decoration.

## Choose the scope

- **Small change**: inspect the element and its neighbours at the affected
  viewport, fix it, run ui-score on the page if the change is visible.
- **Refinement of a selected direction**: keep the direction; run the loop below
  on the affected pages only.
- **New direction or full redesign**: run the whole loop, homepage first.
- **Review only**: report findings with evidence; edit only when authorised.

## The loop

1. **Brief.** Audience, page type, the visitor's main task and the visible
   result of the primary action. A clinic information page, a booking form and
   a staff workbench need different first screens. List the content that must
   stay visible (hours, contact, booking path, test-only notices).
2. **Concept.** Choose one governing idea that can recur in type, line, motion
   and imagery. For this clinic the natural idea is breath and airflow, framed
   by everyday function (smell, breathe, sleep) rather than disease. Write it in
   one sentence; every later choice should be explainable by it.
3. **References.** Inspect real work at comparable widths: the award corpus in
   [award-benchmarks](../../../.claude/skills/ui-design/reference/award-benchmarks.md), clinic sites, and primary
   type/motion guidance. Record what relationship is useful and how it adapts to
   this clinic. Two pages of one agency are one source; a link alone is not research.
4. **Directions.** For an open direction, produce two or three named style
   tiles (type roles, colour roles, sample image treatment, one component, three
   adjectives), not full comps. Recommend one with reasons; record the owner's
   choice or the delegated choice. Avoid mixing parts of comps into one.
5. **Grayscale layout.** Build hierarchy with size, weight, space and contrast
   at 1440 and 375 px before colour. Start with too much space and tighten.
   Group with space or background steps before borders. Mobile is its own
   composition.
6. **System.** Express the result as tokens (colour, type step, space, radius,
   shadow, motion) using [visual-foundations](../../../.claude/skills/ui-design/reference/visual-foundations.md).
   Components consume tokens only; `check:tokens` enforces the scale.
7. **Real pages.** Build with real content and assets. Review the homepage, one
   doctor page and one treatment page together every round.
8. **Score and critique.** Run [ui-score](../ui-score/SKILL.md) for the measured
   view (complexity, whitespace, alignment, colour, typography, balance, focus,
   motion) and the hard gates; then critique the rendered pages with the protocol
   in [visual-review](../../../.claude/skills/ui-design/reference/visual-review.md). Fix the three weakest
   relationships, re-render, repeat. A higher score with a worse-looking page is
   a regression; a better-looking page with a failed gate is not done.
9. **Polish.** Reserve a dedicated pass for the checklist in visual-review
   (concentric radii, optical alignment, tabular numerals, orphan characters,
   focus rings, image edges, hover stability, motion timing).
10. **Hand off.** Give ui-check the changed routes, the score report, the
    critique notes and what remains unverified (real devices, screen readers).

## Hard boundaries

- Medical copy and imagery are health education: no outcome rates, before/after,
  testimonials, rankings, guarantees, or motion that implies a result (Medical
  Care Act arts. 85–87). Wording goes through [ui-content](../ui-content/SKILL.md);
  the owner reviews medical copy before launch.
- Plain HTML/CSS/ES modules, strict CSP with Trusted Types, no animation library,
  system fonts, existing budgets. A research request does not authorise a
  dependency, a budget increase or a deployment.
- Keep test-only notices, privacy text and required status information when
  simplifying. Necessary content stays in accessible HTML (R-26).
- Assets need a recorded rights basis per file before use
  ([sources-and-rights](../../../.claude/skills/ui-design/reference/sources-and-rights.md)).

## Method provenance

Project-authored. The loop and values come from the 2026-10-12 research
(Awwwards evaluation, Reinecke et al. 2013, Lindgaard et al. 2006, VisAWI,
Refactoring UI, Utopia, W3C clreq, NN/g, Material 3, Carbon, practitioner
writing by Kowalski, Freiberg and Comeau). An earlier version adapted parts of
the MIT-licensed oil-oil/oil-ui v0.15.4 (reviewed 2026-10-05); no upstream
executable, asset or update hook is included.

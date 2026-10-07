---
name: "ui-design"
description: "Design or refine clinic web interfaces from the user's task, approved brand assets and actual rendered evidence. Use for design direction, visual hierarchy, reference comparisons, prototypes and visual review. Preserve an already selected direction; use ui-check for implementation verification."
metadata:
  generated: "true"
  generator: "scripts/generate-agent-skills.mjs"
  source: ".claude/skills/ui-design/SKILL.md"
---
# Design the clinic interface

Use this skill for design decisions. Read the frontend/UI route in
[`docs/INDEX.md`](../../../docs/INDEX.md), the current design brief and the
relevant handoff. Acceptance stays in
[`ui-ux-rules.md`](../../../docs/design/ui-ux-rules.md) R-1–R-26 and §5;
implementation verification goes to [ui-check](../ui-check/SKILL.md).

The current website supplies assets, source material and a before-state to
criticise; its layout is not the visual success standard. Set that standard
from the user's brand brief, actually inspected external references and
professional composition/type judgement. For the selected clinic redesign,
the owner's minimum is international design-competition-level craft. Use
verified jury-awarded work through the benchmark reference below. Do not use
self-made weak/improved examples, the old site or a mechanical PASS to lower
that bar; do not manufacture a showcase to certify your own work.

Read the relevant canonical reference for a substantial clinic redesign:

- [Visual direction](../../../.claude/skills/ui-design/reference/visual-direction.md):
  asset-led composition, typography, rhythm and mobile reconstruction.
- [Rendered visual review](../../../.claude/skills/ui-design/reference/visual-review.md):
  screenshot, critique, structural revision and the homepage benchmark gate.
- [Sources and rights](../../../.claude/skills/ui-design/reference/sources-and-rights.md):
  asset allocation, medical review state and publication boundaries.
- [Visual foundations](../../../.claude/skills/ui-design/reference/visual-foundations.md):
  Chinese typography, proportions, colour roles and composition decisions.
- [Verified award benchmarks](../../../.claude/skills/ui-design/reference/award-benchmarks.md):
  award provenance, inspected work, adaptation limits and the visual quality bar.

These are five references, each with one canonical copy in `.claude`.
The generated `.agents` skill deliberately links to those same files.
The generator copies `SKILL.md` only; do not change it to duplicate references.

## Choose the scope

- For a selected direction, refine that direction and the affected areas.
  Do not restart style exploration because a reference suggests another look.
- For a new direction or a requested redesign, compare representative options
  before extending them to the whole site. Reuse existing research when relevant.
- For a small change, inspect the element and its neighbours at the affected
  viewport. Do not turn a spacing fix into a redesign.
- For a review, inspect the current artifact and report findings; edit only when
  the user has authorised changes. A screenshot recreation follows its reference.

## Build a useful design brief

Identify the audience, page type, main task and visible result of the primary
action. Distinguish a clinic information page from a booking form and a staff
workbench: each needs a different first screen. State what the user must find or
do there, and which content must remain visible.

Check the available local assets and their source manifest before requesting
new material. For each reference actually inspected, record the date/source,
the useful layout or interaction relationship, why it serves this task, and
what will be adapted. A reference link alone is not visual research.

Translate the intended experience into observable choices: reading order,
type roles, content density, image placement, surface treatment and emphasis.
Explain those choices with the clinic's content and assets rather than words
such as "premium". Reuse the project's tokens and shared components.
For substantial wording or information-order work, use
[ui-content](../ui-content/SKILL.md) while keeping the selected visual direction.

## Explore only when the direction is open

Use the same core content and task for the compared options. Show structural
differences in the first screen and at least one consequential section or form
state; changing colours on the same layout is a variation, not a new direction.
For each option, include a short wireframe, typography and colour roles, asset
choice, primary action and implementation cost. Check that the alternatives
remain distinguishable without their names.

Produce only enough desktop and mobile samples to expose the tradeoffs. Place
them beside the current page when a baseline exists, recommend with reasons,
and carry the user's selection forward. If the user delegates the choice,
record the selected option and its rationale without adding an approval step.

## Refine the actual page

For the selected editorial clinic direction, inspect rendered pages before
mechanical checks. Engineering correctness is the floor. A generic composition
still fails after all mechanical checks pass. Own the visual judgement within
the user's boundaries instead of asking them to choose every crop or spacing.

For a site redesign, establish the homepage benchmark before extending the
other five principal pages. Inspect 1440px and 375px, identify the three weakest
structural decisions, change the composition where necessary and render again.
Do not accept the first technically correct version or replace visual work
with a large planning document. Extend a design language, not one section
template with different text. Include the two existing personal physician
routes when shared shell/CSS integration is later verified: six principal
pages are eight clinic routes.

Look at the rendered artifact at its real reading size, not just a compressed
comparison sheet. Review the whole page and necessary close-ups:

- Can the patient find hours, contact and booking, or can staff reach the work
  object and its action without a decorative introduction pushing it away?
- Does the visual emphasis match the main task? Do adjacent sections develop
  the content rather than repeat a grid of interchangeable cards?
- Do typography, photo crops, icon proportions, contrast and spacing carry the
  chosen clinic identity consistently at desktop and mobile sizes?
- Are every border, container, shadow and line of copy doing useful work?
  Keep required labels, privacy notices, test-only warnings and error/status
  information when making visual reductions.
- Do loading, error, empty and long-content states belong to the same design,
  and retain a clear next action? Use synthetic, opaque operational values.

Base a defect on a route, viewport, state and visible evidence. Propose the
smallest correction within the chosen direction. Do not shrink text or hide
overflow to conceal a layout failure. Necessary content stays in accessible
HTML; decorative imagery cannot replace it (R-26). Motion needs a visible
contribution to feedback, continuity or editorial pacing and R-17 compliance,
not an animation quota. For motion direction, Anime.js evaluation or playback
review, use [ui-motion](../ui-motion/SKILL.md); watch normal playback as well as
the reduced-motion fallback.

## Visual review and engineering handoff

For a substantial revision, an independent visual review can add value when an
authorised isolated reviewer can see the evidence. Supply the task, audience,
selected direction, constraints and current screenshots/state evidence; omit
the maker's defence and previous scores. Otherwise self-review and identify it
as such. Do not spawn reviewers merely because this skill was loaded.

Report the design gaps, evidence and suggested corrections. Static screenshots
do not prove animation, keyboard, submission or screen-reader behaviour. A
visual opinion or score is advisory and cannot change gate status or authority.

Keep the brief, asset mapping and evidence in the task's existing handoff or
design record. State selected direction, changed areas, remaining questions,
and each item's validation scope. Prototype screenshots must remain labelled
as prototype evidence; formal baseline captures follow §5.5. Hand implemented
changes to ui-check and [verify-gates](../verify-gates/SKILL.md), including build
and required tests. A failed build or broken asset is an unresolved finding.

## Method provenance

This is a project-authored adaptation informed by the MIT-licensed
[oil-oil/oil-ui](https://github.com/oil-oil/oil-ui/tree/48518fd02946ccbda54cd3544f8bd102413128cf)
v0.15.4, reviewed 2026-10-05, especially its design-direction and visual-review
references. No upstream executable, asset or auto-update hook is included.
Future changes to this project skill are reviewed repository changes. Upstream
instructions to remove test-environment notices, omit builds/tests, add a fixed
number of animations or advertise a paid edition are not adopted.

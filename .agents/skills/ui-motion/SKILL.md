---
name: "ui-motion"
description: "Design, implement or review purposeful motion in the clinic's HTML/CSS/ES Modules interface, including Anime.js evaluation, temporal composition, gallery transitions, interrupted playback and reduced-motion fallbacks. Use when motion quality or an animation dependency is part of the task, not for every spacing or copy change. Works with ui-design and ui-check; does not grant installation, production or booking authority."
metadata:
  generated: "true"
  generator: "scripts/generate-agent-skills.mjs"
  source: ".claude/skills/ui-motion/SKILL.md"
---
# Compose and verify motion

Use [ui-design](../ui-design/SKILL.md) for the page's visual direction and
[ui-check](../ui-check/SKILL.md) for implementation verification. Acceptance
remains [ui-ux-rules.md](../../../docs/design/ui-ux-rules.md) R-17 and §5;
this skill supplies a method, not another governance gate. Read the current
task/brief first: a research or review request does not authorise website edits.
Preserve earlier user authorisation and the existing clinic/booking boundaries.

Read only the reference needed:

- [Motion design and rendered review](../../../.claude/skills/ui-motion/reference/motion-design.md)
  for attention, choreography, clinic-specific treatments and evidence.
- [Anime.js selection and lifecycle](../../../.claude/skills/ui-motion/reference/animejs.md)
  for module cost, CSP/Trusted Types, cancellation and browser limitations.
- [Verified award benchmarks](../../../.claude/skills/ui-design/reference/award-benchmarks.md)
  for professionally judged work, observed motion and clinic adaptation limits.

Each reference has one canonical copy in `.claude`. Generated `.agents`
skills link there; the existing generator copies only `SKILL.md`.

The existing site's motion is a before-state to examine, not the quality target.
Derive the treatment from the brief, content and inspected jury-awarded cases.
The owner's quality bar is international design-competition-level craft; a
playing carousel or isolated compatibility test cannot establish it. Do not
create unapproved low-grade demos or prescribe their timing/layout as models.
Implement in the actual authorised candidate and critique the complete motion.

## Start from the visible experience

Inspect the actual route at the affected desktop/mobile widths with normal
motion enabled. Watch first arrival, a relevant interaction and its completion;
a source search or static screenshot cannot establish motion quality. Check
reduced motion separately. Name missing playback evidence instead of assuming
that a demo, CSS declaration or imported library proves an animation works.

Fix composition before trying to animate it. Preserve the chosen editorial,
natural clinic direction, brand photographs, portraits and paid illustrations.
Motion may support orientation, feedback or the pacing of an existing visual
relationship. It need not be limited to a button-state change, but it needs an
observable contribution. Do not set an animation quota or animate every section.

## Write one brief for each selected treatment

Record route, viewport, element, trigger and the intended focus of attention.
Describe the before, intermediate and settled compositions: what stays still,
what changes, in what order, with what duration/easing and why. State the static
fallback and interruption behaviour. Separate engineering effort, transfer
bytes/request count and decoded-image memory when estimating cost.
Use existing motion tokens where available; proposed timings are hypotheses
to inspect, not universal acceptance thresholds.

Choose the temporal relationship before the tool. A timeline is useful when
multiple changes must maintain an order or overlap; it is unnecessary merely
because a page has multiple elements. Compare a few key frames or a small
isolated trial when the strongest treatment is unclear, then own the choice.

Primary copy and required information stay readable without JS and before any
scroll trigger. Do not delay the page behind an intro, split all headings into
moving letters, or use parallax/tilt to decorate clinical content. Keep supplied
whole medical figures intact unless the owner specifically approves alteration.
Animation cannot invent medical claims or imply an unreviewed treatment result.

## Select the smallest suitable implementation

CSS can handle a control's short visual feedback. Native WAAPI or the requested
Anime.js WAAPI path can handle finite DOM transitions. Consider Anime's JS
engine, timeline, scope or scroll helpers only for a demonstrated requirement;
measure the exact imported feature set and build. Do not assume all root named
imports include the whole package, or that a subpath is free.

Keep HTML/CSS/ES Modules, native semantics, local fonts and the existing Trusted
Types boundary. No React migration, CDN script, new booking model, framework
installation or budget increase follows from a research request. Do not weaken
CSP or create a permissive Trusted Types policy to accommodate a demo.

## Own the entire lifecycle

One controller owns its animation handles, listeners, observers and scheduling.
UI state and accessible labels update correctly regardless of transition state.
Keep focus and touch geometry stable; animation must not postpone an action.

- Check the initial media preference and subscribe to changes. Switching to
  reduce mid-flight stops effects and autoplay and exposes the correct static
  state immediately. Do not automatically resume because the preference clears.
- Guard every asynchronous image decode and completion with current intent.
  Commit a photo and its description together; an older resolve, failed decode
  or cancelled animation cannot overwrite the latest valid selection.
- Pause/cancel appropriately on hidden/pagehide. On pageshow, including BFCache,
  restore one controller and preserve explicit pause intent. A global engine's
  hidden-document setting does not manage application timers or decode work.
- Teardown removes listeners, disconnects observers, cancels timers/effects and
  invalidates pending work. Verify style restoration; `cancel`, `revert` and
  native `finished` promises have different semantics. Cleanup must be safe to
  repeat and must not erase another controller's transforms.

## Review the actual motion, then verify the implementation

For a substantial clinic treatment, view normal playback at 1440px and 375px.
Record a clip or trace plus before/intermediate/settled evidence, trigger and
preference. Critique attention, continuity, overlap and the final composition;
revise the weakest relationship and watch again. A recording exists only as
evidence after someone actually watches it. Screenshots alone do not show pacing.

During research, unavailable viewport/playback evidence can leave the proposed
frames as labelled hypotheses. Keep those rows unverified; a synthetic lab or
one default desktop capture cannot accept the clinic's 1440/375 composition.

Exercise reduced motion initially and during playback, rapid repeated input,
keyboard/focus, image failure and the lifecycle paths affected by the change.
Check console/CSP violations through completion and teardown, not only startup.
Report untested browsers, hardware and lifecycle paths explicitly. A synthetic
lab establishes compatibility only for its tested feature and environment.

Measure the built route's full resource closure and request count against the
existing budgets, including shared imports. No increased budget, lazy-loading
loophole or vendor's advertised gzip figure substitutes for project measurement.
Give ui-check the motion brief, inspected evidence, interruption results, cost
and remaining gaps. Keep prototype, isolated lab and formal build claims separate.

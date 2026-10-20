---
name: "ui-motion"
description: "Design, implement or review motion in the clinic's HTML/CSS/ES Modules interface with concrete duration and easing tokens, compositor-only properties, interruptible transitions, CSS springs, scroll-driven and view-transition enhancements and reduced-motion parity. Use when motion quality, an animation technique or an animation dependency is part of the task. Works with ui-design, ui-score (motion lint) and ui-check; does not grant installation, production or booking authority."
metadata:
  generated: "true"
  generator: "scripts/generate-agent-skills.mjs"
  source: ".claude/skills/ui-motion/SKILL.md"
---
# Compose and verify motion

Use [ui-design](../ui-design/SKILL.md) for the page's direction,
[ui-score](../ui-score/SKILL.md) for the motion lint and
[ui-check](../ui-check/SKILL.md) for verification. Acceptance remains
[ui-ux-rules.md](../../../docs/design/ui-ux-rules.md) R-17 and §5. Values and
sources: [`docs/design/2026-10-12-design-research.md`](../../../docs/design/2026-10-12-design-research.md) §5.

References:

- [Motion patterns and values](../../../.claude/skills/ui-motion/reference/motion-design.md):
  tokens, patterns with code shape, clinic candidates, evidence.
- [Anime.js selection and lifecycle](../../../.claude/skills/ui-motion/reference/animejs.md):
  why the library is not used (owner decision 2026-10-10) and the native equivalents.

## Decide whether to move at all

Motion earns its place by explaining a change, confirming an action, keeping
spatial continuity, or one rare moment of delight. Frequency decides: anything
keyboard-initiated or seen many times a day gets no animation; give every input
visible feedback within 100 ms; spend at most one signature moment per page.
Premium motion is fast, purposeful, consistent and interruptible; gimmicky
motion is long, looping, autoplaying, decorative or scroll-hijacking.

## Tokens

| Use | Duration | Easing | Clinic token (current → target) |
| --- | --- | --- | --- |
| Press, toggle, colour/opacity hover | 100–150 ms | `cubic-bezier(0.2, 0, 0, 1)` | `--clinic-duration-effect-swift` 0.16s |
| Small reveal (tooltip, menu, accordion) | 150–200 ms | enter `cubic-bezier(0.05, 0.7, 0.1, 1)` | — (add) |
| Panel, dialog, gallery crossfade | 240–300 ms | enter as above; exit `cubic-bezier(0.3, 0, 0.8, 0.15)` at 65–85% of enter | `--clinic-duration-effect-fast` 0.24s |
| Entrance reveal (opacity + small translate) | 500–600 ms | `--clinic-ease-out` | `--clinic-duration-spatial-base` 0.5s |
| Large travel or page change | ≤ 450 ms | standard | `--clinic-duration-spatial-slow` 0.8s → should drop to ≤ 0.6s |

Never `linear` for UI movement; never the weak CSS keywords where a token
exists. JavaScript reads durations from CSS custom properties
(`getComputedStyle`), never literals. `check:tokens` only sees CSS `ms` values
inside `transition`/`animation`; the ui-score motion lint covers what runs.

## Rules for every animation

- Animate `transform` and `opacity` only; list properties explicitly, never
  `transition: all`; `will-change` only on an element about to move.
- State-driven UI uses transitions (they retarget mid-flight); keyframes only
  for one-off sequences.
- Never start from `scale(0)`; start at 0.93–0.97. Put `transform-origin` where
  the motion physically starts (the trigger).
- Exits are shorter and milder than entrances.
- Stagger: 30–50 ms per item, at most five items, whole sequence ≤ 500 ms,
  first item without delay.
- Springs without a library: parameterise as (duration, bounce), pre-sample to a
  CSS `linear()` easing in a build step; bounce 0 for clinical content.
- Scroll-driven animation and cross-document view transitions are progressive
  enhancement inside `@supports` and `@media (prefers-reduced-motion: no-preference)`;
  content is complete and visible without them.
- Dialogs and popovers animate with `@starting-style` and
  `transition-behavior: allow-discrete`, no JS.
- Reduced motion removes movement (translate, scale, parallax, zoom) and keeps
  opacity changes; write the static end state as default and add motion inside
  the `no-preference` block. Autoplay stops entirely.
- No motion may imply a treatment result (no count-ups, before/after wipes,
  "airflow improving" animations).

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
- Pause/cancel on hidden/pagehide; on pageshow (including BFCache) restore one
  controller and preserve explicit pause intent.
- Teardown removes listeners, disconnects observers, cancels timers/effects and
  invalidates pending work; it must be safe to repeat.

## Verify

Run the ui-score motion lint (properties, durations, loops) on the affected
routes in both normal and reduced-motion modes. Then watch normal playback at
1440 and 375 px; a recording is evidence only after someone watches it.
Exercise rapid repeated input, keyboard, image failure and the lifecycle paths
the change touches. Check console and CSP violations through completion and
teardown. Measure the built route against the existing budgets. Report
untested browsers, devices and paths explicitly.

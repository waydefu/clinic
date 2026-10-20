# Motion belongs to the composition

Use this reference when choosing or reviewing motion. The site's brand is
expressed by its forest atmosphere, original imagery, typography and clinical
information. Movement should develop those relationships over time, rather than
introduce a second visual language of floating cards and bouncing controls.

## Three useful roles

**Feedback:** a patient's action has visibly changed selection, playback or
navigation state. State and accessible naming change synchronously; a small
visual transition can make the result easier to recognise.

**Continuity:** preserve a spatial anchor while another object changes. A gallery
can keep its frame, copy and controls stable as the photograph changes. A diagram
and its explanation can remain associated as the reader chooses a view. Do not
move the whole page just to make a local action feel animated.

**Editorial pacing:** a finite visual change may establish the page's dominant
image or a relationship between chapters. The treatment needs a specific visual
idea, an ending and a static equivalent. A faint line flashing on every section
is not a complete motion direction. More animated elements do not imply better
choreography.

For a candidate, describe what the reader should notice first, what remains
stable and what has changed when it finishes. Test with the motion removed:
content must remain usable, even when a justified enhancement is lost.

## Clinic-specific candidates, not a required effect list

| Content relationship | Treatment worth testing | What must remain stable |
| --- | --- | --- |
| Homepage brand photograph and opening copy | A finite, quiet photographic arrival or decoded photo crossfade; establish the clinic sign as the visual anchor | Brand legibility, readable copy from first paint, useful crop at 375px, fixed control geometry |
| The four-photo "走進診所" gallery (user-driven, no autoplay) | Retain the gallery's frame while the selected image changes; photo and description commit together after decode | Latest selection wins, image failure recovery, keyboard operation, no motion under reduced motion |
| Long medical article and its anatomy | A user-selected association between existing explanation and whole figure, or a restrained chapter cue | All claims and diagrams available without animation; no moving/cropped anatomy to imply an effect |
| Mouthguard assessment, making, adjustment, wearing and care | Show the existing sequence and current reading position; optional emphasis follows an explicit selection | Complete ordered HTML, correct content and no invented clinical outcome |
| Physician profiles | At most a quiet transition attached to a real navigation action | Portrait/name/role remain readable together; no tilted portraits, testimonial carousel or doctor booking CTA |

These are candidates for the chosen layout, not instructions to add five effects.
A still portrait or whole comparison table is often the strongest decision.
Do not animate a medical figure's internal parts to create a clinical explanation
that has not been sourced and reviewed. Preserve owner-supplied full figures.

## Patterns with their code shape

Durations and curves come from the token table in the skill. Each pattern below
is the smallest native implementation that meets the rules; adapt names to the
clinic tokens.

**Entrance reveal (once per section).** Static visible state is the default;
motion only when the preference allows and JS has marked the page:

```css
@media (prefers-reduced-motion: no-preference) {
  .clinic-motion [data-reveal] { opacity: 0; transform: translate3d(0, 0.75rem, 0);
    transition: opacity var(--clinic-duration-spatial-base) var(--clinic-ease-out),
                transform var(--clinic-duration-spatial-base) var(--clinic-ease-out); }
  .clinic-motion [data-reveal].is-revealed { opacity: 1; transform: none; }
}
```

Translate 8–24 px, never scale large objects; stagger only inside one group.

**Photo crossfade.** Decode the next image first, then animate two stacked
layers (old fading out, new fading in) with the panel duration; changing `src`
then fading the single image is a reveal, not a crossfade. Guard with a
generation counter so a late decode cannot win.

**Dialog, popover, mobile menu.** `@starting-style` for the entry state plus
`transition: opacity, transform, overlay allow-discrete, display allow-discrete`;
exit shorter than entry. Top-layer semantics keep focus and Escape native.

**Page change.** `@view-transition { navigation: auto; }` in both documents
(same origin only; Chromium and Safari 18.2+; Firefox falls back to a normal
navigation). Root crossfade 250–300 ms; a shared element (doctor card portrait
to profile portrait) needs a unique `view-transition-name` set in CSS or via
CSSOM, never an inline style attribute under the CSP. Under reduced motion use an
opacity-only crossfade of 100–150 ms or none.

**Scroll-driven accents.** `animation-timeline: view()` with `animation-range`
(for example `entry 10% cover 30%`), inside
`@supports (animation-timeline: view())` and the `no-preference` query. Content
must be fully visible where unsupported.

**Hover and press.** Colour or opacity only, about 125 ms in and slower out;
`:active` may scale to 0.97. Hover on a stable parent, animate a child, so the
element never moves out from under the pointer.

**Springs.** Apple's model: stiffness = (2π / duration)², damping =
4π(1 − bounce) / duration (mass 1). Sample the step response at about 35–60
points in a build script and emit `linear(...)`; bounce 0 (critically damped)
for clinical content. Set the CSS duration to the computed settling time.

## Choreograph before coding

Sketch before, intermediate and settled frames at the actual viewport. Specify
which layer owns attention. Decide simultaneous versus sequential movement and
whether overlap improves continuity or just increases visual noise. Avoid a
domino of eyebrow, heading, paragraph and CTA arrivals on every page.

Scale distance and timing to the object and context. A utility control generally
needs faster confirmation than a large photographic change; mobile may need
less movement or an immediate change. Use a small coherent vocabulary and test
its pace with real content. Timing values are starting points, not universal
rules. Avoid spring overshoot on clinical content unless its meaning survives
close scrutiny; do not adopt expressive motion just because the library has it.

Do not make essential content initially invisible. Secondary visual layers may
transition while copy remains settled. Avoid animation of layout dimensions,
blur and broad shadows without profiling. Prefer opacity/transform where
appropriate, but verify compositing; those properties are not a blanket promise
of smoothness or zero cost. Do not keep `will-change` on every element.

A true photo crossfade needs old and new layers simultaneously. Changing `src`
then animating the new image's opacity is a reveal, not a crossfade. Decode first,
preserve the current valid image on failure and retire only the obsolete layer.
Two layers using the same allocated assets do not imply two new unique assets,
but requests, decoded memory and intermediate legibility still need measurement.

## Evidence that answers the design question

Watch normal-mode first arrival and the actual trigger through settlement.
Annotate route, viewport, preference, trigger and selected content. A clip or
trace can expose speed, a flash, overlap or interruption; static frames can
expose composition at intermediate moments. Use both for consequential motion.
Do not call an animation reviewed merely because its count or duration is known.

Use the visual-review format:

> Route / viewport / element / observed temporal or spatial defect / why it
> weakens attention or continuity / concrete revision / watched result.

For example, during a homepage crossfade the clinic sign becomes washed out
while the heading remains equally prominent. The brand anchor disappears at the
moment of transition. Revise the overlap or opacity treatment and inspect the
intermediate frame; changing an unrelated button radius cannot resolve it.

Inspect normal and reduced modes separately. Initial reduce and a preference
change while moving are different paths. Keep the stable content state, controls
and focus usable in both. For auto-advancing galleries, follow the
[WAI carousel pattern](https://www.w3.org/WAI/ARIA/apg/patterns/carousel/): provide
rotation control, stop on keyboard focus and mouse hover, and require an explicit
request to resume after those interactions. Dot focus alone is incomplete.
Reduced motion means manual selection without autoplay for this clinic direction.

Build evidence remains separate from visual evidence. Synthetic screenshots,
desktop WebKit and emulated preferences do not prove real iPhone performance or
assistive-technology acceptance. Record gaps instead of silently filling them.

## First-party reference lessons and limits

- The [verified award benchmarks](../../ui-design/reference/award-benchmarks.md)
  distinguish jury records, current live behaviour and published archival
  stills. Praxis's loading/reveal/drag states were observed, but its opening
  recording was not reviewed end to end. Hyoumankind's object/material motion
  is a creator-described direction, not verified current playback. Treat it
  as a research question, not a ready-made timing prescription. An award does
  not make long loading intros, blurred copy or custom scrolling appropriate
  for this clinic. Choose the useful spatial relationship before any effect.
- [Anime.js homepage](https://animejs.com/): normal-mode time-separated rendered
  frames showed the changing circular illustration as one dominant stage, while
  the heading/navigation kept their spatial anchors. Learn temporal unity and
  a clear visual protagonist; do not copy its neon rings or permanent loops into
  the clinic. These frames establish changing visual states, not a smoothness
  or mobile-performance verdict.
- [Apple HIG Motion](https://developer.apple.com/design/human-interface-guidelines/motion):
  continuity and feedback offer useful design relationships; the research read
  guidance, not an Apple app's live interaction. Do not transplant visionOS depth.
- [Material Motion](https://m3.material.io/styles/motion/overview/how-it-works):
  compare standard and expressive physics. The research saw its diagram; videos
  did not play in the browser used, so no live timing claim is made.
- [Web animation performance](https://web.dev/articles/animations-guide):
  profile layout/paint/compositing and use temporary hints only when useful.
- [WCAG interaction animation explanation](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html):
  SC 2.3.3 is Level AAA; explanatory guidance does not create a new project gate
  or replace R-17 and the separate rules for automatically moving content.

Project-authored guidance, researched 2026-10-07; patterns and values added
2026-10-12 from the motion research (Material 3 tokens, Carbon, NN/g, Kowalski,
Comeau, Apple spring model, Chrome view-transition and scroll-driven docs). The owner's 2026-10-08
international-level bar is routed through
[verified award benchmarks](../../ui-design/reference/award-benchmarks.md).
No unapproved teaching prototypes, fixed animation quota or automatic upstream
updates are included. Technical compatibility evidence is not visual acceptance.

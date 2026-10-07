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
| Six photos in one editorial gallery | Retain the gallery's spatial frame while the selected image changes; photo/description commit together | Latest selection, explicit pause intent, image failure recovery and keyboard operation |
| Long medical article and its anatomy | A user-selected association between existing explanation and whole figure, or a restrained chapter cue | All claims and diagrams available without animation; no moving/cropped anatomy to imply an effect |
| Mouthguard assessment, making, adjustment, wearing and care | Show the existing sequence and current reading position; optional emphasis follows an explicit selection | Complete ordered HTML, correct content and no invented clinical outcome |
| Physician profiles | At most a quiet transition attached to a real navigation action | Portrait/name/role remain readable together; no tilted portraits, testimonial carousel or doctor booking CTA |

These are candidates for the chosen layout, not instructions to add five effects.
A still portrait or whole comparison table is often the strongest decision.
Do not animate a medical figure's internal parts to create a clinical explanation
that has not been sourced and reviewed. Preserve owner-supplied full figures.

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

Project-authored guidance, researched 2026-10-07. No vendor assets, executable
examples, fixed animation quota or automatic upstream updates are included.

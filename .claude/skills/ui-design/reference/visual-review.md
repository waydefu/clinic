# Critique and polish

The loop that turns a correct page into a crafted one: measure, look, name the
three weakest relationships, change them, render again. Engineering
correctness is the floor; a page that passes every gate can still look generic.

## Each round

1. Render the homepage, one doctor page and one treatment page at 1440 × 900
   and 375 × 844 (DPR 1 for comparability; look at DPR 2–3 for crispness).
2. Run [ui-score](../../ui-score/SKILL.md) on the same routes. Read the
   component breakdown and the hard gates before looking at the overall number.
3. Look at the screenshots at real reading size, whole page and close-ups.
4. Write the critique below, pick the three weakest relationships, fix them,
   repeat. Stop a round when the critique finds no structural default and the
   score has not regressed.

## Critique protocol

Rate each facet of the validated VisAWI model 1–7 and write one sentence of
evidence for each:

- **Simplicity:** one clear protagonist per screen; few alignment lines; nothing
  competes with the primary task.
- **Diversity:** enough variation in scale, density and image to keep reading
  interesting, without breaking the system.
- **Colour:** roles are consistent; accents are rare and meaningful.
- **Craftsmanship:** type, space, imagery and motion are integrated skilfully;
  details are finished. This facet separates award-level from tidy.

Then answer, with route, viewport and element for every "no":

- With the logo removed, does the opening still belong to this clinic?
- Would replacing the copy with hotel or SaaS copy leave the layout intact?
  (If yes, the design is not about this content.)
- Is there card soup or one section recipe repeated?
- Do hours, contact and booking appear without a decorative detour?
- Does 375 px read as its own composition?
- Would a design jury put this screenshot in a portfolio?

Record each issue as: route, viewport/state, element, visible defect, why it
weakens hierarchy or composition, the concrete change. "More modern" or
"cleaner" is not a reason.

## How score and critique interact

- A score drop on a component is a prompt to look, not a verdict. Confirm it on
  the screenshot before changing anything.
- Never trade a gate (contrast, target size, motion lint, reduced-motion parity)
  for score.
- Do not chase a single metric. If the alignment count improves while the page
  becomes monotonous, the critique wins.
- Compare a page with its own previous version and with the award corpus
  distribution; never with a single favourite reference.

## Polish checklist

- Headings and list items: no one- or two-character last lines at 320, 375,
  768, 1280 px.
- Prose measure 17–40 characters; leading set (not `normal`); tracking ≤ 0.05em.
- Numbers in hours, phones and tables use tabular numerals.
- Concentric radii; icon-side padding optically balanced.
- Focus rings visible on every surface, following the radius, in forced colours.
- Images: no stray crop edges, no sliver of a cut object at a frame edge,
  consistent background for illustrations, 1 px edge on tinted backgrounds.
- Hover and focus change colour or opacity only; nothing moves out from under
  the pointer; no layout shift.
- Motion passes the lint in ui-score and looks calm at normal speed.
- Gallery: every image, not just the first; rapid selection; error state.
- 200% text and WCAG 1.4.12 spacing overrides do not clip anything.

## Evidence boundaries

Label prototype captures separately from content-hashed build captures; never
edit recorded baseline hashes. Static screenshots do not prove animation,
keyboard, screen-reader or real-device behaviour; list those as unverified.
When shared shell or CSS changes, check all eight clinic routes.

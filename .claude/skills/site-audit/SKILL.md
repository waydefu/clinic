---
name: site-audit
description: Score the public clinic site (/clinic and every clinic route) and the booking page (/booking) against the repository's written 100-point rubric - search and sharing, performance, accessibility, design consistency, conversion, medical-advertising law, security and maintainability - plus a separate visual score, with measured or cited evidence for every sub-item, and write a dated, indexed review record. Use when asked for an overall score, a re-score after changes, or a list of what still falls short. Advisory only - never a gate, never medical, legal or launch approval.
---

# Audit and score the public site

The rubric is **already written**:
[`docs/design/site-audit-rubric.md`](../../../docs/design/site-audit-rubric.md).
It fixes the eight dimensions, every sub-item's points, its evidence type and
the caps. Score against it as written; do not invent sub-items or move points.
If the rubric itself looks wrong, finish the audit, then propose the change
separately so the scores stay comparable.

## 0. Pin the subject

Record the exact commit, and for every measurement whether it ran against the
preview channel or a local build. They are often different versions: hosting
headers, rewrites and CDN timing only exist on the preview channel, while an
unpublished commit only exists locally. Say which sub-item came from which.

## 1. Collect the measurements

From the repository root. Write all output to the scratchpad or the
git-ignored `output/`, never into the tree.

1. **Raw HTML and headers** (A, B5, G1, G2). Every public route, plus one
   nonexistent clinic route for the soft 404 page:

   ```bash
   node scripts/site-audit/page-snapshot.mjs <base>/clinic <base>/clinic/doctors ... <base>/booking --out <dir>/snapshot.json
   ```

   Take the route list from the performance evidence shards (step 3) or
   `CLINIC_ROUTES`, not from memory.

2. **Throttled lab vitals** (B1–B3), Pixel 7 with 4× CPU and Slow 4G, median of
   three cold runs. Run it in the background against the preview channel:

   ```bash
   node scripts/site-audit/lab-vitals.mjs <base>/clinic <base>/clinic/nasal/septoplasty <base>/booking --out <dir>/vitals.json
   ```

3. **CI evidence for the exact commit** (A6, C1, H1, G4). Download, do not rerun:

   ```bash
   gh run download <run-id> -n web-quality-evidence-accessibility -n web-quality-evidence-ui -D <dir>/ci
   ```

   The accessibility shards carry the axe findings per route. The performance
   shards are unthrottled and only show regressions; a record with zero layout
   shift is `UNAVAILABLE` by the evidence contract, not a failure.

4. **Cheap local gates** (B4, D1): `corepack pnpm run check:perf` and
   `corepack pnpm run check:tokens`.

5. **Visual score** with [ui-score](../ui-score/SKILL.md). The corpus run is
   slow; reuse an existing `output/design-score/` (copy it from another worktree
   if needed) and score only the subject pages with `url` mode, then `report`.
   Look at every screenshot before answering the four VisAWI-S items.
   Before deducting C3 for its "targets under 44 px" count, find those elements
   in the browser: the scorer measures the element box, so a card title whose
   link stretches over the whole card through `::after` is counted as small
   although the real target is the card.

## 2. Judge the rest

- D2, D3, E: compare desktop and phone screenshots of `/clinic`, one service
  page and every `/booking` step. Cite the screenshot for each deduction.
- F: sweep all public copy, captions, alt text and JSON-LD with the rules in
  [ui-content](../ui-content/SKILL.md). Quote each finding with `file:line`.
  This sweep is large and read-only, so delegate it to a subagent when the
  session allows one. An AI or owner reading is not clinical or legal review.
- H2–H4: read the tests, file sizes, decision register and deployment record.

## 3. Score and report

Apply the caps before adding up. An item you could not measure scores zero and
is listed as `NOT_RUN` or `UNAVAILABLE` with the reason; never fill it in from
an older run or an estimate. Write the record in the rubric's report format,
add it to the Review record section of `docs/README.md`, and run
`corepack pnpm run check:docs`.

When comparing with an earlier audit, compare dimension by dimension and say
which changes come from the site and which from a rubric change.

## Discipline

- **A score is not a gate.** A failing gate stays a failure whatever the total.
- **No Goodhart.** Do not change the site to move one sub-item while the page a
  visitor sees gets worse.
- **Same conditions only.** Lab vitals and visual metrics compare only within
  one machine, one network profile and one corpus.
- **No real data.** Screenshots and quotes come from synthetic content only.

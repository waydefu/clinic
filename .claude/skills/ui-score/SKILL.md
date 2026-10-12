---
name: ui-score
description: Score a rendered web page programmatically for visual quality and run the motion lint and accessibility hard gates, using research-backed metrics (complexity, edge density, whitespace, alignment, colourfulness, typography, balance, CTA saliency) calibrated against a corpus of award-winning versus ordinary sites. Use inside the ui-design loop, before and after a visual change, and when comparing design versions. Advisory evidence only - never a gate, never a substitute for looking at the page.
---

# Score a page's visual quality

The scorer lives in `scripts/design-score/` (research tooling, not a gate). It
measures the same thing a person sees first: a 1440 × 900 desktop and a
390 × 844 phone view, the first screen plus up to six screens down the page.
Why each metric exists, its formula and its evidence are in
[`docs/design/2026-10-12-design-research.md`](../../../docs/design/2026-10-12-design-research.md) §8.

## Run it

Pages are served from the built site (`corepack pnpm run build:web`, then the
test-only server on port 3210), or from any URL.

```bash
node scripts/design-score/score.mjs url http://127.0.0.1:3210/clinic --name clinic-home --out output/design-score
node scripts/design-score/score.mjs corpus scripts/design-score/corpus.json --out output/design-score
node scripts/design-score/score.mjs report --out output/design-score
```

Results go to `output/design-score/` (git-ignored). Never use `test-results/`:
Playwright empties it on every run. Each page writes `<name>.json` and first-screen PNGs; `report` writes
`report.md` and `report.json` with the composite, its seven components, the
per-metric award-versus-ordinary comparison and the validation AUC. Existing
results are reused unless `--force`. The corpus run takes about 1–2 minutes per
site on this machine; run it in the background.

## Read the report in this order

1. **Hard gates** (outside the score): contrast failures, targets under 24 px
   (and under 44 px against the owner's requirement), motion lint violations.
   Any failure is a defect regardless of the score.
2. **Per-metric table**: award median, ordinary median, single-metric AUC and
   model weight for each of the 22 metrics. A page far from the award median on
   a strongly separating metric is a prompt to look at that aspect on the
   screenshot.
3. **Award-likeness** (0–100%): a fitted L2 logistic model over 22 metrics,
   trained on award versus ordinary sites; labelled sites are scored by the
   leave-one-out model. The report lists the metrics pushing each page up and
   down. Use it to compare versions of the same page and to spot regressions.
4. **Raw metrics** in the JSON when a component moves unexpectedly.

The research-prior composite (complexity 0.30; whitespace and alignment 0.15;
colour, typography, balance, focus 0.10) **failed validation** on 2026-10-12
with AUC 0.23 — award health sites here are bolder, less balanced and have fewer,
larger objects than the literature's "simple is better" predicts. It is kept
only as a descriptive comparison. The fitted model reached a leave-one-out AUC
of 0.757 on 7 award and 10 ordinary sites: useful, not decisive.

## Discipline

- **Look before you believe.** Confirm every movement on the screenshot. The
  best published models explain about half of human appeal ratings.
- **No Goodhart.** Do not optimise one metric; a lower alignment count with a
  monotonous page is worse, not better.
- **Gates are never traded for score.** Accessibility failures cannot be offset.
- **Same conditions only.** Compare numbers measured on the same machine, fonts
  and viewport settings; cross-OS numbers are not comparable.
- **Validation before trust.** The composite is trustworthy only as far as the
  latest corpus AUC shows (award versus ordinary sites). Report the AUC and the
  sample sizes with any claim. Human ratings (500 ms exposure, 9-point scale,
  or the 4-item VisAWI short form) remain the final criterion.

## Maintain the corpus

`scripts/design-score/corpus.json` labels: `award` (Awwwards health/clinic
Honorable Mention or Site of the Day since 2023), `nominee` (same category,
nominated without an award), `baseline` (ordinary Taiwanese clinic sites),
`subject` (this project's versions). Read award status and live URL from each
Awwwards site page when adding entries; record the collection date. Sites that
time out or block automation stay listed with their error; never fabricate
values. The pure metric functions have unit tests in
`scripts/design-score/metrics.test.mjs`; change formulas only together with
their tests.

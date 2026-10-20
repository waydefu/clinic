# Visual system values

Concrete values for the clinic site, with the current token that carries each
one in `apps/web/public/clinic-site.css`. Where the current token differs from
the target, the row says so; change tokens deliberately (with `check:tokens`
and its ceilings), never with literals. Sources and confidence for every value
are in [`docs/design/2026-10-12-design-research.md`](../../../../docs/design/2026-10-12-design-research.md).
Values are starting points to verify on the rendered page, not acceptance rules.

## Type

| Role | Target | Current token / note |
| --- | --- | --- |
| Body text | 16 px floor; 17–19 px on desktop reading pages | `--clinic-text-body` 1rem; a fluid body step is a candidate |
| Secondary / footer | 14 px minimum, never smaller | `--clinic-text-micro` 0.875rem |
| Scale | ratio 1.2 on phones → 1.25 on desktop, interpolated (Utopia) | fixed 1.2 scale `--clinic-text-md`…`5xl`; h1 uses `clamp(2xl, 1rem + 2.2vw, 4xl)` |
| Page title (h1) | at most two lines at 320 px; `text-wrap: balance` | `.clinic-arrival__copy h1`, inner-page h1 |
| Weights | rely on 400 and 700 only | `--clinic-weight-regular` / `-bold`; avoid 500/800 for hierarchy |
| Font stack | `'PingFang TC', 'Microsoft JhengHei', 'Noto Sans TC', 'Noto Sans CJK TC', 'Heiti TC', sans-serif` | `--clinic-font-sans`; serif system faces render thin on Windows, so headings stay sans |

Fluid step formula: `size = min + (max − min) · (100vw − 360px) / (1240px − 360px)`,
written `clamp(min, intercept + slope·vw, max)` with a rem intercept so user zoom
still works.

## Traditional Chinese typesetting

- **Measure:** 17–40 Han characters per line for prose, never above 48
  (W3C clreq; WCAG 1.4.8 says 40 for CJK). Set widths in **em**, not `ch`
  (`ch` measures the narrow "0"): prose `max-inline-size: 34em`–`36em`, leads
  `28em`–`30em`. ui-score reports the measured median and P95.
- **Leading:** body 1.75 (long-form 1.8), h1 1.3, h2 1.4, h3 1.5, never above
  2.0. Never leave CJK prose at `line-height: normal` (about 1.3 with system
  fonts); ui-score reports the share of prose left unset.
- **Tracking:** body +0.02em (`--clinic-tracking-tight`), never above +0.05em;
  display headings 0 to +0.02em; never negative on Han text.
- **Wrapping:** `text-wrap: balance` on headings and short leads,
  `text-wrap: pretty` on paragraphs and list items; check for one- or two-character
  last lines at 320, 375, 768, 1280 px. Protect the last two to four characters
  of a heading with a class carrying `white-space: nowrap` when needed (classes,
  not style attributes, because of the CSP). Never `word-break: keep-all` on
  Chinese prose. A one- or two-clause lead or heading that splits mid-phrase
  (「找出原因／後，」) may take `word-break: keep-all; overflow-wrap: anywhere`,
  which breaks it at its punctuation and still wraps a clause too long for the
  line; check it at 320 px (style tiles, 2026-10-12).
- **Punctuation and emphasis:** 「」 and 『』 for quotes; ellipsis and dash take
  two character widths and must not split; emphasis by weight or colour, never
  italics; no justified or centred long text; no typed spaces between Han and
  Latin (`text-autospace` handles it).
- **Numbers:** `font-variant-numeric: tabular-nums` for hours, phone numbers and
  tables.
- **Resilience:** pages must survive WCAG 1.4.12 overrides (line-height 1.5,
  paragraph spacing 2×, letter-spacing 0.12em) and 200% text without clipping.

## Colour

- **Roles, not topics:** warm paper canvas (`--clinic-surface-canvas` #f8f7f2),
  white reading surface, one deep green family for ink and primary action
  (`--clinic-forest`, `--clinic-forest-deep`), a quiet mist tint
  (`--clinic-mist`) and the amber focus ring. Award-recognised health sites use
  the same pattern: warm off-white plus one deep accent, not cold white and blue.
- **Families:** at most three; build each as a 12-step semantic scale
  (backgrounds 1–2, component states 3–5, borders 6–8, solids 9–10, text 11–12).
- **Future tokens:** prefer OKLCH with fixed hue and stepped lightness, derive
  hover with relative colour syntax, keep an sRGB-safe value.
- **Contrast targets above the minimum:** body text ≥ 7:1, secondary ≥ 4.5:1,
  focus ring ≥ 3:1 against both neighbours and visible in forced-colors mode.
  Measure text over photographs against the real image region.

## Space and grid

- One spacing scale for everything: the repo scale 0.125/0.25/0.5/0.75/1/1.25/
  1.5/2/3/4 rem. Section padding `clamp(3rem, 6vw, 4rem)`; inside groups tighter
  than between groups; heading space-before about twice space-after.
- Content width `--clinic-shell` (76 rem max); prose columns narrower (34–36 em).
- An editorial grid may place a narrow text column off-centre with images that
  break out once per page; asymmetry must sit on the grid. ui-score's alignment
  count should fall, not rise, as a page is refined.

## Images

- Give every image a role (protagonist, evidence, diagram, quiet field) and a
  reserved size (`width`, `height`, `aspect-ratio`). The `height` attribute
  becomes a CSS height, so a cropped image also needs `height: auto` or an
  explicit CSS height, or `aspect-ratio` and `object-fit` are silently ignored
  and the image renders at the file's pixel height. Use `<picture>` only for
  real art direction between breakpoints.
- Real rooms and people, light from one direction, a grade consistent with the
  palette. No text over busy photographs; text below or beside the photo.
- Illustrations sit on the shared paper colour (`SERVICE_PAPER` in
  `scripts/build-clinic-assets.mjs`); circular art is cut out whole (`disc`
  mode); nothing should look cut off at the frame edge.
- Owner-protected complete infographics keep their whole canvas and ratio.

## Depth and surface

- One light source. Prefer hairlines (`--clinic-line`) and background steps to
  cards; when depth is needed use at most two elevation levels with layered,
  low-opacity shadows tinted toward the background hue. Do not animate shadows.
- Radii from the token set; concentric radii (outer = inner + padding).

## Details that read as craft

Optical alignment on icon side of buttons; tabular numerals; no layout shift on
hover or focus; no weight change on state; images on tinted backgrounds get a
1 px translucent edge; loops pause off-screen; focus rings follow radius.
The [critique and polish checklist](visual-review.md) turns these into a pass.

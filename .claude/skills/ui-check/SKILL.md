---
name: ui-check
description: Verify a web or UI change in this repository against the project's own interface rules - run the automated UI gates, then drive the built site in a browser across the viewport, theme, keyboard and data-state matrix, and report which acceptance items automation cannot reach. Use after any change under apps/web that alters rendered output, layout, copy, tokens or assets.
when_to_use: After editing apps/web, clinic or patient page markup, CSS, design tokens, images, or an e2e spec; when asked to check responsiveness, accessibility, dark mode, mobile layout or a visual regression.
---

# Verify a UI change

The acceptance criteria are **already written**:
[`docs/design/ui-ux-rules.md`](../../../docs/design/ui-ux-rules.md), rules R-1 to
R-26 and the mandatory matrix in §5. This skill executes that matrix. Do not
substitute a checklist of your own.

## 1. Automated gates

From the repository root:

- `corepack pnpm run check:ui` — loopback binding, synthetic-only inputs,
  landmarks, live regions, `:focus-visible`.
- `corepack pnpm run check:tokens` — raw colour/spacing/type values.
- `corepack pnpm run check:pages` — public page inventory.
- `corepack pnpm run check:perf` — budget closure. Remember it only sees the
  reference forms it follows; see the web rule for what it still cannot see.
- `corepack pnpm run check:e2e-groups` — a spec in no group never runs in CI.
- `corepack pnpm run test:e2e $(node scripts/e2e-groups.mjs --files ui)` and the
  same for `mobile` and `accessibility`. Add `patient-portal` when the clinic
  site changed — that is the only group covering WebKit.

## 2. Drive the real artifact

Start the preview from `.claude/launch.json` rather than an ad-hoc server:
`web-dist` serves the built, content-hashed output that CI and Hosting actually
serve; `web-public` serves the source tree. Prefer `web-dist` for anything
involving assets, caching or bundling — build first.

Then walk the matrix, taking evidence as you go:

| Axis | Cover |
| --- | --- |
| Viewport | 375 mobile, 768 tablet, 1280 desktop |
| Theme | light, dark, and 200% text scaling |
| Input | keyboard-only traversal with visible focus, and touch targets |
| Motion | `prefers-reduced-motion` honoured |
| Data state | loading, empty, error, offline, and the populated case |

Read the accessibility tree rather than only screenshotting — it is what proves
names, roles and structure. Screenshot for the visual claim.

## 3. Say what you could not verify

Contrast measured on real hardware, screen-reader behaviour, physical devices and
virtual keyboards are outside this environment. Report those items as
`External manual verification required` against their §5 row. Never report them
as passed.

## 4. Visual baseline

If the change is intentionally visual, retake the baseline with
`corepack pnpm run capture:ui` and let `check:structure` re-verify the manifest.
Never edit a sha256 or dimension in the manifest by hand.

## Done when

Every automated gate above has a status, the matrix rows are covered with stated
evidence (screenshot, accessibility tree, spec result), the external-only items
are named as such, and the evidence rung is reported per `CLAUDE.md`.

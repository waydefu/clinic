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

Design direction and visual refinement use [ui-design](../ui-design/SKILL.md).
This skill validates the implemented result; it does not select a new style.
Read the current brief/handoff so intentional changes are distinguished from
regressions. A visual score does not establish a gate PASS.

## 1. Automated gates

From the repository root:

Check runtime/dependencies and select applicable gates using
[verify-gates](../verify-gates/SKILL.md). For clinic changes, include
`check:clinic-freeze`; a prototype's expected failure stays FAIL and does not
grant authority to change the freeze record.

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

That E2E example uses POSIX argument splitting. In PowerShell, pass each path
as a separate argument and retain each group's exit code:

```powershell
$uiGroupResults = @{}
foreach ($group in @('ui', 'mobile', 'accessibility', 'patient-portal')) {
  $specLine = node scripts/e2e-groups.mjs --files $group
  if ($LASTEXITCODE -ne 0) { throw "Cannot resolve E2E group: $group" }
  $specFiles = ($specLine -join ' ').Trim() -split '\s+'
  corepack pnpm run test:e2e @specFiles
  $uiGroupResults[$group] = $LASTEXITCODE
}
$uiGroupResults
```

Select groups from the change: booking changes need `patient-portal`; workbench
flows may also need `appointments` or `auth-rbac`. Resolve membership from
[`scripts/e2e-groups.mjs`](../../../scripts/e2e-groups.mjs), not a copied list.
Targeted checks help diagnose failures but do not establish that an omitted
required group passed. Mark deliberately deferred groups NOT_RUN and name the
exact-commit CI job that will supply their evidence.

## 2. Drive the real artifact

Start the preview from `.claude/launch.json` rather than an ad-hoc server:
`web-dist` serves the built, content-hashed output that CI and Hosting actually
serve; `web-public` serves the source tree. Prefer `web-dist` for anything
involving assets, caching or bundling — build first.

Then walk the matrix, taking evidence as you go:

| Axis | Cover |
| --- | --- |
| Viewport | §5.5 representative captures: 375×812, 1280×900, one critical flow at 320×568; also tablet and the affected breakpoint boundaries |
| Theme and reflow | light, dark, warm/護眼; 200% text scaling and 320px reflow, with forced-colors where supported |
| Input | keyboard-only traversal with visible focus, and touch targets |
| Motion | `prefers-reduced-motion` honoured |
| Data state | §5.4: 0/1/many rows, long content, validation/conflict/denial, loading/success/failure/retry/timeout/offline/maintenance as applicable to the flow |

Read the accessibility tree rather than only screenshotting — it is what proves
names, roles and structure. Screenshot for the visual claim.

Run automation on the content-hashed build as §5.1 requires. A source-tree
prototype can supply bounded design evidence but cannot substitute for built
artifact verification. Identify untested matrix rows instead of extending a
first-screen screenshot claim to the whole page or flow.

## 3. Say what you could not verify

Contrast measured on real hardware, screen-reader behaviour, physical devices and
virtual keyboards are outside this environment. Report those items as
`External manual verification required` against their §5 row. Never report them
as passed.

Browser contrast checks and axe results are evidence for their tested scope.
Text scaling by CSSOM is a proxy; viewport narrowing is a reflow check, not
proof that a human exercised browser zoom. WebKit and mobile descriptors do not
complete the real iPhone/Android, assistive-technology or keyboard matrix.

## 4. Visual baseline

If the change is intentionally visual, retake the baseline with
`corepack pnpm run capture:ui` and let `check:structure` re-verify the manifest.
Never edit a sha256 or dimension in the manifest by hand.

Use the fixed seed/time and environment manifest required by §5.5; inspect the
captured images. Keep prototype comparisons separate from the formal baseline
and preserve unrelated reference evidence. Screenshots complement semantics,
geometry, interaction and performance checks; they do not replace them.

## Done when

Every automated gate above has a status, the matrix rows are covered with stated
evidence (screenshot, accessibility tree, spec result), the external-only items
are named as such, and the evidence rung is reported per `CLAUDE.md`.

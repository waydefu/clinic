# Anime.js evaluation for this repository

Use the exact package version, build and feature set under consideration. This
reference records 2026-10-07 research on Anime.js 4.5.0; future versions require
new measurements. The package supports browser ESM without React.

**Owner decision (2026-10-10, recorded in the
[decision register](../../../../docs/product/phase-1-decision-register.md)):**
Anime.js is not added to the project. Learn its techniques and implement them
with CSS and the native Web Animations API. Adopting the library later needs a
new owner decision and every prerequisite in
[Before any adoption](#before-any-adoption).

## Technique, native implementation and repository verdict

Use this table to translate an Anime.js idea into the project's own code. The
verdict reflects the current CSP/Trusted Types policy, budgets, R-17 and
medical-advertising limits; it is not a judgement of the library.

| Anime.js technique | Native implementation here | Verdict |
| --- | --- | --- |
| `animate`, keyframes, easing | CSS transition/`@keyframes`, or `element.animate()` | Use native. The JS engine alone is 12,561 B gzip (table below). |
| `stagger` (time, grid, from centre) | One CSS custom property multiplied into `animation-delay`; the site already has `--clinic-stagger-*` | Learn the ordering idea. R-17 forbids domino-style entrances of whole sections. |
| `timeline` (labels, relative offsets) | Classes with ordered delays, or sequenced native WAAPI effects | Learn "the first screen is one score": one ordered entrance, written once. |
| Spring easing | CSS `linear()` or a cubic-bezier token | Only over-damped (no bounce). Bounce conflicts with the calm direction; Safari loses acceleration with custom `linear()`. |
| `onScroll` thresholds and progress | IntersectionObserver for one-time entry; CSS scroll-driven animation only behind `@supports` | Do not use the library helper: it listens to scroll events and its debug overlay writes `innerHTML`. Scroll-linked and parallax motion breaks R-17. |
| `splitText`, `scrambleText` | Readable headings; at most the site's existing word wrapper, never per-character Han splitting | Do not use. The splitter writes `innerHTML` (blocked by Trusted Types); per-character splitting breaks Chinese line breaking and punctuation. |
| `createDrawable` (SVG line drawing) | `pathLength="1"` with CSS `stroke-dashoffset`, toggled by a class | Usable, native, for non-anatomical brand line art only. |
| `morphTo`, `createMotionPath` | CSS `offset-path` for a path; no stable native morph | Never on medical figures: changing anatomy implies an outcome (see medical claims in [ui-content](../../ui-content/SKILL.md)). |
| `createDraggable` | Scroll snap and buttons | Do not use. Drag-only control fails keyboard access; a before/after slider implies results. |
| Layout/FLIP (4.3+) | Hand-written FLIP or View Transitions where supported | Not needed: the site has no reflowing interaction to animate. |
| `waapi.animate` wrapper | Native `element.animate()` | Use native. The wrapper's cleanup is the suspected WebKit violation path (CSP section). |
| `createScope` (media queries, revert) | One controller with `matchMedia` change listeners and an `AbortController` | Learn the structure: a single owner of setup and teardown. |

## Select by required behaviour

| Need | Candidate | Decision to demonstrate |
| --- | --- | --- |
| Short control feedback | CSS transition | State/focus update immediately; no JS engine needed solely for colour |
| Finite DOM opacity/transform relationship | Native WAAPI or `animejs/waapi` | What orchestration/reuse benefits justify the wrapper and measured cost? |
| Several coordinated time offsets, object/SVG attributes or JS callbacks | Anime animation/timeline subpaths | Which essential relationship requires the JS engine rather than independent effects? |
| Scoped media-query setup/teardown | Explicit controller or `animejs/scope` | Are app listeners, observers, timers and pending work actually cleaned up? |
| One-time viewport entry | Native IntersectionObserver, if needed | Is content visible before the trigger, and is this more useful than a still composition? |
| Continuously scroll-linked animation | Anime events only after a specific design need | Does it help reading enough to justify its cost and interruption complexity? |

The [official WAAPI comparison](https://animejs.com/documentation/web-animation-api/when-to-use-waapi/)
advertises 3 KB gzip for WAAPI and 10 KB for JS animation. Those are vendor
figures, not this repository's closure. Narrow imports express scope; root named
imports can also tree-shake. Measure instead of declaring either import style
automatically cheap or expensive. Do not expose the whole namespace by default.

## Isolated measurements, not a production budget PASS

2026-10-07: npm 4.5.0 tarball SHA-512 integrity verified; esbuild 0.28.1, browser
ESM, ES2022, minified, `legalComments: eof`, Node zlib gzip default level. Entries
export the listed functionality; real usage and shared chunk compression can
change size. No package lifecycle scripts or app dependency installation ran.

| Isolated entry | Minified bytes | Gzip bytes |
| --- | ---: | ---: |
| `animejs/waapi` | 10,380 | 4,686 |
| WAAPI + scope | 13,386 | 5,536 |
| WAAPI + events + scope | 53,337 | 19,857 |
| `animejs/animation` | 31,367 | 12,561 |
| `animejs/timeline` | 35,013 | 13,811 |
| Root named WAAPI export | 10,477 | 4,692 |
| Root whole namespace export | 120,738 | 42,800 |

The homepage prototype measured 200,314 B gzip transfer on 2026-10-07, leaving
4,486 B under its 200 KiB ceiling. The v14 prototype measured 203,121 B on
2026-10-10, leaving 1,679 B ([handoff](../../../../docs/reviews/2026-10-10-clinic-ui-design-implementation-handoff.md)).
Isolated WAAPI alone (4,686 B) now exceeds that slack by about 3 KB before any
application work; adopting it would first require removing weight elsewhere. This flags allocation pressure; adding separate gzip
totals does not establish the cost of a combined bundle. Do not claim it fits or
can never fit until the actual replacement/shared-entry build is measured.

Formal `/clinic.html` limits remain total 200 KiB, JS 20 KiB, CSS 14 KiB,
images 180 KiB / 14 assets and fonts 0 KiB. Reconcile asset allocation and full
built-route closure; deferred requests and CDN imports are not loopholes. Six
slides can reuse allocated photos; they are not permission for six new requests.

## API and lifecycle distinctions

Use [v4 WAAPI API differences](https://animejs.com/documentation/web-animation-api/api-differences-with-native-waapi/)
when translating code: Anime uses `ease`, while native WAAPI uses `easing`.
Do not mix native options, Anime v3 examples and v4 methods by name alone.
Native `Animation.finished` is not Anime's wrapper completion API.

[Native cancellation](https://developer.mozilla.org/en-US/docs/Web/API/Animation/cancel)
removes an effect; an active `finished` promise can reject with `AbortError`.
Handle expected cancellation and ignore obsolete completion generations.
In the inspected v4.5.0 WAAPI implementation, Anime `cancel()` first commits
styles, then cancels underlying animations and suppresses completion resolution;
`revert()` additionally restores tracked inline values. Do not assume awaiting
its wrapper will finish after cancellation, or that `cancel()` restores CSS.

[Scope revert](https://animejs.com/documentation/scope/scope-methods/revert/)
reverts registered Anime objects and executes returned cleanup functions.
Application listeners are not magically removed because they were created in
a scope. Return explicit cleanup for listeners/observers/timers and guard async
work. [addOnce](https://animejs.com/documentation/scope/scope-methods/addonce/)
persists objects across media-query refreshes; avoid it for motion that should
stop when reduce becomes active. Global document-hidden engine settings do not
manage gallery intent, decode races or BFCache recovery.

On reduce, cancel effects/scheduling and expose the valid static selection.
Pending decodes must not restart animation afterward. Preserve user pause intent
and avoid duplicate controllers on repeated pageshow. Pagehide of a persisted
page may need suspension rather than permanent destruction; restore/dispose
according to the page's actual lifecycle, not a copied SPA hook.

## CSP and Trusted Types are feature-specific

Test against the headers from
[csp-policy.mjs](../../../../apps/web/csp-policy.mjs), including `style-src 'self'`
and `require-trusted-types-for 'script'`. Serve self-hosted ESM and external CSS.
Record violations through completion, cancellation and teardown. A working
startup or changing computed opacity is insufficient evidence of policy fit.

The isolated lab used synthetic DOM at 1440px/375px, Chromium 149 and desktop
WebKit 26.5, initial normal/reduce and mid-flight preference changes. Basic
WAAPI-wrapper effects rendered and reverted to static CSS. Chromium's tested
motion path had no CSP violations. In WebKit, normal-mode wrapper cleanup emitted
`style-src-attr` violations for opacity-only and opacity/transform trials, despite
restoring the correct computed state. A native WAAPI + native `cancel()` control
did not emit motion-path violations. Reduced mode without creating effects was
also clean. Therefore this tested wrapper/cleanup path is not accepted under the
current WebKit policy. The observed association with style commit/cleanup needs
an exact-path solution and a new test; do not weaken policy or extrapolate it to
every Anime feature. Physical Safari was not tested.

Source lead (likely, not yet proven by a test): in 4.5.0 the WAAPI wrapper's
`cancel()` calls `commitStyles()` before cancelling
(`dist/modules/waapi/waapi.js`, around line 437), and committing writes inline
style. To turn the lead into a decision, add a lab control that calls native
`element.animate(...).commitStyles()` and then `cancel()` under the same policy:
if it reproduces the WebKit violation, the cause is style commit itself. The
`onScroll` debug overlay also writes `innerHTML` (`dist/modules/events/scroll.js`,
around line 645); never ship debug mode.

Anime `splitText(..., { chars: true })` attempted a protected `innerHTML` write
and raised `TypeError` requiring TrustedHTML in both tested browsers. It cannot
be copied into this policy unchanged. Keep readable semantic headings; do not
add a permissive/default Trusted Types policy, `unsafe-inline` or `unsafe-eval`
as a workaround. Other text/SVG helpers need their own exact-path evaluation;
the splitter result does not prove every Anime feature is incompatible.

Hardware acceleration also needs measurement. The
[official acceleration guidance](https://animejs.com/documentation/web-animation-api/hardware-accelerated-animations/)
notes browser-specific property/easing differences, including Safari's custom
`linear()` easing limitation. Use suitable CSS cubic-bezier for a portable
candidate and inspect dropped frames/layout/paint on target browsers. Desktop
WebKit compatibility is not physical iPhone acceptance or GPU-performance proof.

## Before any adoption

Bytes are only one condition. All of these must hold before any Anime.js module
enters the site:

1. A new owner decision in the decision register (Safety Floor rule 7); the
   2026-10-10 decision is not to add it.
2. A bundling path. `scripts/build-web.mjs` minifies and hashes each public ES
   module separately without bundling it, and the clinic budget sets
   `moduleGraph.maxDiscoveryDepth` to 1. Anime subpaths import several levels of relative modules, so adoption
   needs an explicit bundle step (as `bundleCalendarPilot` does for the CAL-PILOT
   client) and a measured closure.
3. A budget allocation that names what is removed or which approved increase
   pays for it.
4. Supply-chain gates: the dependency, lockfile, SBOM and licence check.
5. A Chromium and WebKit CSP/Trusted Types lab pass for the exact features,
   through completion, cancellation and teardown.

## Evidence and provenance

Record version/integrity, feature imports, bundler/target, minified and transfer
bytes, exact policy, browser/version, trigger, normal/reduced/interrupted states,
console/violation results and cleanup. Attribute harness-injected failures
separately with a control run; do not silently discard errors. Isolated lab
results establish neither the clinic's visual quality nor formal route closure.

[v4.5.0 release](https://github.com/juliangarnier/anime/releases/tag/v4.5.0),
[package exports](https://github.com/juliangarnier/anime/blob/v4.5.0/package.json)
and [WAAPI implementation](https://github.com/juliangarnier/anime/blob/v4.5.0/src/waapi/waapi.js)
are upstream references; installed/extracted source and measured output remain
the evidence for the tested version. This reference is authored project guidance,
not vendored code or an automatic upgrade hook.

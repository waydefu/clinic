# Product Excellence Audit v1

**Type:** dated product evidence. Not Canon. Not a D-series decision. Not implementation authority.
**Date of retrieval / inspection:** 2026-09-02
**Base:** `origin/main` `65d77eeb8dc1639584aa057756c208e59bccbbdf` (PR #45 env config on top of PR #44)
**Phase 0 relationship:** PVR enablement is **DISABLED** and **BLOCKED** on GitHub Administration write; dated closeout is a **separate** PR ([#46](https://github.com/waydefu/clinic/pull/46)), not stacked under this audit. That review file is not on this branch.
**This file’s commit:** unknown at write time. Lookup: `git log -1 -- docs/reviews/2026-09-02-product-excellence-audit-v1.md`

Machine-readable register (evidence/backlog, not Product Canon):
[findings.json](assets/product-excellence-audit-v1-2026-09-02/findings.json).

## Executive Summary

The repository already knows how to prove that a change is **safe**. This audit asks whether the **healthcare product** being protected is excellent.

**Score: 61 / 100.** Band: **significant product debt** (60–69), touching the lower edge of a developing product. Confidence in the *number* is **MEDIUM** (evidence caps bind several dimensions; no user research, no AT, no field metrics). Confidence that the product is **not** yet in the 85+ “strong mature product” band is **HIGH**.

This is **not** a student project. The synthetic booking stepper, privacy-safe lookup errors, `<20 minute` phone fallback, ICS minimisation, and staff “illegal actions are not rendered” pattern are commercially serious engineering. They are also **not** evidence that worried, ill, or low-literacy patients, or interrupted front-desk staff, can complete the right task.

Governance, CI, SAST, SBOM, and test counts **do not add points**. Prior UX scores are dated and were **not inherited**.

Top gaps:

1. No actual or potential **user research** (ISO 9241-210 / NHS / GOV.UK point 1).
2. Public **recovery and front door** send lost users toward the staff workbench (`/` + published synthetic credentials).
3. Patient **cancel semantics** disagree with the UI contract, D-005 owner input, and domain `request_cancellation`.
4. Public **service language** (nasal/sleep pages) disagrees with booking items (`止鼾` / `醫美`).
5. No **product outcome metrics** and no human AT evidence.

**Mode honour:** this audit implements **no** product fix.

---

## 1. Scope and Method

**In scope:** currently implemented and currently authorised **synthetic** surfaces under `apps/web/public`: clinic marketing SPA, `/booking`, `/privacy`, `/`, `/404.html`. Staff workbench is test-only auth + `localStorage`.

**Out of scope as product claims:** production booking, real patient data, Cloud Firestore/Auth, payments, surgery records, production Calendar. Those remain Safety Floor / D-series blocked. They are classified, not scored as missing features.

**Method:**

1. Authority read: `AGENTS.md`, `GOVERNANCE.md`, `CLAUDE.md`, `docs/INDEX.md`, decision register, UI rules, test-only operations UI, product vision (plan-only).
2. Progressive retrieval of routes, modules, E2E, visual baselines.
3. External standard re-check (primary sources where reachable) on 2026-09-02.
4. Heuristic evaluation and cognitive walkthrough by an expert reviewer. **Not user research.**
5. Rendered evidence: C6 dist baselines (2026-08-23) plus 2026-09-02 local `public/` captures (supplementary, not a new visual baseline).
6. Scoring against mature commercial healthcare/service products, with this audit’s evidence caps.

**Internal ledger (not Canon):**

```text
CURRENT_MAIN     65d77ee
CURRENT_PHASE    audit-v1
AUTHORITY_READ   yes
SCREENS_INSPECTED clinic, doctors, nasal, booking 1–3/success/cancel, privacy, 404, login, workbench overview/queue
EVIDENCE_AVAILABLE C6 PNGs; 2026-09-02 local PNGs; source; e2e/axe/gates; dated reviews
EVIDENCE_MISSING  user research; AT; field perf; tablet/dark as baseline; dist-captured clinic-current
OPEN_FINDINGS    see §22
UNRESOLVED_CONFLICTS  GC-001 visibility; D-001–D-005, D-011 pending; PVR disabled
```

## 2. Authority and Evidence Boundaries

| Layer | This audit treats it as |
| --- | --- |
| Decision register | Only source of D-series status |
| `docs/design/ui-ux-rules.md` | Product UI engineering rules, not visual excellence |
| `docs/design/test-only-operations-ui.md` | Synthetic UI contract |
| `docs/product/product-vision.md` | Plan-only positioning |
| C6 visual review | Dated rendered evidence |
| Tests / CI | Enforcement, not product quality |
| This file | Dated evidence |

**Stop conditions used, not guessed:**

| Token | Where |
| --- | --- |
| `REQUIRES_DOMAIN_AUTHORITY` | D-005 cancel policy; D-004 horizon; 醫美 vs nasal catalogue |
| `REQUIRES_OWNER_AUTHORITY` | Real-user analytics; production URL (D-011) |
| `REQUIRES_HUMAN_EVIDENCE` | Usability studies; AT |
| `REQUIRES_PRODUCTION_EVIDENCE` | Field performance, live Hosting 404 behaviour |

No clinical rule was invented. Follow-up “only after physician confirmation” is recorded as an implemented guard, not as medical advice.

## 3. External Standards Verified

Retrieval date: **2026-09-02**. No ISO/NHS/W3C/Apple/MODA certification is claimed.

| Reference | Current status verified | Use in this audit |
| --- | --- | --- |
| **ISO 9241-210:2019** | [iso.org/standard/77520.html](https://www.iso.org/standard/77520.html): Edition 2, 2019; last reviewed/confirmed **2025**; stage **90.93**. | HCD process: users, context, involvement, evaluation, iteration. |
| **ISO/IEC 25010:2023** | [iso.org/standard/78176.html](https://www.iso.org/standard/78176.html) Edition 2, 2023; nine-characteristic product-quality model. Secondary summaries (not a substitute for the paid text) list: functional suitability, performance efficiency, compatibility, **interaction capability**, reliability, security, maintainability, **flexibility**, **safety**. The 2011 edition (usability / portability, no Safety characteristic) was **not** used. | Quality decomposition only. |
| **WCAG 2.2** | W3C Recommendation; current TR page dated **12 December 2024** (editorial). Original Rec **5 October 2023**. W3C still advises using the latest WCAG 2.x. Also published as **ISO/IEC 40500:2025**. WCAG 3 remains a Working Draft. | Normative web a11y baseline. Axe ≠ conformance. |
| **NHS Service Standard** | [service-manual.nhs.uk/standards-and-technology/service-standard](https://service-manual.nhs.uk/standards-and-technology/service-standard), updated **January 2026**. 14 GOV.UK points in a health context **plus 3 health points** (15 culture of care, 16 clinically safe, 17 interoperable). | Healthcare **lens**, not Taiwanese law. |
| **GOV.UK Service Standard** | [gov.uk/service-manual/service-standard](https://www.gov.uk/service-manual/service-standard): **14 points**. Point 14 last updated **29 January 2026**. GDS is *evolving* the standard (blog 2026-07-02); the live 14 points remain the current baseline. Point 2: design around **user needs**, not technology, including generative AI and pre-selected COTS. | Whole-problem / anti-implementation-bias. |
| **NN/g 10 heuristics** | [nngroup.com/articles/ten-usability-heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/). Last reviewed **30 January 2024**. Heuristics unchanged since 1994. | Heuristic evaluation only. |
| **Apple HIG design principles** | Reintroduced **8 June 2026** (WWDC26): Purpose, Agency, Responsibility, Familiarity, Flexibility, Simplicity, Craft, Delight. Official `developer.apple.com` HIG page required JS and did not return usable text in this environment; principles retrieved from the published HIG design-principles text. | **Secondary craft lens only.** Do not make the site look like iOS. |
| **Taiwan 網站無障礙規範 (115.11)** | 數位發展部令 中華民國 **115年5月29日** 數位政府字第 **11540006711** 號：修正規範，**自 115 年 11 月 30 日（2026-11-30）生效**。 Aligns detection with WCAG 2.2 (87 success criteria). | **Forward-looking readiness** on 2026-09-02. Current in-force mark testing remains the previous (110.07 / WCAG 2.1) edition until that date. No badge or legal applicability is claimed. |

## 4. Product Surface Inventory

Audience keys: **public** = clinic/patient; **staff** = synthetic workbench.

### 4.1 Public / clinic

| Route | Audience | Primary job | Secondary jobs | Primary CTA | Destructive | Inputs | Responsive evidence | States | Auto | Rendered | Human | Metrics | Authority |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/clinic` | public | Understand nasal/sleep offering | Hours, doctors, FAQ | 線上預約 → `/booking` | none | none | E2E + 2026-08-10 PNGs; C6 did not re-shot | home, noscript | axe/clinic-site | dated | none | none | Marketing; real booking blocked D-001–D-005, D-011 |
| `/clinic/doctors` | public | Choose a doctor to read | Book | 線上預約 / 醫師介紹 | none | none | scan sample | cards | partial | 2026-09-02 | none | none | same |
| `/clinic/doctors/{slug}` | public | Trust / credentials | Book | 線上預約 | none | none | sample 顏正安 | long-form | partial | dated | none | none | same |
| `/clinic/nasal/*` | public | Service education | Book, SnoreLab on one page | 線上預約 | none | none | sample 止鼾五合一 | long-form | partial | 2026-09-02 | none | none | Content boundary: no aesthetic category pages |
| `/clinic/*` unknown | public | Recover | Home | 返回診所首頁 | none | none | in-shell | not-found panel | clinic-site | CODE-ONLY | none | none | SPA 404, not HTTP 404 |
| `/privacy` | public | Read draft notice | Continue to booking | 已閱讀 → `/booking?notice-read=1` | none | none | e2e + 2026-09-02 | draft banners | axe | 2026-09-02 | none | none | D-001–D-003 pending |
| `/booking` | public | Book / lookup / cancel | ICS | 送出預約; 查詢／取消 | self-cancel when eligible | kind, service, slot, identity | C6 + 2026-09-02 | steps, empty, error, success, ≤20min fallback, maintenance | heavy e2e | C6+live | none | none | Synthetic only |
| `/404.html` | public | Recover | Book or “home” | 前往線上預約 | none | none | file exists | static | listed in public-pages; **not in scan** | 2026-09-02 empty HTTP 404 | none | none | Hosting convention; local server empty body |
| `/` | staff | Login to ops | — | 登入 | none | account/password | 2026-09-02 | error, noscript | axe on `/` | 2026-09-02 | none | none | Test-only; credentials in page |

`CLINIC_ROUTES`: `/clinic`, `/clinic/doctors`, two doctor slugs, four nasal slugs.

### 4.2 Patient booking internals (same `/booking`)

| Surface | Job | CTA | Destructive | Inputs | States | Authority |
| --- | --- | --- | --- | --- | --- | --- |
| Step 1 | 初診/回診 + items | next | none | kind; ≥1 service | 回診 disabled pending physician | D-004 pending for real slots |
| Step 2 | date/time Asia/Taipei | slot | none | month/day/slot | empty days | 60-day engine vs D-004 “1 month” |
| Step 3 | identity | 送出預約 | none | name, phone, birth, ID/passport, checkboxes | field errors | D-001–D-003 test gate only |
| Success | confirm | calendar / lookup | none | — | cancelled copy | ICS omits ID/items/notes |
| Lookup dialog | find bookings | 查詢預約 | **取消這筆預約** if eligible | phone+birth or document+birth | unified miss error | design says request-cancel; **code calls `cancel`** |
| Maintenance | block | refresh | none | — | app removed from a11y tree | staff-triggered |

**Not built:** patient reschedule; staff link from patient chrome.

### 4.3 Staff workbench (`/` after synthetic login)

Hash panels: overview, appointments (create, week calendar, front-desk queue), follow-up, schedule (admin), case, accounts (admin), communications (admin), audit (admin). Payroll panel **frozen** (`PAYROLL_WORKLOAD: false`) — not scored as a missing authorised feature.

CAL-PILOT: not a route; loads only if client-config GET succeeds. Production D-009/D-016 pending.

### 4.4 Classification of functionality

| Capability | Class |
| --- | --- |
| Clinic brochure + booking CTA | IMPLEMENTED (synthetic preview) |
| 3-step book, lookup, ICS | IMPLEMENTED (localStorage) |
| Patient reschedule | AUTHORIZED_BUT_MISSING as a *product* path inside the synthetic ops contract; policy for production is D-005 |
| Immediate patient cancel vs request-cancel | PARTIAL / conflicting |
| Staff queue, arrive, reschedule, delete | IMPLEMENTED synthetic |
| Case assign UI | IMPLEMENTED synthetic; real path BLOCKED_BY_AUTHORITY (D-007) |
| Payroll amounts | BLOCKED_BY_AUTHORITY (D-008/D-015); correctly frozen |
| Real public booking | BLOCKED_BY_AUTHORITY (D-001–D-005, D-011) |
| Physician/consultant apps | OUT_OF_SCOPE until D-006 evidence |
| Surgery/money/clinical persistence | BLOCKED_BY_AUTHORITY (D-014/D-015) |

## 5. Core Journeys

### 5.1 Patient (implemented synthetic)

```text
discover /clinic
→ understand service/doctor
→ start /booking
→ choose kind + item
→ choose slot
→ enter information
→ review/submit
→ retrieve via 查詢
→ cancel if >20 minutes; else phone/social
```

**Missing:** reschedule; account; reminders after ICS decline; server persistence; English (D-011: not wanted).

**Stress walkthrough (expert, not users):** worried/ill/one-handed mobile users meet stacked test banners before Step 1; 回診 is correctly closed but the explanation is clinic-operations language; 醫美 appears as a booking item after a nasal-only marketing journey; lookup uses a unified error (good privacy, harder recovery); cancel may **release the slot immediately** while copy and the operations UI still talk about 取消待確認.

### 5.2 Front desk (implemented synthetic)

```text
login → overview → find in queue/calendar → inspect → 到診/更多處置 → exception (cancel, no-show, delete) → verify chip
```

**Strength:** primary legal action visible; illegal actions not rendered; identity masked in the queue.

**Stress:** “900” available slots on an empty day is a 60-day inventory, not today’s work; 療程 cell appends `appointment.id`; mobile nav is a horizontal strip; credentials are printed on the login card of a **public** repository’s default `/`.

### 5.3 Operations/admin

Schedule publish, accounts, announcement/maintenance, danger-zone reset, fake outbox. Authorised as **test-only**. Clinical safety of follow-up: logger ≠ decision-maker — **OBSERVED** as a good pattern; not a clinical validation.

## 6. Evidence Inventory

| Class | What exists | What does not |
| --- | --- | --- |
| Engineering tests | Unit, rules, E2E groups, axe AA tags, 44px, responsive widths, lab CWV budgets | User task success |
| Visual | C6 17 dist PNGs (booking+workbench); 2026-08-10 clinic; 2026-09-02 local public/ PNGs | Current clinic in C6; tablet/dark/error as baseline; dist capture of 404 |
| Human a11y | Runbook + preconditions spec | VoiceOver/TalkBack/NVDA; real devices |
| Product metrics | none | completion, abandonment, time, help, satisfaction |
| User research | owner questionnaire (input, not studies) | interviews, moderated tests |

2026-09-02 PNGs are **OBSERVED** renders from `apps/web/public` via the test server. `ui-ux-rules.md` §5.5 says approval screenshots must be **dist**. They do not replace C6.

## 7. 100-Point Scorecard

Caps applied: no user research → A ≤ 6; no controlled usability → B ≤ 8; no human AT → G ≤ 8; no product metrics → L ≤ 3.5. Rendered visual evidence **exists** (C6), so E is not capped at 7.

| ID | Dimension | Score | Cap | Notes |
| --- | --- | --- | --- | --- |
| A | User needs & service definition | **5.0 / 10** | 6 | Owner/vision users; no research |
| B | Core journey effectiveness | **7.0 / 12** | 8 | Book/lookup exist; recovery/reschedule/front-door fail |
| C | Efficiency & cognitive load | **6.0 / 10** | — | Staff density intended; 900-slot metric; banner stack |
| D | Interaction quality & recovery | **6.0 / 10** | — | Strong local feedback; cancel/404 semantics fail |
| E | Visual design & craft | **6.5 / 10** | — | Booking craft real; clinic baseline stale; two languages |
| F | Design-system maturity | **5.5 / 8** | — | Tokens+gates strong; three CSS worlds |
| G | Accessibility & inclusion | **6.5 / 10** | 8 | Axe/target/keyboard preconditions; no AT; literacy |
| H | Mobile/responsive | **4.5 / 7** | — | Booking OK; workbench 375; 320 cramped; no device |
| I | Content & terminology | **3.5 / 5** | — | Clear TW copy in places; catalogue split; IDs in 療程 |
| J | Functional suitability | **5.0 / 7** | — | D-blocked not penalised; cancel/horizon/reschedule inside synthetic scope |
| K | Performance & responsiveness | **2.5 / 4** | — | Lab only |
| L | Product evidence & improvement | **1.5 / 7** | 3.5 | Tests ≠ outcomes |
| | **Total** | **61 / 100** | | |

Interpretation: **60–69 significant product debt.** Governance maturity is **out of band** and is not added.

Dimension mapping requested in the programme close-out:

| View | Approx. |
| --- | --- |
| UI engineering | High relative to product (gates, tokens, axe) — **not** a scorecard row |
| Visual design | 6.5 / 10 |
| UX/usability | A+B+C+D ≈ 24 / 42 |
| Accessibility | 6.5 / 10 |
| Mobile | 4.5 / 7 |
| Functional suitability | 5.0 / 7 |
| Product evidence/metrics | 1.5 / 7 |

## 8. User Needs / Service Design

ISO 9241-210 requires explicit users, tasks, context, involvement, and evaluation. NHS point 1 requires clinical, practical, **and** emotional needs.

**What exists:** role split (patient vs staff) is a real product decision; vision names 櫃檯 vs 管理者; owner answers exist as **input**. Follow-up gated on physician confirmation matches a safety story.

**What does not:** no study with prospective patients, older users, AT users, or front-desk staff. LLM personas were **not** used as evidence.

Finding **PX-NEED-001**. Score 5.0 because the *definition* of users is better than a blank page, but evidence of needs is owner-narrative.

GOV.UK point 2 / NHS point 2: the implemented solution is a **browser localStorage SPA** chosen before public booking is authorised. That is honest for Stage 1. It is still “design around a pre-selected implementation” if treated as the future service.

## 9. Journey Effectiveness

**Patient book (synthetic):** first-time 初診 path is complete in e2e. **OBSERVED** stepper, context chip, back links.

**Dead ends:** HTTP unknown URL → Chrome default 404 locally (**PX-INT-004**). Branded `404.html` “回到首頁” → `/` staff login (**PX-JRN-001**). `public-pages.json` already records that `404.html` is “無法用一般路由到達.”

**Reschedule:** staff-only (**PX-JRN-002**). Under stress, “I picked the wrong afternoon” has no in-product recovery except cancel+rebook (and cancel may be blocked inside 20 minutes).

**Staff:** locate → act is designed; daily overview does not match that job when it advertises **900** slots (**PX-JRN-003**).

## 10. Efficiency / Cognitive Load

Staff: Boutique Clinical Command’s “one screen for the day” is the right *intent*. Queue primary actions reduce menu hunting (**VERIFIED** in `test-only-operations-ui.md` §6 and admin-view rendering).

Costs: technical ids in the treatment column (**PX-CONTENT-002**); horizontal workspace tabs on 375 (**PX-MOB-001**); patient Step 1 competes with test banners and 查詢／取消 (**PX-INT-003**). Booking 醫美 after a nasal marketing journey forces a catalogue recall (**PX-CONTENT-001**).

## 11. Interaction / Error Recovery

**Good (VERIFIED in source/tests):**

- Unified lookup miss error (no user enumeration).
- ≤20 min: phone + social, with copy that social is not a cancel.
- Maintenance removes the booking app from the accessibility tree.
- Staff: confirmations for cancel/no-show/delete; illegal actions not rendered.
- Privacy skip-to-confirm on a long document.

**Bad:**

- `cancelPatientAppointment` → `transitionAppointment(..., 'cancel')` sets status `cancelled` and **releases the slot**. The operations UI contract says patients **提出取消** and must not cancel directly; success copy in the design file still expects 取消待診所確認 (**PX-INT-001**, severity 4).
- D-005 recorded owner input: cutoff **10:00 on the appointment day**. Code: `SELF_CANCEL_CUTOFF_MINUTES = 20` (**PX-INT-002**).
- Local unknown routes: empty 404 body (**PX-INT-004**, **OBSERVED** in browser). Firebase Hosting may still auto-serve `404.html` — `REQUIRES_PRODUCTION_EVIDENCE`.

## 12. Visual Design / Craft

Judged from **C6 dist PNGs** (booking/workbench) and **2026-08-10 clinic** plus 2026-09-02 local captures.

Booking (warm): considered type, cards, sage accent, stepper — **craft is real**, not “valid CSS.” Workbench: utilitarian command density; cream/green; overview hero is explanatory rather than operationally beautiful. Clinic: marketing landing with illustration and FAQ; **C6 did not refresh clinic**, so current clinic craft is **OBSERVED** with a stale approval baseline (**PX-VIS-001**).

Two visual languages (brochure vs ops) without a shared chrome grammar (**PX-VIS-002**). That can be a correct *service* split (Apple HIG: don’t copy iOS; GOV.UK: don’t design around a look). It still raises learnability when 線上預約 jumps worlds.

Motion: reduced-motion is gated; not scored as delight.

## 13. Design System

Written system: tokens, `check:tokens` ratchet, R-1–R-26, 2026-08-06 convergence. **Mature for an engineering system.**

Implementation: `styles.css` + `workbench.css` + `clinic-site.css` + `clinic-booking.css` + `privacy.css` + `error.css`. Remaining literal ceilings documented. **PX-DS-001** P3. **PX-DS-002** P2: primitives do not yet compose one product.

## 14. Accessibility / Inclusion

Engineering: axe WCAG 2.x AA tags with serious/critical blocking; target-size forced; skip-link; forced-colours preconditions; landmarks. **Strong for automation.**

Caps: no human AT → G ≤ 8. Score **6.5** because cognitive/health literacy, older users, and the §5 human matrix are **unrun** (**PX-A11Y-001**, **PX-A11Y-003**). Medical terms and English eyebrows (**PX-A11Y-002**).

Taiwan 115.11: treat as **forward-looking** until 2026-11-30. Do not claim a mark.

## 15. Mobile / Responsive

E2E: no overflow at 11 widths; 375/320 booking layout specs; C6 mobile success-header regression. **VERIFIED** engineering.

**OBSERVED:** 320 booking above-the-fold is banner-heavy before the 初診 choice (**PX-MOB-002**). Workbench 375: tab strip + large metric cards; locate-and-act not thumb-first (**PX-MOB-001**). Soft keyboard / visualViewport / orientation: **External manual verification required**.

## 16. Content Design

Strengths: Traditional Chinese task language on booking (“這次是初診還是回診？”); privacy draft is unusually honest; ICS minimisation copy; 20-minute fallback explains that social does not cancel.

Failures: **止鼾 / 醫美** vs four nasal service pages (**PX-CONTENT-001**, **PX-CONTENT-003**) — this is not a cosmetic label issue; it is a different product taxonomy. Queue `療程` column concatenates label + `appointment.id` (**PX-CONTENT-002**). Staff English eyebrows (DAILY OVERVIEW, NEXT UP) vs patient Chinese.

## 17. Functional Suitability

ISO 25010:2023 functional suitability = complete, correct, appropriate **within intended scope**.

Inside synthetic Stage 1, booking+ops is largely present. Penalised: cancel correctness, horizon (60 days vs D-004 one month input), no patient reschedule, catalogue split. **Not** penalised: payroll, Firestore, production Calendar.

`physician` remains empty-permission in domain roles; consultant UI **未實作** — **PX-FUNC-002**, blocked for real use.

## 18. Performance / Responsiveness

Lab: FCP/LCP/CLS budgets on `/` and `/booking`; gzip `check:perf`. **Synthetic engineering.** No RUM/CrUX (**PX-PERF-001**). Perceived delay on the 2026-09-02 local server was not instrumented; do not invent INP.

## 19. Product Metrics

**Do not implement analytics in this audit.** No real-user collection.

Candidate metrics (define before any future implementation):

| Name | User/job | Definition | Numerator | Denominator | Direction | Segments | Current | Synthetic proxy | Future real | Privacy |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Booking completion | patient book | Share of started Step 1 sessions that reach success | success events | step-1 starts | up | kind, viewport | none | e2e funnel counts only | authorised privacy review | no health notes in events |
| Abandonment | patient book | 1 − completion | drop-offs | starts | down | step | none | same | same | same |
| Median completion time | patient book | Step 1 → success | — | completed sessions | down | new vs returning | none | Playwright timestamps | same | no raw identity |
| Validation-error rate | patient book | submits with field error | error submits | submits | down | field | none | unit/e2e | same | field name only |
| Lookup success | retrieve | lookups that return ≥1 | hits | lookup attempts | up | mode | none | e2e | same | no miss reason split (enumeration) |
| Self-cancel success | cancel | eligible cancels that complete | completes | eligible attempts | up | remaining-minutes bucket | none | e2e 20-min cases | **blocked until D-005** | no free text |
| Phone-fallback rate | cancel | ≤ cutoff shown phone UI | fallback views | cancel attempts | contextual | — | none | e2e | after D-005 | none |
| Time to locate | staff | open queue → row focused | — | locate tasks | down | role | none | scripted | time-and-motion | synthetic names only |
| Wrong-action rate | staff | undone/illegal attempts | wrong | actions | down | action type | none | none | observation | no patient PII |
| Help-needed | both | phone/social exit during task | help taps | sessions | down | page | none | click e2e | after policy | no message bodies |

**Do not blindly implement all.** First indicators of service success: **booking completion**, **lookup success**, **staff time-to-locate**.

Unintended consequences: completion rate can be gamed by shortening the form unsafely; lookup success must **not** be broken out by which field mismatched (enumeration); staff speed metrics must not punish correct slow identification of the right patient.

**PX-METRIC-001.**

## 20. Human Research Gap

Grok / LLM simulation is **not** research. Friends are not target users.

### Future protocol (synthetic data only)

Profiles relevant **now:** prospective patient; returning patient (lookup/cancel); older / low digital-confidence; AT user; front-desk; admin. Omit consultant/physician apps (not implemented). Omit payment.

Shared rules: clinic-provided **synthetic** identities only; no real phones, IDs, or calendar data; moderator stops if a participant begins to volunteer real data.

| Task | Context | Success | Critical error | Non-critical | Max help | Time | Abandon | Confidence | Satisfaction |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Book 初診 止鼾 | first visit, mobile | success screen with matching slot | wrong day/person; submitted real data | extra clicks | 2 hints | start→success | leave before submit | 1–5 | SEQ 1–7 |
| Find and cancel | has a synthetic booking >20 min | cancelled or requested per **approved** policy | cancelled the wrong booking | failed first lookup | 2 | open→done | close dialog | 1–5 | SEQ |
| Recover from bad URL | typed `/clinlc` | reaches /clinic or /booking, not staff login | lands on workbench login | extra hop | 1 | — | — | 1–5 | SEQ |
| Desk: mark 到診 for named patient | three similar names | correct row only | wrong patient arrived | extra filter | 1 | — | — | 1–5 | SEQ |
| Desk: refuse illegal action | cancelled row | no illegal primary button | performs cancel twice / delete | menu confusion | 1 | — | — | 1–5 | SEQ |
| AT: complete Step 1–3 | VO/NVDA | success without mouse | inaccessible submit | verbose banners | 3 | — | — | 1–5 | SEQ |

Observation notes: banner vs task; 醫美 vs expected nasal name; 900-slot card; 療程 ids.

## 21. Heuristic Findings

NN/g heuristics (Jan 2024 presentation). Severity 0–4 as specified.

| ID | Heuristic | Route/Journey | Evidence | Problem | User consequence | Sev | Conf | Direction | Acceptance |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| H1 | Visibility of status | `/booking` | C6 banners, stepper | Test chrome can outrank Step 1 | User never starts | 2 | M | Demote chrome, keep safety | Step 1 choice in first viewport at 375 |
| H2 | Match real world | `/clinic`→`/booking` | constants.js vs NASAL_SERVICES | 醫美 / 止鼾 vs four clinical names | Wrong service | 3 | H | One catalogue | Labels match |
| H3 | User control | `/booking` | no reschedule | Must cancel+rebook | Lost slot inside cutoff | 3 | H | Policy then UI | Documented path |
| H4 | Consistency | `/` vs `/clinic` | 404.html href=/ | Two “homes” | Public user hits staff login | 4 | H | Public home = /clinic | 404 and brand never open `/` |
| H5 | Error prevention | cancel | `cancel` vs request | Immediate slot release | Desk cannot confirm; double-book risk | 4 | H | D-005 then one transition | Domain+UI agree |
| H6 | Recognition | queue | `appointment.id` under 療程 | Recall of opaque ids | Wrong-row risk | 3 | H | Id not in primary cell | Name+time+service |
| H7 | Flexibility | staff | no accelerators beyond filters | High-frequency still click-heavy | Slow desk | 2 | M | After identity clarity | Timed locate |
| H8 | Minimalist | `/booking` | stacked notices | Extra units compete | Miss CTA | 2 | M | One status region | Banner count ≤2 |
| H9 | Error recovery | unknown URL | empty 404 | Browser default | No way back | 4 | H | Serve 404.html | Branded recovery |
| H10 | Help | `/booking` | phone on Step 3 | Help exists; not task-shaped | Call vs complete | 1 | M | Keep phone; don’t replace UI | Help rate in study |

## 22. Full Findings Register

Fields abbreviated; full machine copy in `findings.json`.

### PX-NEED-001 — No user research

Category user-needs. Journey all. Evidence **VERIFIED** (repo search). Severity 3. P1. Confidence HIGH. Impact: product may fit the implementer. Root: Stage 1 built against owner narrative and tests. Direction: run §20. Authority: `REQUIRES_HUMAN_EVIDENCE`. Effort L.

### PX-INT-001 — Patient cancel uses `cancel`, not `request_cancellation`

Category interaction. Route `/booking`. **VERIFIED** (`patient-booking-management.js` + `appointment-transition.js` vs `test-only-operations-ui.md`). Severity 4. **P0**. HIGH. Impact: slot released; desk “取消待確認” mental model wrong. Root: C6 self-cancel vs older contract, D-005 still pending. Direction: freeze UI until D-005; one transition. `REQUIRES_DOMAIN_AUTHORITY`. Effort M.

### PX-INT-002 — 20-minute cutoff vs D-005 10:00

**VERIFIED** (register vs `SELF_CANCEL_CUTOFF_MINUTES`). Severity 4. **P0**. HIGH. Same journey. `REQUIRES_DOMAIN_AUTHORITY`. Effort S after decision.

### PX-INT-004 / PX-JRN-001 — Recovery and public front door

**VERIFIED** (`server.mjs` empty 404; `404.html` `href="/"`; login lists `admin` / `beauessence-admin`; repo `visibility: public`). Severity 4. **P0**. HIGH. Impact: lost public user reaches staff login with printed credentials. Direction: serve branded 404; public home `/clinic`; do not put workbench credentials on a public recovery path. Effort S–M.

### PX-CONTENT-001 / PX-CONTENT-003 — Split service catalogue

**VERIFIED**. Severity 3. P1. `REQUIRES_DOMAIN_AUTHORITY` if 醫美 is intentional. Effort M.

### PX-CONTENT-002 — Appointment id in 療程 column

**VERIFIED** (`admin-view.js`). Severity 3. P1. Wrong-patient scanning risk. Effort S.

### PX-FUNC-001 — 60-day horizon vs D-004 one month

**VERIFIED**. P1. `REQUIRES_DOMAIN_AUTHORITY`. Effort S after decision.

### PX-JRN-002 — No patient reschedule

**VERIFIED**. P1. Policy first. Effort M.

### PX-JRN-003 — “900” slots as today’s work

**OBSERVED**. P1. Effort S.

### PX-A11Y-001 / PX-A11Y-003 — No AT / human matrix

**VERIFIED** as gap. P1/P2. `REQUIRES_HUMAN_EVIDENCE`.

### PX-MOB-001 / PX-MOB-002 — Workbench 375; booking 320 chrome

**OBSERVED**. P1/P2.

### PX-VIS-001 / PX-VIS-002 / PX-DS-002 — Stale clinic baseline; two languages; CSS split

**OBSERVED/VERIFIED**. P2.

### PX-METRIC-001 / PX-PERF-001 / PX-FUNC-002 / PX-DS-001 / PX-INT-003 / PX-A11Y-002

See JSON. None of these are P0.

## 23. P0 / P1 / P2 / P3 Backlog

**P0**

- PX-INT-001 cancel transition mismatch  
- PX-INT-002 cutoff mismatch (blocked on D-005)  
- PX-INT-004 empty/default 404  
- PX-JRN-001 404/home → staff `/`

**P1**

- PX-NEED-001 research gap  
- PX-CONTENT-001/003 catalogue  
- PX-CONTENT-002 queue ids  
- PX-FUNC-001 horizon  
- PX-JRN-002 reschedule path  
- PX-JRN-003 overview metric  
- PX-A11Y-001 AT  
- PX-MOB-001 workbench mobile  
- PX-METRIC-001 metrics design (not implementation)

**P2** — PX-A11Y-002/003, PX-INT-003, PX-MOB-002, PX-VIS-*, PX-DS-002, PX-FUNC-002, PX-PERF-001  

**P3** — PX-DS-001 ratchet  

## 24. Recommended Transformation Sequence

Do **not** start with a visual redesign or governance v3.

1. **Unblock policy:** D-005 (cancel) and D-004 (horizon) as *qualified approvals*, or explicitly accept the synthetic 20-minute/60-day behaviour as test-only and label it so the UI cannot be mistaken for clinic policy.  
2. **Public recovery / front door** (this audit’s implementation slice — §25).  
3. **One service catalogue** on clinic + booking (domain authority).  
4. **Staff “right patient”** (ids out of 療程; overview = today).  
5. **Human usability + AT protocol** (§20) on synthetic data.  
6. **Metrics** only after privacy authority — synthetic proxies first.  
7. Visual-system unification **after** journeys are correct (PONYTAIL-ineligible: this is product, not naming).

## 25. Product Excellence Exit Criteria

Not test counts.

| Approx. | Product bar |
| --- | --- |
| **8.0 / 10** (~80) | P0 recovery/cancel semantics resolved per approved D-005; one catalogue or an explicit split; branded 404 to /clinic; staff identity column clean; documented research plan **scheduled**; still may lack AT |
| **8.5** | Moderated synthetic-user study on booking + desk locate; AT sample (one SR); tablet+error states in visual evidence; metrics *defined* and synthetic-proxied |
| **9.0** | Repeated target-user tasks (patients + desk) with completion/time/error; human AT on booking; field lab+preview perf; iteration shown from study findings; cancel/reschedule match policy |
| **9.5** | Ongoing outcome metrics without PII abuse; vulnerable-user evidence; clinical-safety review of copy; recovery and destructive actions error-free in studies; craft consistent without iOS cosplay |

## Next implementation slice (exactly one) — not implemented here

**Public recovery and front-door consistency**

| | |
| --- | --- |
| Why first | P0, no D-series guess if scoped to wayfinding; lost users currently reach staff login with printed credentials on a public repo |
| Journey | discover → wrong URL / 404 → clinic or booking |
| Findings | PX-INT-004, PX-JRN-001, heuristic H4/H9 |
| User outcome | A mistyped URL still leads to the clinic or booking, never the workbench |
| Authority | Existing public pages; no new D-series. Do **not** change `/` as the workbench URL in the same slice (that is IA). Do **not** invent a production domain (D-011). |
| Scope | Serve `404.html` (or equivalent) for unknown local/Hosting paths; change 404 “回到首頁” to `/clinic`; keep “前往線上預約”; add a test that `/not-a-page` is branded and does not link to staff login |
| Exclusions | No booking redesign; no cancel-policy change; no credential removal from login (separate test-only concern); no analytics; no deploy |
| Acceptance | HTTP 404 body is the branded page; primary/secondary links are `/clinic` and `/booking` only; axe on 404; `check:pages` if inventory changes |
| Local | `check:pages`, focused e2e, `check:docs` if docs |
| CI | exact-head Verification evidence |
| Human later | §20 “Recover from bad URL” |

---

## What this audit did not do

- Implement or redesign UI.  
- Enable PVR (blocked; separate PR).  
- Deploy, collect analytics, or use real data.  
- Claim WCAG / ISO / NHS / 115.11 conformance.  
- Capture a new **dist** visual baseline (C6 remains the approval artifact).  
- Run full `pnpm verify` locally (`node_modules` absent; heavy gates → CI).

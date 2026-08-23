# Booking final C6 owner acceptance — 2026-08-23

## Current handoff

| Field | Current result |
| --- | --- |
| Exact deployed C6 | `3a01e0721927990fdf7db8b122ddc337b22ccae6` |
| Candidate CI | [`32620288428`](https://github.com/waydefu/clinic/actions/runs/32620288428) — 11/11 `success` |
| Preview | <https://beauessence-clinic-staging--synthetic-review-xvqa68cx.web.app> |
| Expiry | 2026-08-30 13:31:16 Asia/Taipei (`2026-08-30T05:31:16.323719674Z`) |
| Online verification | **PASS — 474/474**; evidence commit equals C6 |
| Visual evidence | [17 C6 desktop/mobile scenarios](ui-visual-c6-2026-08-23.md), manually inspected |
| Supersedes | The [C4 acceptance](2026-08-22-booking-final-c4-owner-acceptance.md), kept unchanged as history. C5 has no acceptance document of its own — it was rejected before acceptance and is recorded inside the [C6 deployment record](2026-08-23-booking-final-c6-synthetic-preview-deployment.md) |
| PR | [#24](https://github.com/waydefu/clinic/pull/24) open and not merged; owner acceptance hold remains |

> This is a public, expiring, synthetic browser-local preview. Do not enter any
> real name, phone, birthday, identity, medical, staff, payroll or Calendar
> data.

**The preview URL string is identical to the one you were given for C4 and C5.**
The `synthetic-review` channel never expired, so each deployment updated it in
place. Only the content, release, version and expiry changed. Check the deployed
commit, not the URL, when confirming which candidate you are looking at.

## What happened to C5, in plain language

A candidate called C5 (`a9c5256`) was deployed earlier today and then **rejected
before acceptance**. On a phone, after a patient finished booking, the page
header vanished — and with it 查詢／取消預約, the navigation and the theme
control. The only way back was reloading the page. Desktop was never affected.

The cause was a one-line omission: the success screen kept the marker that tells
mobile "you are mid-flow, hide the header". C6 fixes that and adds a test plus a
reference screenshot so the state cannot regress unnoticed.

C5 is kept in the record rather than erased. Nothing about C4 or C5 evidence was
rewritten.

## What changed since the C4 preview you last accepted

1. Steps 2 and 3 use a compact inline panel heading, so the back action and the
   step title share one row instead of stacking.
2. Step 3 gained a clinic contact section. Its wording states that urgent matters
   should go to the phone, and that **social messages may not get an immediate
   reply and never send or change a booking automatically**.
3. The synthetic preview warning and the top status line now appear on Step 1
   only. Steps 2 and 3 rely on the step heading and in-place errors, and the
   status line stays in the accessibility tree for screen readers.
4. The social contact links adapt to pointer type: labelled buttons for touch,
   compact round icons for mouse/fine pointers.
5. **New in C6:** the mobile success screen returns the header, 查詢／取消預約
   and the theme control.

## What to accept

### Patient booking

1. Step 1 alone has the compact booking hero, the synthetic test warning,
   clinic/type/service selection and the first step indicator.
2. Step 2 has no large hero. It presents month navigation, only available dates
   within the synthetic 60-day horizon, and only non-empty 上午／中午／晚間 slot
   groups in chronological order. Mobile stays contained with no page-level
   horizontal scrolling.
3. Step 3 has one back action and `重新開始`; it uses the two real semantic
   sections「本人基本資料」and「本次門診補充」without a dead summary/sidebar area,
   and ends with the clinic contact section.
4. Success is a result after Step 3, not a fourth step, and `重新預約` resets the
   flow. **On a phone the header and 查詢／取消預約 are reachable straight away.**

The 60-day rule is also enforced when a synthetic create/reschedule command
bypasses the UI. It is not an approved production horizon; D-004 remains
pending.

### Lookup and cancellation

- Lookup requires phone + birthday or identity/passport + birthday; one-field
  lookup is unavailable and failure does not reveal which field differed.
- Self-cancel is available only **strictly more than** 20 minutes before the
  slot. Exactly 20 minutes is denied, and a denied attempt changes no state at
  all.
- At 20 minutes or less, the primary CTA is `02-2577-1314`, followed by the
  published LINE, Instagram, Messenger and Facebook links. The screen states
  that social messages are not immediate and do not automatically cancel.
- The cutoff is synthetic behavior only; D-005 remains pending.

### Staff workbench

- The weekly view shows actual normal open days only; an `extra_open` date is
  added with `加開` and its hours, while an explicitly `closed` normal day is
  removed.
- Only actual synthetic appointments appear as events. Follow-up reminders do
  not masquerade as Calendar events.
- Case/follow-up keeps its compact desktop rows and ordered mobile stack;
  permission checks still precede mutation. Payroll remains frozen/unreachable.
- A fresh visitor gets the warm theme; an explicitly saved preference is
  honoured.

## Suggested owner pass

1. Open `/booking` at desktop and 375px mobile; confirm warm default and the
   warning/hero behavior across Steps 1–3.
2. Navigate months, select dates and verify 上午／中午／晚間 groups; use
   `重新開始`, complete Step 3 and verify the success reset.
3. **On the phone, finish a booking and confirm the header and 查詢／取消預約
   are visible on the result screen without reloading.** This is the C5 defect.
4. On Step 3, check the contact section: phone first, then the four social
   links, with the "not immediate / does not cancel" wording visible.
5. Open/close the privacy dialog after filling synthetic fields; confirm values,
   read state and focus are preserved.
6. Use synthetic lookup/cancel fixtures to inspect eligible confirmation and
   the 19-minute phone/social fallback.
7. Inspect normal, opened-exception and populated workbench weeks, then Case at
   desktop/mobile. Confirm no fake events or Payroll surface.

## Vendor and next-phase boundaries

- The vendor package is `/booking` only and recommends Widget + API on
  <https://beauessence.com.tw/reservations/>. Future
  `api.beauessence.com.tw`, optional `book.beauessence.com.tw`, DNS/TLS/CORS
  responsibilities are documented but were not configured.
- [CAL-PILOT-001](../integration/google-calendar-pilot-readiness.md) is
  readiness documentation only. Credentials used = none; original Calendar
  accessed = no; real Calendar data imported = no; private test Calendar
  connected = no.
- No production backend, live Hosting, real data or clinic/doctor-page change is
  part of C6. The 30 frozen clinic files remain byte-identical.

## Three items needing an owner decision

1. Commit `b1a1104` modified the frozen clinic file `clinic-booking.css`; CI
   went red and `8cbc4d7` reverted it. Current HEAD is 30/30 green. Recorded for
   the audit trail, no action taken.
2. Commit `c139073` has no check runs at all; it was never independently
   validated. The branch tip is green.
3. The staging project's `live` channel holds a release dated
   `2026-08-22T14:43:48Z` with **no expiry**, which sits outside the preview
   authority in AGENTS.md safety boundary 8. It is `noindex` and synthetic, and
   per your instruction it was left untouched. Please decide whether it should
   be removed.

Technical evidence is in the
[C6 deployment record](2026-08-23-booking-final-c6-synthetic-preview-deployment.md),
[vendor package](../integration/booking-web-vendor-evaluation.md) and
[execution log](../implementation/phase-1-booking-mvp-execution-log.md).

# Booking final C4 owner acceptance — 2026-08-22

## Current handoff

| Field | Current result |
| --- | --- |
| Exact deployed C4 | `b3bc47721aaf2ca8de89ed62159dd7461d0eae30` |
| Candidate CI | [`32561071094`](https://github.com/waydefu/clinic/actions/runs/32561071094) — 11/11 `success` |
| Preview | <https://beauessence-clinic-staging--synthetic-review-xvqa68cx.web.app> |
| Expiry | 2026-08-29 16:10:26 Asia/Taipei (`2026-08-29T08:10:26.405373913Z`) |
| Online verification | **PASS — 474/474**; evidence commit equals C4 |
| Visual evidence | [16 C4 desktop/mobile scenarios](ui-visual-c4-2026-08-22.md), manually inspected |
| PR | [#24](https://github.com/waydefu/clinic/pull/24) open and not merged; owner acceptance hold remains |

> This is a public, expiring, synthetic browser-local preview. Do not enter any
> real name, phone, birthday, identity, medical, staff, payroll or Calendar
> data.

## What to accept

### Patient booking

1. Step 1 alone has the compact booking hero, thin persistent test warning,
   clinic/type/service selection and the first step indicator.
2. Step 2 has no large hero. It presents month navigation, only available dates
   within the synthetic 60-day horizon, and only non-empty 上午／中午／晚間 slot
   groups. Mobile remains contained without page-level horizontal scrolling.
3. Step 3 has one back action and `重新開始`; it uses the two real semantic
   sections「本人基本資料」and「本次門診補充」without a dead summary/sidebar area.
4. Success is a result after Step 3, not a fourth step, and `重新預約` resets the
   flow.

The 60-day rule is also enforced when a synthetic create/reschedule command
bypasses the UI. It is not an approved production horizon; D-004 remains
pending.

### Lookup and cancellation

- Lookup requires phone + birthday or identity/passport + birthday; one-field
  lookup is unavailable and failure does not reveal which field differed.
- Self-cancel is available only strictly more than 20 minutes before the slot.
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

## Suggested owner pass

1. Open `/booking` at desktop and 375px mobile; confirm warm default and the
   warning/hero behavior across Steps 1–3.
2. Navigate months, select dates and verify 上午／中午／晚間 groups; use
   `重新開始`, complete Step 3 and verify the success reset.
3. Open/close the privacy dialog after filling synthetic fields; confirm values,
   read state and focus are preserved.
4. Use synthetic lookup/cancel fixtures to inspect eligible confirmation and
   the 19-minute phone/social fallback.
5. Inspect normal, opened-exception and populated workbench weeks, then Case at
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
  part of C4. The 30 frozen clinic files remain byte-identical.

Technical evidence is in the
[C4 deployment record](2026-08-22-booking-final-c4-synthetic-preview-deployment.md),
[vendor package](../integration/booking-web-vendor-evaluation.md) and
[execution log](../implementation/phase-1-booking-mvp-execution-log.md).

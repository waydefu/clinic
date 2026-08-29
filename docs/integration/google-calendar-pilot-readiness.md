# CAL-PILOT-001 — Google Calendar controlled-pilot readiness

> **2026-08-29 現況更新：** 本文件以下保留為早期、涉及真實營運資料的
> documentation-only 歷史方案。業主於 2026-08-28 另核准「兩本專用
> CAL-PILOT 日曆、A01～A30 合成患者、30 天、人工審核」的窄範圍，實作與操作
> 邊界以 [30 天雙向同步操作手冊](../runbooks/cal-pilot-30-day-bidirectional-sync.md)
> 及 [D-009／D-016 子範圍紀錄](../product/phase-1-decision-register.md)為準。
> Production D-009／D-016 與任何真實資料仍是 pending；以下提到的「原始診所
> Calendar」不在這次核准內。

**Status:** documentation-only readiness package. **STOPPED before credentials,
Calendar access, test-calendar connection or real-data import.** This document
does not approve D-001～D-003, D-009 or D-016 and does not change
[ADR-0002](../adr/0002-calendar-is-a-projection-not-the-lock.md).

**Revision 2026-08-23:** this readiness package originally described its own
approval gap only as "does not approve D-009 or D-016." That is accurate but
insufficient — it reads as "not yet approved," when the correct reading is
**actively blocked**. §0 below states the actual gate. This revision also
corrects five places where the original text asserted more protection or more
architecture than currently exists; each is marked **(2026-08-23 correction)**
at the point it applies. Nothing here authorizes implementation.

## 0. The blocking gate — read this before anything else

This pilot cannot start, in any form, until all three of the following move
from their current state:

| Gate | Current state | Source |
| --- | --- | --- |
| **D-009** (Calendar owner, authorization model, scopes, minimum event fields) | `pending` | [decision register](../product/phase-1-decision-register.md) |
| **D-016** (inbound edits, matching, reviewer authority, delete semantics, SLO) | `pending` | same |
| **Stage 2 completion, before Stage 3 (dedicated test Calendar)** | Stage 2 (C1–C6) not started | [current execution and approval plan §3](../product/current-execution-and-approval-plan.md) — "先完成 Stage 2 並核准 D-009，才可接專用測試日曆" |

`AGENTS.md`'s "Must remain disabled" list independently names "Calendar test
projection before D-009." All three gates apply together, not as alternatives.

The clinic owner gave verbal direction on 2026-08-16 relevant to D-009/D-016
(dedicated calendar, manual inbound review, system-authoritative conflicts,
30-minute target) that a technical owner transcribed. The decision register
records this explicitly as **recorded input, not approval**: it lacks a named
approver's own signature, scope, explicit exclusions and accepted residual
risk, all of which the register's own approval format requires. Read the
register before treating any owner statement here as settled.

### Two unresolved conflicts (H2, H3) that block a field-level design, plus one corrected entry (H1)

- **H2 — the owner asked for the service item on the Calendar event.** The
  2026-08-16 input includes "加上項目" (add the item) for outbound events. This
  is in direct tension with this document's own minimization rule (§4) and
  with [ADR-0002](../adr/0002-calendar-is-a-projection-not-the-lock.md)'s
  event-content-minimization consequence. The register records this
  explicitly: the field "must not be implemented before D-009 classifies that
  field." **This document's allowlist in §4 does not grant that classification
  and must not be read as doing so.**
- **H3 — the 2026-07-23 test-integration authority does not reach this pilot.**
  That authority permits an owner-run **outbound** smoke test
  (`apps/worker/src/google-calendar.ts`, writing one synthetic event to a
  dedicated test calendar). This pilot's core act is an **inbound read of the
  real operational Calendar** — a different act on a different calendar. The
  register's own text confirms the scope: "This authority is a test
  integration only" and does not approve D-009 for any production use. Do not
  read the earlier authority as covering this pilot's source-reader access.
- **H1 — corrected 2026-08-24. This was mis-stated as an unresolved conflict
  and is not one.** The authoritative hours are settled: the owner selected
  **Wed–Fri 12:00–20:00 and Sat 10:00–18:00** on 2026-07-28, the repository
  already matches that answer, and the 2026-08-16 owner input independently
  reconfirmed it ("目前週日一二不開診"). What is outstanding is not a decision
  but a **content action outside this repository** — the clinic's official
  reservations page still publishes the older Mon–Fri 11:00–20:00 / Sat
  11:00–16:00 and must be corrected through its own controlled process. See
  [the register's opening-hours entry](../product/phase-1-decision-register.md).

  The residual relevance to this pilot is narrower than first written: the
  workbench weekly view drops any day with no open interval (§5), so a real
  source event falling outside the settled operating schedule — an
  administrative block, a meeting, an out-of-hours entry — would import and
  then silently not render. That is a **rendering-coverage caveat for
  interpreting pilot results**, not a blocked decision, and it does not gate
  the pilot the way D-009 and D-016 do.

## 1. Objective and fixed boundary

Prepare a separately authorized staff-workbench pilot with this one-way flow:

```text
original clinic Calendar (read only)
  → controlled copy/import adapter
  → allowlisted field minimization and opaque mapping
  → separate private test Calendar
  → staff workbench test only
```

The original operational Calendar is never modified. The test Calendar is not
public, patient-facing or vendor-facing. Calendar remains a test operational
projection/input for staff evaluation—not booking availability, a capacity
lock or transaction authority. PR #24 implements none of this flow.

**(2026-08-23 addition)** This flow cannot begin until §0's three gates clear.
It is written now as a target design, not as a sequence that may start once
this document alone is read.

## 2. Original Calendar: read-only by two independent controls

Use a dedicated **source-reader identity** that has only the original
Calendar's `reader` ACL role and requests only:

`https://www.googleapis.com/auth/calendar.events.readonly`

This is narrower than `calendar.readonly` for a known Calendar ID because the
pilot needs event reads, not calendar-list, settings or ACL access. Do not
request any `calendar`, `calendar.events`, calendar-list, calendar-management
or ACL write scope. The known source Calendar ID must be supplied through the
approved secret channel at pilot time; the importer must not discover or list
other calendars.

The source client exposes only list/get operations. It must have no code path,
method or credential capable of creating, editing, deleting or moving events;
changing attendees or reminders; or changing Calendar settings. Runtime tests
must prove write methods are absent/denied. Google's current scope catalogue
and Calendar sharing roles are the external scope authorities:

- <https://developers.google.com/workspace/calendar/api/auth>
- <https://developers.google.com/workspace/calendar/api/concepts/sharing>

**(2026-08-23 correction) The ACL role and OAuth scope above control writes,
not which fields a read exposes.** A `reader` sees the full event — title,
description, attendees — not just the allowlisted fields in §4. Field
minimization is entirely a code-side responsibility (the sanitizer in §5); the
two access controls do not provide it, and this document must not be read as
implying they do.

**(2026-08-23 correction) The pilot must not reuse `createServiceAccountTokenProvider`
in `apps/worker/src/google-calendar.ts` unmodified.** That function — the only
token provider currently in the repository — hard-codes the scope
`https://www.googleapis.com/auth/calendar`: *"See, edit, share, and permanently
delete all the calendars you can access."* No test currently asserts the scope
claim in the signed JWT; the existing test suite pins `claims.aud` but not
`claims.scope`. If the pilot's source-reader were built on this function
without change, a "read-only" identity would in fact request full write and
delete on every calendar shared with it. Any future implementation must
parameterize the scope and add a test that decodes the JWT and asserts the
exact scope string — the same pattern the existing suite already uses for
`aud`.

## 3. Separate private test Calendar

Use a separate **test-writer identity** that owns or is restricted to one new,
private test Calendar and has no access to the original Calendar. Do not reuse
the source-reader token or principal.

**(2026-08-23 correction) `calendar.events.owned` requires the identity to
hold the Calendar's `owner` ACL role, and that may not be true of the natural
setup.** Google's own definition is *"create, change, and delete events on
Google calendars you **own**."* The repository's proven credential pattern
(`docs/runbooks/calendar-go-live.md`) has the human owner create a calendar and
share it to a service account's email — which makes the service account a
`writer`, not an `owner`. If the test Calendar is provisioned that way,
`calendar.events.owned` will not authorize the writes this pilot needs.

**Prefer `https://www.googleapis.com/auth/calendar.app.created`** instead:
*"Make secondary Google calendars, and see, create, change, and delete events
on them."* Access is confined to calendars the application itself created,
which is a **structural** guarantee rather than a sharing-configuration one —
the test-writer identity cannot reach the original Calendar even if someone
later shares it with the same principal by mistake. If the selected identity
genuinely cannot use `calendar.app.created` (for example, an existing calendar
must be reused for continuity), security review must approve the next
narrowest event-write scope plus an account whose Calendar access is limited
to that one test Calendar.

Only named workbench pilot testers may access the test Calendar. Any later
workbench write experiment requires separate authorization and may write only
to this test Calendar. It can never write back to the original Calendar.

**(2026-08-23 addition) A third identity — workbench-reader — is available in
Google's scope catalogue and should be defined now even if not provisioned
yet:** `https://www.googleapis.com/auth/calendar.events.owned.readonly`
(*"See the events on Google calendars you own"*). Under the architecture in
§5, the workbench does not read Google directly today, so provisioning a third
credential now would be an unused credential — the wrong side of least
privilege. Define it here so a future phase that adds a server-mediated
workbench read has a named target rather than reaching for the test-writer's
broader scope out of convenience.

## 4. Sensitive real-data handling and minimum field map

The source may contain real clinic/patient information, so the importer,
mapping store, test Calendar and tester access are sensitive even after
minimization. Before access, the owner, privacy/legal owner and security owner
must approve a field-by-field map, purpose, retention, tester list and cleanup
date.

Default copy allowlist:

| Source | Pilot representation | Rule |
| --- | --- | --- |
| Source event ID | keyed opaque mapping ID via HMAC, never the reversible domain codec | Never display or persist the raw ID outside the protected mapping boundary. |
| Start | normalized `Asia/Taipei` timestamp | Copy the start time. |
| End | **omitted** *(2026-08-23 correction — see below)* | Not requested from the source. |
| Status/category | allowlisted internal code | Omit unless the workbench test genuinely needs it. |
| Resource/doctor | approved opaque code | Omit unless needed; never copy free text by default. |

**(2026-08-23 correction) `packages/domain/src/calendar-event-id.ts` must never
encode a source event ID.** It is a **reversible** base32hex codec by design —
`fromCalendarEventId()` recovers the original input — which exists for
destination event IDs derived from pilot-local keys. Encoding a source ID with
it would publish that ID, in recoverable form, to anyone who can read the test
Calendar. Use an HMAC-based opaque mapping ID instead, with the key held only
in the approved secret manager.

**(2026-08-23 correction) `End` is dropped from the allowlist.** The staff
workbench's weekly grid (`apps/web/public/modules/week-view.js`) computes every
event's displayed end as a fixed `SLOT_DURATION_MINUTES` from its start; it
never reads an `endsAt` field. Copying a real event's end time would cost real
personal data for zero display benefit. If a future workbench change makes use
of duration, re-add this row with that change, not before it.

Default denylist: patient name, phone, email, identity/passport number, birthday,
event title/summary, description, location, attendees, organizer details,
reminders, attachments, conference data, medical/service narrative and all
free-text notes, plus `iCalUID`, `recurringEventId`, `originalStartTime`,
`htmlLink`, `creator`, `sequence`, `visibility` and the raw source Calendar ID.
If identification is later proved necessary, use a separately approved
pseudonymized or masked label—never silently expand this allowlist.

**(2026-08-23 addition — H2) The service-item / category field stays on the
denylist regardless of owner intent recorded elsewhere.** The 2026-08-16 owner
input asked for the service item to appear on outbound Calendar events. §0
above records why that request cannot move this allowlist: it requires D-009
to classify the field first, and no such classification exists yet.

No real event data, IDs, screenshots or tokens may enter Git, CI logs, GitHub
artifacts, the public Firebase preview, vendor documents, analytics or ordinary
application logs. Logs use counts, opaque batch IDs and reason codes only.
**(2026-08-23 addition)** This repository has been public since 2026-08-17 —
every commit publishes immediately, including full history. "Never enters Git"
therefore has no undo; treat it as absolute, not as a best-effort guideline.

## 5. Importer and credential architecture

- Two separately issued principals/tokens: source reader and test writer.
- Credentials and Calendar IDs come from the approved secret manager at
  runtime; never commit key files, `.env` values, refresh tokens or service
  account JSON.
- Prefer short-lived credentials, explicit audience/scope checks, rotation and
  immediate revocation. Redact request/response bodies and authorization data.
- Read within an approved time window, validate every response against the
  allowlist, then write a newly constructed test event. Never forward the raw
  Google event object.
- Reject rather than copy unknown fields, malformed times or oversized values.
  See below for the specific, verified recurrence and timezone rules — this is
  no longer an open "ambiguity."
- Tag each copied event with an opaque pilot batch ID so cleanup is complete
  without retaining source text.
- Keep the import/mapping store isolated from booking-domain collections.

**(2026-08-23 correction) The claim that "the workbench may render the test
projection" describes an architecture that does not currently exist.** The
staff workbench (`apps/web/public`) has no server: `store.js` runs a synthetic
in-browser transport over `localStorage`, and `api-client.js` never issues a
`fetch` call. There is no mechanism today by which the workbench could receive
Calendar-derived data at all, live or otherwise — the sentence above was
describing a future state as if it were a current constraint.

The concrete implication: for a first pilot, the workbench cannot read the
Calendar-derived data live. Delivery must be an **operator-carried sanitized
fixture** — the sanitizer's output written into the browser's `localStorage` by
the operator running the pilot — clearly labelled (e.g. 測試日曆) and never a
network call the browser makes itself. A server-mediated live workbench read
is Stage-2-and-later work and is out of scope until that authority exists. In
either case: **the browser must never receive a Google credential, Calendar ID,
or make a request to Google directly.** All Calendar access is server/worker
mediated, matching the existing outbound design.

**(2026-08-23 addition) Recurrence and timezone, verified against the current
Google Calendar API reference rather than left as an open question:**

- Request `events.list` with `singleEvents=true`, which expands recurring
  events into individual instances instead of returning the recurrence master.
  Copy expanded instances only; never copy a master event or an `RRULE`.
- With `singleEvents=true` and `showDeleted=false`, a cancelled instance of a
  recurring series is excluded automatically.
- `timeMin`/`timeMax` **cannot** be combined with a `syncToken` in the same
  request. A bounded pilot window and incremental sync are mutually exclusive
  by design of the API — use the bounded window (§7 of the implementation
  plan) and do not request a `syncToken` in the first pilot. That also means
  none of `syncToken` expiry (`410 Gone`), full-resync-on-expiry, or webhook
  watch-channel renewal apply to a first pilot; they become relevant only if a
  later phase adds incremental sync.
- **Reject all-day and multi-day events, fail closed, with a counted reason
  code.** Google represents an all-day event as `start.date` (a bare date, not
  a timestamp), and the workbench positions events by parsed clock time — a
  naive conversion would render an all-day event as a fabricated 00:00
  appointment. The single-day grid also cannot express a multi-day event
  correctly. Do not attempt either conversion; count and skip.
- All timezone handling goes through the existing domain/browser helpers only
  (`packages/domain/src/schedule.ts`'s `Asia/Taipei` constant server-side,
  `modules/taipei-time.js` in the browser) — the Calendar adapter must not
  implement its own timezone conversion, per the bidirectional sync plan §4.6.

## 6. Rollback and cleanup prepared before import

Before the first authorized read, rehearse with synthetic fixtures and record
who can perform each action:

1. Disable importer execution and revoke the source Calendar's reader ACL.
2. Revoke both OAuth grants/credentials and remove their runtime secrets.
3. Delete every copied event by pilot batch ID, then delete the private test
   Calendar if the pilot is closed.
4. Purge the opaque mapping/intermediate store and its approved backups after
   the retention window; retain only non-sensitive audit counts.
5. Confirm no pilot credential had source write permission and compare
   source-event versions/audit evidence sampled before and after the pilot to
   demonstrate the original Calendar was unchanged.
   **(2026-08-23 addition)** Any `etag` or `updated` marker used for this
   comparison is itself source-derived and stays only in the protected
   runtime; it must never appear in a dated report or any other document —
   report only the aggregate outcome ("N of N sampled events unchanged").
6. Record completion, exceptions and any residual access in a dated cleanup
   report.

## 7. Acceptance criteria for a later, separately authorized pilot

1. Named D-series, privacy/legal, security and operations approvals exist with
   scope, tester identities, duration and deletion date.
2. Synthetic-fixture tests prove source read-only denial, allowlist-only copy,
   idempotent retry, time-zone handling, fail-closed validation and batch
   cleanup.
3. Source and test credentials are different; the source identity cannot
   write, and the test identity cannot access the original Calendar.
4. The test Calendar is private and only named workbench testers can access it.
5. No prohibited field or secret appears in the test event, UI, logs,
   screenshots, Git, CI or artifacts.
6. Workbench interaction cannot mutate the original Calendar or bypass normal
   booking/domain rules.
7. Rollback deletes copied events, revokes access and produces evidence that
   the original Calendar was unchanged.
8. **(2026-08-23 addition)** D-009 and D-016 are `approved` — not merely
   answered — with a named approver, approval date, explicit scope/exclusions
   and accepted residual risk each, per the decision register's own approval
   format. Stage 2 (C1–C6) is complete, or the owner and security owner have
   recorded an explicit, scoped exception to the "Stage 2 before Stage 3"
   sequencing rule.
9. **(2026-08-23 addition)** The workbench delivery path (§5) is decided in
   writing and does not require a Google credential, Calendar ID or network
   call in the browser under any option chosen.

## 8. Explicit stop line

**STOP. Do not request, receive, inspect or use real credentials, Calendar IDs
or event data; do not create/connect the private test Calendar; and do not run
the importer until §0's three gates clear and all acceptance prerequisites in
§7 are approved.**

**As of 2026-08-23:** credentials used = none, original Calendar accessed = no,
real data imported = no, test Calendar connected = no, `apps/worker/src/google-calendar.ts`
unmodified. PR #24 (the branch this readiness package was first written on) is
merged; this document now lives on `agent/cal-pilot-001-planning`, a
documentation-only branch. Its status ledger is maintained here going forward,
not by reference to a specific PR.

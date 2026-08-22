# CAL-PILOT-001 — Google Calendar controlled-pilot readiness

**Status:** documentation-only readiness package. **STOPPED before credentials,
Calendar access, test-calendar connection or real-data import.** This document
does not approve D-001～D-003, D-009 or D-016 and does not change
[ADR-0002](../adr/0002-calendar-is-a-projection-not-the-lock.md).

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

## 3. Separate private test Calendar

Use a separate **test-writer identity** that owns or is restricted to one new,
private test Calendar and has no access to the original Calendar. Prefer the
owned-calendar event scope
`https://www.googleapis.com/auth/calendar.events.owned`; if the selected
identity cannot own the test Calendar, security review must approve the next
narrowest event-write scope plus an account whose Calendar access is limited
to that test Calendar. Do not reuse the source-reader token or principal.

Only named workbench pilot testers may access the test Calendar. Any later
workbench write experiment requires separate authorization and may write only
to this test Calendar. It can never write back to the original Calendar.

## 4. Sensitive real-data handling and minimum field map

The source may contain real clinic/patient information, so the importer,
mapping store, test Calendar and tester access are sensitive even after
minimization. Before access, the owner, privacy/legal owner and security owner
must approve a field-by-field map, purpose, retention, tester list and cleanup
date.

Default copy allowlist:

| Source | Pilot representation | Rule |
| --- | --- | --- |
| Source event ID | keyed opaque mapping ID | Never display or persist the raw ID outside the protected mapping boundary. |
| Start/end | normalized `Asia/Taipei` interval | Copy only the operational interval. |
| Status/category | allowlisted internal code | Omit unless the workbench test genuinely needs it. |
| Resource/doctor | approved opaque code | Omit unless needed; never copy free text by default. |

Default denylist: patient name, phone, email, identity/passport number, birthday,
event title/summary, description, location, attendees, organizer details,
reminders, attachments, conference data, medical/service narrative and all
free-text notes. If identification is later proved necessary, use a separately
approved pseudonymized or masked label—never silently expand this allowlist.

No real event data, IDs, screenshots or tokens may enter Git, CI logs, GitHub
artifacts, the public Firebase preview, vendor documents, analytics or ordinary
application logs. Logs use counts, opaque batch IDs and reason codes only.

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
- Reject rather than copy unknown fields, malformed times, oversized values,
  recurring-series ambiguity or mapping collisions.
- Tag each copied event with an opaque pilot batch ID so cleanup is complete
  without retaining source text.
- Keep the import/mapping store isolated from booking-domain collections. The
  workbench may render the test projection but must not turn it into an
  appointment, slot, audit transition or outbound write automatically.

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

## 8. Explicit stop line

**STOP. Do not request, receive, inspect or use real credentials, Calendar IDs
or event data; do not create/connect the private test Calendar; and do not run
the importer until a separate CAL-PILOT-001 implementation request and all
acceptance prerequisites above are approved.** As of PR #24: credentials used
= none, original Calendar accessed = no, real data imported = no, test Calendar
connected = no.

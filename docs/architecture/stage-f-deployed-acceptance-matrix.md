# Stage F deployed acceptance matrix (spec only)

Status: **spec / evaluator only. Not a deployment.** Stage E must not
run this matrix against a live isolated backend. Stage F binds it to an
exact SHA after Cloud Run, Hosting rewrite, and monitoring apply. The
unsigned [Stage F0 packet](../reviews/2026-09-15-stage-f0-exact-sha-authority-packet.md)
is not that SHA authority.

Evaluator: `pnpm inspect:stage-f-matrix` →
`scripts/stage-f-acceptance-matrix.mjs`. Without `deployed: true`
evidence every case is `NOT_DEPLOYED`.

## Cases

### General booking

Booking Page → choose service/date/time → intake → create → reload →
still exists. Server read-back. No localStorage source of truth.

### Workbench

Staff login → booking visible → arrived → completed. Arrived is not
completed. Only an authorised clinic role sets `completed`.

### Calendar outbound

Create → Calendar event. Arrived → **same** event patch. Completed →
**same** event patch. Calendar is a projection.

`PRODUCTION_CALENDAR_INBOUND = GO_LIVE_DEFERRED`. Manual Calendar edits
become review candidates; `manager` / `front_desk` approve or reject.
Do not register production `events.watch`.

### Return patient

Phone + DOB, no OTP → existing patient. Generic miss. 5 failures / 15
minutes then 15-minute lock. No enumeration.

Required + unscheduled → normal slot UI → `follow_up` create with
lineage. Follow-up grid `:15` / `:45` unchanged.

### Candidate review

Synthetic Calendar manual change → pending → approve/reject.

### Security

Rate limit, anti-enumeration, denial audit, **one real human alert**.
The last item is Stage F cloud proof. Stage E only has
`IMPLEMENTED_NOT_DEPLOYED`.

### Persistence

Reload, server read-back, no localStorage SoT.

## Blockers this spec does not lift

Cloud exact-SHA authority; isolated Cloud Run/API; Hosting rewrite;
monitoring apply; human alert delivery proof; deployed Booking Page /
Workbench / Calendar E2E; backup inspect; final completeness inspect.

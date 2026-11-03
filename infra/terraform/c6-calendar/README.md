# C6 Calendar API (source only)

**Not C6 authority and not production Calendar.** Default SHA creates
zero resources. C6 can enable `calendar-json.googleapis.com` only, and rejects
`beauessence-clinic-staging`. C6 itself does not mount routes or prove any
runtime deployment.

Separately, `AppModule` registers `InternalTestBookingModule`, including the
booking controller. Its internal-test write gate is fail-closed by default;
public production bookings remain unauthorised. `CalendarWatchController` is not
mounted by the application modules. C6 apply after C1～C5 PASS does not by
itself authorise wiring the watch controller or production Calendar.

Copy `terraform.tfvars.example` locally. Local packet:
[c2-c6-local-execution-packet.md](../../../docs/runbooks/c2-c6-local-execution-packet.md).

// One shared in-memory authority for both the public workbench and its deferred
// CAL-PILOT bundle. The build keeps this module external instead of duplicating
// generations/principal/listeners inside the deferred bundle.
let generation = 0;
let principal;
const listeners = new Set();
export function calendarPilotAuthenticationGeneration() {
  return generation;
}
export function calendarPilotVerifiedActor() {
  return principal;
}
export function subscribeCalendarPilotClientAuthority(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function notify() {
  for (const listener of listeners) listener();
}
export function invalidateCalendarPilotAuthority() {
  generation += 1;
  principal = undefined;
  notify();
}
export function approveCalendarPilotAuthority(value) {
  principal = Object.freeze(value);
  notify();
}

// Keep the existing workbench usable when CAL-PILOT is absent. The Google/TOTP
// client still loads only after the same-origin API confirms the 30-day pilot.
// Boot CSS is linked from index.html so first paint can hide the synthetic
// login without waiting for this module.
const response = await fetch('/v1/calendar-session/client-config', {
  credentials: 'same-origin',
  headers: { Accept: 'application/json' }
}).catch(() => undefined);

if (response?.ok === true) {
  await import('./calendar-pilot-client.js');
} else {
  document.documentElement.classList.add('synthetic-workbench-ready');
}

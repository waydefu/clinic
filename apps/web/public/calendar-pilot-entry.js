// Keep the existing workbench fast and usable when CAL-PILOT is absent. The
// Google/TOTP client and its styles load only after the same-origin API confirms
// that this 30-day pilot is enabled. The build rewrites both lazy resources to
// content-hashed filenames without preloading them. First-paint hide rules live
// in workbench.css so the synthetic login cannot flash while this fetch runs.
// General booking is accountless: never overlay Google/TOTP on /booking.
// Default /staff uses Google+TOTP only to mint the server session, then the
// Staff Workbench. Full CAL-PILOT chrome is opt-in via ?calendarPilot=1.
import {
  isPublicBookingPath,
  wantsCalendarPilotOverlay
} from './modules/staff-booking-surfaces.js';

if (isPublicBookingPath(location.pathname)) {
  document.documentElement.classList.add('synthetic-workbench-ready');
} else if (
  !wantsCalendarPilotOverlay(location.search) &&
  sessionStorage.getItem('calPilotCsrf')
) {
  document.documentElement.classList.add('synthetic-workbench-ready');
} else {
  const response = await fetch('/v1/calendar-session/client-config', {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' }
  }).catch(() => undefined);

  if (response?.ok === true) {
    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = './calendar-pilot.css';
    const stylesheetLoaded = new Promise((resolve, reject) => {
      stylesheet.addEventListener('load', resolve, { once: true });
      stylesheet.addEventListener(
        'error',
        () => reject(new Error('CAL-PILOT stylesheet failed to load.')),
        { once: true }
      );
    });
    document.head.append(stylesheet);
    await stylesheetLoaded;
    await import('./calendar-pilot-client.js');
  } else {
    document.documentElement.classList.add('synthetic-workbench-ready');
  }
}

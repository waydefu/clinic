import { shouldHydrateCalendarPilotWorkbench } from './modules/pilot-google-totp-session.js';

if (
  !location.search.includes('calendarPilot=1') &&
  shouldHydrateCalendarPilotWorkbench(sessionStorage)
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

if (
  location.pathname === '/booking' ||
  location.pathname.endsWith('/patient.html')
) {
  document.documentElement.classList.add('synthetic-workbench-ready');
} else {
  const response = await fetch('/v1/calendar-session/client-config', {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' }
  }).catch(() => undefined);

  if (response?.ok === true) {
    document.documentElement.dataset.calendarSessionMode = 'server';
    window.dispatchEvent(new Event('beauessence:calendar-session-enabled'));
    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = './calendar-pilot.css';
    stylesheet.dataset.calendarPilotStyle = '';
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
  } else if (
    ['localhost', '127.0.0.1', '[::1]', '::1'].includes(location.hostname)
  ) {
    document.documentElement.classList.add('synthetic-workbench-ready');
  } else if (document.body !== undefined) {
    const message = document.createElement('p');
    message.setAttribute('role', 'alert');
    message.textContent = '工作人員登入服務暫時不可用，請稍後重試。';
    document.body.append(message);
  }
}

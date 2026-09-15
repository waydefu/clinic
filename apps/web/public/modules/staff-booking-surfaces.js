import { permissionsFor } from './permissions.js';

const FORBIDDEN_PREVIEW_HOST = 'beauessence-clinic-staging.web.app';
const ISOLATED_C1_PREVIEW =
  /^beauessence-clinic-stg-[a-z0-9]{1,7}--[\w.-]+\.(?:web\.app|firebaseapp\.com)$/u;

export function isPublicBookingPath(pathname = '') {
  return pathname === '/booking' || pathname.endsWith('/patient.html');
}

export function isStaffWorkbenchPath(pathname = '') {
  return (
    pathname === '/staff' ||
    pathname === '/' ||
    pathname.endsWith('/index.html')
  );
}

export function wantsCalendarPilotOverlay(search = '') {
  return new URLSearchParams(String(search)).get('calendarPilot') === '1';
}

export function isForbiddenStagingHost(hostname = '') {
  return (
    hostname === FORBIDDEN_PREVIEW_HOST ||
    hostname.endsWith(`.${FORBIDDEN_PREVIEW_HOST}`)
  );
}

export function isIsolatedC1PreviewHost(hostname = '') {
  return ISOLATED_C1_PREVIEW.test(String(hostname));
}

export function staffRoleFromStorage(storage = globalThis.sessionStorage) {
  const role = storage?.getItem('calPilotRole');
  return role === 'front_desk' || role === 'manager' ? role : undefined;
}

export function applyServerStaffSessionSnapshot(
  state,
  storage = globalThis.sessionStorage
) {
  const csrf = storage?.getItem('calPilotCsrf');
  const role = staffRoleFromStorage(storage);
  if (typeof csrf !== 'string' || csrf === '' || role === undefined) {
    return state;
  }
  const account = Array.isArray(state?.workspace?.accounts)
    ? state.workspace.accounts.find(
        (item) => item.role === role && item.status === 'active'
      )
    : undefined;
  if (account === undefined) return state;
  const nextWorkspace = {
    ...state.workspace,
    authenticated: true,
    currentAccountId: account.id
  };
  return {
    ...state,
    workspace: nextWorkspace,
    session: {
      ...state.session,
      account,
      authenticated: true,
      permissions: permissionsFor({ workspace: nextWorkspace })
    }
  };
}

export function clearServerStaffSession(storage = globalThis.sessionStorage) {
  storage?.removeItem('calPilotCsrf');
  storage?.removeItem('calPilotRole');
}

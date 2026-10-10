import {
  calendarPilotVerifiedActor,
  subscribeCalendarPilotClientAuthority
} from './calendar-pilot-authority.js';
import { permissionsFor } from './permissions.js';

export function hydrateStaff(state, storage = globalThis.sessionStorage) {
  const verified = calendarPilotVerifiedActor();
  if (!verified) return state;
  const csrf = storage?.getItem('calPilotCsrf');
  const role = storage?.getItem('calPilotRole');
  if (!csrf || (role !== 'front_desk' && role !== 'manager')) return state;
  if (verified.csrfToken !== csrf || verified.actorRole !== role) return state;
  const account = {
    id: verified.actorId,
    role: verified.actorRole,
    status: 'active',
    label: '已驗證的工作人員'
  };
  const workspace = {
    ...state.workspace,
    authenticated: true,
    currentAccountId: account.id,
    accounts: [
      ...(state.workspace?.accounts ?? []).filter(
        (item) => item.id !== account.id
      ),
      account
    ]
  };
  return {
    ...state,
    workspace,
    session: {
      ...state.session,
      account,
      authenticated: true,
      permissions: permissionsFor({ workspace })
    }
  };
}

/** Cache is a hint; /state and /me may settle in either order. */
export function applyCalendarPilotWorkbenchAuthority(state) {
  if (calendarPilotVerifiedActor()) return hydrateStaff(state);
  return {
    ...state,
    workspace: {
      ...state.workspace,
      authenticated: false,
      currentAccountId: null
    },
    session: {
      ...state.session,
      authenticated: false,
      account: null,
      permissions: []
    }
  };
}

export function bindCalendarPilotWorkbenchAuthority(readState, applyState) {
  return subscribeCalendarPilotClientAuthority(() => {
    const current = readState();
    if (current !== undefined)
      applyState(applyCalendarPilotWorkbenchAuthority(current));
  });
}

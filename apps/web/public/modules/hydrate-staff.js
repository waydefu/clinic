import { permissionsFor } from './permissions.js';

export function hydrateStaff(state, storage = globalThis.sessionStorage) {
  const csrf = storage?.getItem('calPilotCsrf');
  const role = storage?.getItem('calPilotRole');
  if (!csrf || (role !== 'front_desk' && role !== 'manager')) return state;
  const account = (state?.workspace?.accounts ?? []).find(
    (item) => item.role === role && item.status === 'active'
  );
  if (!account) return state;
  const workspace = {
    ...state.workspace,
    authenticated: true,
    currentAccountId: account.id
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

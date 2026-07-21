import { PERMISSIONS } from './constants.js';

const rolePermissions = Object.freeze({
  admin: new Set(Object.values(PERMISSIONS)),
  front_desk: new Set([
    PERMISSIONS.CREATE_BOOKING,
    PERMISSIONS.CANCEL_BOOKING,
    PERMISSIONS.COMPLETE_VISIT
  ])
});

// Resolves only the account that is actually selected and active. There is
// deliberately no fallback: an unresolvable session must lose its permissions
// rather than inherit someone else's. `loadState` repairs stale sessions by
// discarding the stored state, so this never becomes an unrecoverable UI.
export function currentAccount(state) {
  return state.workspace.accounts.find(
    (account) =>
      account.id === state.workspace.currentAccountId &&
      account.status === 'active'
  );
}

export function permissionsFor(state) {
  const account = currentAccount(state);
  return account === undefined
    ? []
    : [...(rolePermissions[account.role] ?? new Set())];
}

export function hasPermission(state, permission) {
  const account = currentAccount(state);
  return (
    account !== undefined &&
    (rolePermissions[account.role]?.has(permission) ?? false)
  );
}

export function requirePermission(state, permission) {
  if (!hasPermission(state, permission)) {
    throw new Error('目前合成帳號沒有執行此動作的權限。');
  }
  return currentAccount(state);
}

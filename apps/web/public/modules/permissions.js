import { PERMISSIONS } from './constants.js';

const rolePermissions = Object.freeze({
  admin: new Set(Object.values(PERMISSIONS)),
  front_desk: new Set([
    PERMISSIONS.CREATE_BOOKING,
    PERMISSIONS.CANCEL_BOOKING,
    PERMISSIONS.COMPLETE_VISIT
  ])
});

export function currentAccount(state) {
  const selected = state.workspace.accounts.find(
    (account) => account.id === state.workspace.currentAccountId && account.status === 'active'
  );
  if (selected !== undefined) return selected;
  return state.workspace.accounts.find(
    (account) => account.role === 'admin' && account.status === 'active'
  );
}

export function permissionsFor(state) {
  const account = currentAccount(state);
  return account === undefined ? [] : [...(rolePermissions[account.role] ?? new Set())];
}

export function hasPermission(state, permission) {
  const account = currentAccount(state);
  return account !== undefined && (rolePermissions[account.role]?.has(permission) ?? false);
}

export function requirePermission(state, permission) {
  if (!hasPermission(state, permission)) {
    throw new Error('目前合成帳號沒有執行此動作的權限。');
  }
  return currentAccount(state);
}

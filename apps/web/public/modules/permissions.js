import { PERMISSIONS } from './constants.js';

// 櫃台保有「取消」：取消是每天都在做的營運動作，收斂給管理者只會讓現場卡住。
// 「刪除」則刻意只給管理者——它讓紀錄從營運清單消失，只留下稽核事件。這是
// 2026-07-24 負責人方向對「管理者可取消／刪除」的實作判讀，仍待 D-006 稽核。
const rolePermissions = Object.freeze({
  admin: new Set(Object.values(PERMISSIONS)),
  front_desk: new Set([
    PERMISSIONS.CREATE_BOOKING,
    PERMISSIONS.CANCEL_BOOKING,
    PERMISSIONS.COMPLETE_VISIT,
    PERMISSIONS.MANAGE_FOLLOW_UP,
    PERMISSIONS.ASSIGN_CASE
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
  if (state.workspace.authenticated !== true) return [];
  const account = currentAccount(state);
  return account === undefined
    ? []
    : [...(rolePermissions[account.role] ?? new Set())];
}

export function hasPermission(state, permission) {
  if (state.workspace.authenticated !== true) return false;
  const account = currentAccount(state);
  return (
    account !== undefined &&
    (rolePermissions[account.role]?.has(permission) ?? false)
  );
}

export function requirePermission(state, permission) {
  if (state.workspace.authenticated !== true) {
    throw new Error('請先登入後再操作。');
  }
  if (!hasPermission(state, permission)) {
    throw new Error('目前合成帳號沒有執行此動作的權限。');
  }
  return currentAccount(state);
}

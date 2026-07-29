import {
  authoriseDelegatedAction,
  planDelegationRecord
} from '../vendor/domain/delegated-authorization.js';
import { PERMISSIONS } from './constants.js';

// 櫃台保有「取消」：取消是每天都在做的營運動作，收斂給管理者只會讓現場卡住。
// 「刪除」則刻意只給管理者——它讓紀錄從營運清單消失，只留下稽核事件。這是
// D-006 已核准的基線：管理者可刪除，櫃台若要刪除必須走另外核准的委派路徑。
// 這裡仍只是 browser-local 合成示範，不是 Stage 2 C4 的 server-side 授權證據。
//
// 2026-07-27 負責人補充：刪除可以「委派」給櫃台，但要授權碼，而且授權碼由管理者
// 自訂、可多組、可個別開關。角色表因此維持不變——委派是**額外**的一條路徑，不是
// 把權限搬進 front_desk；分開之後「這個角色天生有什麼」與「這次是被授權的」在
// 稽核上永遠分得清楚。
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

/** 這項權限目前有沒有一條「委派」的路可走（供 UI 決定要不要顯示入口）。 */
export function delegationFor(state, permission) {
  return (state.workspace.delegations ?? []).find(
    (item) => item.permission === permission
  );
}

/**
 * 委派入口是否該出現在畫面上。
 *
 * 判斷刻意寬鬆——只看「有沒有可能」，不看授權碼對不對：入口不出現，櫃台連要求
 * 授權的機會都沒有；真正的把關在 `requirePermissionOrDelegation`。
 */
export function canUseDelegation(state, permission) {
  if (state.workspace.authenticated !== true) return false;
  if (hasPermission(state, permission)) return false;
  const account = currentAccount(state);
  const delegation = delegationFor(state, permission);
  return (
    account !== undefined &&
    delegation !== undefined &&
    delegation.enabled === true &&
    delegation.delegatedToRole === account.role &&
    delegation.authorizations.some((item) => item.enabled === true)
  );
}

// 拒絕原因轉成中文。「沒有設定授權碼」與「授權碼不正確」要分開講：前者是櫃台
// 該去找管理者，後者是自己打錯，混在一起只會讓現場卡住又不知道找誰。
const DELEGATION_MESSAGES = {
  not_delegated_to_role: '這個動作沒有委派給你的角色。',
  delegation_disabled: '管理者目前關閉了這項授權。',
  no_authorization_configured: '管理者尚未設定可用的授權碼，請聯絡管理者。',
  secret_required: '請輸入管理者提供的授權碼。',
  secret_not_recognised: '授權碼不正確。'
};

/**
 * 先看角色本來就有沒有這項權限；沒有才走委派。
 *
 * 回傳 `{ actor, delegation }`——`delegation` 有值時代表這一次是被授權執行的，
 * 呼叫端必須把它寫進稽核。管理者自己動手時不需要授權碼，也不會產生委派紀錄。
 */
export function requirePermissionOrDelegation(state, permission, secret) {
  if (state.workspace.authenticated !== true) {
    throw new Error('請先登入後再操作。');
  }
  if (hasPermission(state, permission)) {
    return { actor: currentAccount(state), delegation: undefined };
  }

  const account = currentAccount(state);
  const delegation = delegationFor(state, permission);
  if (account === undefined || delegation === undefined) {
    throw new Error('目前合成帳號沒有執行此動作的權限。');
  }

  const decision = authoriseDelegatedAction(delegation, account.role, secret);
  if (!decision.authorised) {
    throw new Error(
      DELEGATION_MESSAGES[decision.reason] ??
        '目前合成帳號沒有執行此動作的權限。'
    );
  }
  return {
    actor: account,
    delegation: planDelegationRecord(delegation, decision)
  };
}

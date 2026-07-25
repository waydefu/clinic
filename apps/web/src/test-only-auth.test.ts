import { describe, expect, it } from 'vitest';

import { PERMISSIONS } from '../public/modules/constants.js';
import { permissionsFor } from '../public/modules/permissions.js';
import { initialState } from '../public/modules/state-schema.js';
import {
  authenticateAccount,
  createAccount,
  logout,
  toggleAccount
} from '../public/modules/workspace-domain.js';

// 合成帳密登入原型：不是安全邊界，只是把工作臺的角色切換換成帳密登入的 UX。
// 這裡釘住登入的行為，以及登出後權限必須立即歸零。
describe('synthetic workbench login', () => {
  it('starts logged out but with a seeded current account', () => {
    const state = initialState();
    expect(state.workspace.authenticated).toBe(false);
    expect(state.workspace.currentAccountId).toBe('admin_test_001');
  });

  it('authenticates the seeded admin with the right credentials', () => {
    const state = initialState();
    const account = authenticateAccount(state, 'admin', 'beauessence-admin');
    expect(account.role).toBe('admin');
    expect(state.workspace.authenticated).toBe(true);
    expect(state.workspace.currentAccountId).toBe('admin_test_001');
  });

  it('switches the current account when another account logs in', () => {
    const state = initialState();
    authenticateAccount(state, 'front', 'beauessence-front');
    expect(state.workspace.currentAccountId).toBe('front_desk_test_001');
    expect(state.workspace.authenticated).toBe(true);
  });

  it('trims the username but rejects a wrong password without logging in', () => {
    const state = initialState();
    expect(() => authenticateAccount(state, ' admin ', 'wrong')).toThrow();
    expect(state.workspace.authenticated).toBe(false);
  });

  it('gives one message whether the account or the password is wrong', () => {
    const state = initialState();
    const unknownUser = () => authenticateAccount(state, 'nobody', 'x');
    const wrongPassword = () => authenticateAccount(state, 'admin', 'x');
    expect(unknownUser).toThrow('帳號或密碼錯誤，或帳號已停用。');
    expect(wrongPassword).toThrow('帳號或密碼錯誤，或帳號已停用。');
  });

  it('refuses to authenticate a disabled account', () => {
    const state = initialState();
    toggleAccount(state, 'front_desk_test_001');
    expect(() =>
      authenticateAccount(state, 'front', 'beauessence-front')
    ).toThrow();
  });

  it('logs out and immediately drops every capability', () => {
    const state = initialState();
    authenticateAccount(state, 'admin', 'beauessence-admin');
    logout(state);
    expect(state.workspace.authenticated).toBe(false);
    expect(permissionsFor(state)).toEqual([]);
  });

  it('requires both an authenticated session and a permitted role', () => {
    const loggedOut = initialState();
    expect(permissionsFor(loggedOut)).toEqual([]);

    const frontDesk = initialState();
    authenticateAccount(frontDesk, 'front', 'beauessence-front');
    expect(permissionsFor(frontDesk)).toContain(PERMISSIONS.CREATE_BOOKING);
    expect(permissionsFor(frontDesk)).not.toContain(
      PERMISSIONS.MANAGE_ACCOUNTS
    );
    expect(permissionsFor(frontDesk)).toContain(PERMISSIONS.MANAGE_FOLLOW_UP);
    expect(permissionsFor(frontDesk)).toContain(PERMISSIONS.ASSIGN_CASE);
    expect(permissionsFor(frontDesk)).not.toContain(PERMISSIONS.REASSIGN_CASE);
  });

  it('lets a newly created synthetic account log in with its generated credentials', () => {
    const state = initialState();
    createAccount(state, { label: '測試櫃台 B', role: 'front_desk' });
    const account = authenticateAccount(
      state,
      'front_desk002',
      'beauessence-002'
    );
    expect(account.label).toBe('測試櫃台 B');
    expect(state.workspace.authenticated).toBe(true);
  });
});

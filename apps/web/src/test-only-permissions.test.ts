import { describe, expect, it } from 'vitest';
import {
  currentAccount,
  hasPermission,
  permissionsFor,
  requirePermission
} from '../public/modules/permissions.js';
import { initialState, isUsableState } from '../public/modules/state-schema.js';
import { PERMISSIONS } from '../public/modules/constants.js';

const MANAGE_ACCOUNTS = PERMISSIONS.MANAGE_ACCOUNTS;

describe('synthetic session resolution fails closed', () => {
  it('resolves the selected active account', () => {
    const state = initialState();
    state.workspace.currentAccountId = 'front_desk_test_001';
    expect(currentAccount(state)?.role).toBe('front_desk');
  });

  it('does not fall back to an administrator when the session is unknown', () => {
    const state = initialState();
    state.workspace.currentAccountId = 'ghost_test_999';

    expect(currentAccount(state)).toBeUndefined();
    expect(permissionsFor(state)).toEqual([]);
    expect(hasPermission(state, MANAGE_ACCOUNTS)).toBe(false);
    expect(() => requirePermission(state, MANAGE_ACCOUNTS)).toThrow();
  });

  it('does not fall back to an administrator when the session is disabled', () => {
    const state = initialState();
    state.workspace.currentAccountId = 'front_desk_test_001';
    const account = state.workspace.accounts.find(
      (item: { id: string }) => item.id === 'front_desk_test_001'
    );
    account.status = 'disabled';

    expect(currentAccount(state)).toBeUndefined();
    expect(hasPermission(state, MANAGE_ACCOUNTS)).toBe(false);
  });

  it('never grants front desk an administrator-only permission', () => {
    const state = initialState();
    state.workspace.currentAccountId = 'front_desk_test_001';
    expect(hasPermission(state, MANAGE_ACCOUNTS)).toBe(false);
  });
});

describe('stored synthetic state is validated before use', () => {
  it('accepts the shipped initial state', () => {
    expect(isUsableState(initialState())).toBe(true);
  });

  it('rejects a dangling session so the store falls back to a clean state', () => {
    const state = initialState();
    state.workspace.currentAccountId = 'ghost_test_999';
    expect(isUsableState(state)).toBe(false);
  });

  it('rejects a superseded schema version', () => {
    const state = initialState();
    state.schemaVersion = 1;
    expect(isUsableState(state)).toBe(false);
  });

  it('rejects structurally broken state', () => {
    expect(isUsableState(null)).toBe(false);
    expect(isUsableState({ schemaVersion: 2 })).toBe(false);

    const missingWorkspace = initialState();
    delete missingWorkspace.workspace;
    expect(isUsableState(missingWorkspace)).toBe(false);

    const brokenCollections = initialState();
    brokenCollections.appointments = 'not-an-array';
    expect(isUsableState(brokenCollections)).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import {
  currentAccount,
  hasPermission,
  permissionsFor,
  requirePermission
} from '../public/modules/permissions.js';
import { initialState, isUsableState } from '../public/modules/state-schema.js';
import { PERMISSIONS } from '../public/modules/constants.js';
import {
  identityKey,
  maskNationalId,
  validatePatientInput
} from '../public/modules/patient-registry.js';

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
    state.workspace.authenticated = true;
    expect(hasPermission(state, MANAGE_ACCOUNTS)).toBe(false);
  });

  // 2026-07-24 負責人方向（D-006）：櫃台保有日常的「取消」，但「刪除」讓紀錄
  // 從營運清單消失，只留稽核，因此只給管理者。
  it('separates the front desk cancel right from the administrator delete right', () => {
    const state = initialState();
    state.workspace.authenticated = true;

    state.workspace.currentAccountId = 'front_desk_test_001';
    expect(hasPermission(state, PERMISSIONS.CANCEL_BOOKING)).toBe(true);
    expect(hasPermission(state, PERMISSIONS.DELETE_APPOINTMENT)).toBe(false);
    expect(() =>
      requirePermission(state, PERMISSIONS.DELETE_APPOINTMENT)
    ).toThrow();

    state.workspace.currentAccountId = 'admin_test_001';
    expect(hasPermission(state, PERMISSIONS.CANCEL_BOOKING)).toBe(true);
    expect(hasPermission(state, PERMISSIONS.DELETE_APPOINTMENT)).toBe(true);
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

describe('患者資料驗證與遮罩', () => {
  const VALID = {
    name: '王測試',
    phone: '0912345678',
    birthDate: '1990-05-20',
    nationalId: 'a123456789',
    hasNhiCard: true
  };

  it('正規化身分證字號並保留欄位', () => {
    const result = validatePatientInput(VALID);
    expect(result.nationalId).toBe('A123456789');
    expect(result.hasNhiCard).toBe(true);
  });

  it('未勾選健保卡時預設為 false', () => {
    expect(
      validatePatientInput({ ...VALID, hasNhiCard: undefined }).hasNhiCard
    ).toBe(false);
  });

  it('拒絕無效輸入', () => {
    expect(() => validatePatientInput({ ...VALID, name: '   ' })).toThrow(
      /姓名/
    );
    expect(() =>
      validatePatientInput({ ...VALID, name: 'x'.repeat(31) })
    ).toThrow(/姓名/);
    expect(() => validatePatientInput({ ...VALID, phone: '12' })).toThrow(
      /電話/
    );
    expect(() =>
      validatePatientInput({ ...VALID, birthDate: '1800-01-01' })
    ).toThrow(/西元/);
    expect(() =>
      validatePatientInput({ ...VALID, birthDate: '2999-01-01' })
    ).toThrow(/生日/);
    expect(() =>
      validatePatientInput({ ...VALID, nationalId: 'A323456789' })
    ).toThrow(/身分證/);
  });

  it('身分證字號一律以遮罩呈現', () => {
    expect(maskNationalId('A123456789')).toBe('A12****789');
    expect(maskNationalId('A123456789')).not.toContain('456');
    expect(maskNationalId('')).toBe('——');
    expect(maskNationalId(undefined)).toBe('——');
  });

  it('身分證字號大小寫不影響身分比對', () => {
    expect(identityKey({ nationalId: 'a123456789' })).toBe(
      identityKey({ nationalId: 'A123456789' })
    );
  });
});

import { describe, expect, it } from 'vitest';
import {
  currentAccount,
  hasPermission,
  permissionsFor,
  requirePermission
} from '../public/modules/permissions.js';
import { initialState, isUsableState } from '../public/modules/state-schema.js';
import { PERMISSIONS } from '../public/modules/constants.js';
import { normaliseRole } from '../public/vendor/domain/roles.js';
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

  it('fail-closes leftover stored admin after schema v8 and unknown roles', () => {
    const state = initialState();
    state.workspace.authenticated = true;
    const seeded = state.workspace.accounts.find(
      (item) => item.id === 'admin_test_001'
    );
    if (seeded === undefined) throw new Error('missing seed account');
    expect(seeded.role).toBe('manager');
    expect(normaliseRole('admin')).toBe('manager');
    expect(normaliseRole(seeded.role)).toBe('manager');
    expect(hasPermission(state, MANAGE_ACCOUNTS)).toBe(true);

    seeded.role = 'admin';
    expect(permissionsFor(state)).toEqual([]);
    expect(hasPermission(state, MANAGE_ACCOUNTS)).toBe(false);

    seeded.role = 'not_a_role';
    expect(permissionsFor(state)).toEqual([]);
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

  it('discards schema 7 leftover admin blobs instead of reading them', () => {
    const state = initialState();
    state.schemaVersion = 7;
    state.workspace.accounts[0].role = 'admin';
    expect(isUsableState(state)).toBe(false);
    expect(initialState().workspace.accounts[0].role).toBe('manager');
    expect(initialState().schemaVersion).toBe(8);
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
  // 2026-09-22（BOOKING-MINIMIZATION-2026-09-22）：新預約只收這四個欄位。
  const VALID = {
    name: '王測試',
    phone: '0912345678',
    birthDate: '--05-20',
    nationality: 'domestic'
  };

  it('只留下新預約收集的四個欄位', () => {
    const result = validatePatientInput({
      ...VALID,
      nationalId: 'A123456789',
      hasNhiCard: true
    });
    expect(result).toEqual(VALID);
  });

  it('接受閏日，因為沒有年份可以判斷', () => {
    expect(
      validatePatientInput({ ...VALID, birthDate: '--02-29' }).birthDate
    ).toBe('--02-29');
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
      validatePatientInput({ ...VALID, birthDate: '1990-05-20' })
    ).toThrow(/出生月份與日期/);
    expect(() =>
      validatePatientInput({ ...VALID, birthDate: '--02-30' })
    ).toThrow(/有效的月份與日期/);
    expect(() =>
      validatePatientInput({ ...VALID, nationality: undefined })
    ).toThrow(/本國或外國/);
    expect(() =>
      validatePatientInput({ ...VALID, nationality: 'stateless' })
    ).toThrow(/本國或外國/);
  });

  // 只用於顯示舊紀錄。
  it('舊紀錄的身分證字號一律以遮罩呈現', () => {
    expect(maskNationalId('A123456789')).toBe('A12****789');
    expect(maskNationalId('A123456789')).not.toContain('456');
    expect(maskNationalId('')).toBe('——');
    expect(maskNationalId(undefined)).toBe('——');
  });

  // 比對鍵只用電話數字與月日生日；姓名不進鍵，由 resolveIntakeCandidate 另外比。
  it('身分比對鍵只看電話數字與月日生日', () => {
    expect(
      identityKey({ phone: '0912-345-678', birthDate: '--05-20', name: '甲' })
    ).toBe(
      identityKey({ phone: '0912345678', birthDate: '--05-20', name: '乙' })
    );
    expect(identityKey({ phone: '0912345678', birthDate: '--05-20' })).not.toBe(
      identityKey({ phone: '0912345678', birthDate: '--05-21' })
    );
  });
});

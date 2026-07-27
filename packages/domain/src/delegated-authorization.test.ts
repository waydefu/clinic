import { describe, expect, it } from 'vitest';

import { DomainError } from './errors.js';
import {
  assertAuthorizationShape,
  authoriseDelegatedAction,
  planDelegationRecord,
  type DelegationPolicy
} from './delegated-authorization.js';

const policy = (
  overrides: Partial<DelegationPolicy> = {}
): DelegationPolicy => ({
  permission: 'delete_appointment',
  delegatedToRole: 'front_desk',
  enabled: true,
  authorizations: [
    { id: 'auth_1', label: '早班櫃台', secret: 'morning-key', enabled: true },
    { id: 'auth_2', label: '晚班櫃台', secret: 'evening-key', enabled: true }
  ],
  ...overrides
});

describe('authoriseDelegatedAction', () => {
  it('啟用中的授權碼可以通過，並回報是哪一組', () => {
    expect(
      authoriseDelegatedAction(policy(), 'front_desk', 'evening-key')
    ).toEqual({
      authorised: true,
      authorizationId: 'auth_2',
      authorizationLabel: '晚班櫃台'
    });
  });

  it('多組並存：停掉一組不影響另一組', () => {
    const withOneRevoked = policy({
      authorizations: [
        {
          id: 'auth_1',
          label: '早班櫃台',
          secret: 'morning-key',
          enabled: false
        },
        {
          id: 'auth_2',
          label: '晚班櫃台',
          secret: 'evening-key',
          enabled: true
        }
      ]
    });
    expect(
      authoriseDelegatedAction(withOneRevoked, 'front_desk', 'evening-key')
        .authorised
    ).toBe(true);
    expect(
      authoriseDelegatedAction(withOneRevoked, 'front_desk', 'morning-key')
        .authorised
    ).toBe(false);
  });

  // 這是本檔最重要的一條：被撤銷的人輸入自己那組舊授權碼時，得到的訊息必須與
  // 「亂猜一組」完全相同。否則等於告訴對方「你這組是真的，只是被關掉了」。
  it('已停用的授權碼與從未存在的授權碼給出相同的拒絕原因', () => {
    // 情境要對：必須還有**別組是啟用的**，比對才會真的發生。若一組都沒啟用，
    // 函式在比對之前就回「沒有設定」——那條路徑本來就讀不到任何授權碼，另有
    // 測試涵蓋。
    const revoked = policy({
      authorizations: [
        {
          id: 'auth_1',
          label: '早班櫃台',
          secret: 'morning-key',
          enabled: false
        },
        {
          id: 'auth_2',
          label: '晚班櫃台',
          secret: 'evening-key',
          enabled: true
        }
      ]
    });
    expect(
      authoriseDelegatedAction(revoked, 'front_desk', 'morning-key')
    ).toEqual({ authorised: false, reason: 'secret_not_recognised' });
    expect(
      authoriseDelegatedAction(revoked, 'front_desk', 'never-was-a-key')
    ).toEqual({ authorised: false, reason: 'secret_not_recognised' });
  });

  it('總開關關掉時，任何一組授權碼都不通過', () => {
    expect(
      authoriseDelegatedAction(
        policy({ enabled: false }),
        'front_desk',
        'morning-key'
      )
    ).toEqual({ authorised: false, reason: 'delegation_disabled' });
  });

  it('一組授權碼都沒設定時，說的是「沒有設定」而不是「密碼錯誤」', () => {
    expect(
      authoriseDelegatedAction(
        policy({ authorizations: [] }),
        'front_desk',
        'x'
      )
    ).toEqual({ authorised: false, reason: 'no_authorization_configured' });
  });

  it('全部都被停用等同於沒有設定', () => {
    const allOff = policy({
      authorizations: [
        {
          id: 'auth_1',
          label: '早班櫃台',
          secret: 'morning-key',
          enabled: false
        }
      ]
    });
    expect(
      authoriseDelegatedAction(allOff, 'front_desk', 'morning-key').authorised
    ).toBe(false);
    expect(authoriseDelegatedAction(allOff, 'front_desk', '').reason).toBe(
      'no_authorization_configured'
    );
  });

  it('沒有輸入授權碼與輸入錯誤的授權碼是不同的原因', () => {
    expect(authoriseDelegatedAction(policy(), 'front_desk', '')).toEqual({
      authorised: false,
      reason: 'secret_required'
    });
    expect(authoriseDelegatedAction(policy(), 'front_desk', undefined)).toEqual(
      {
        authorised: false,
        reason: 'secret_required'
      }
    );
  });

  it('委派對象不是這個角色時，授權碼再正確也不通過', () => {
    expect(authoriseDelegatedAction(policy(), 'nurse', 'morning-key')).toEqual({
      authorised: false,
      reason: 'not_delegated_to_role'
    });
  });
});

describe('assertAuthorizationShape', () => {
  it('去掉前後空白後回傳', () => {
    expect(assertAuthorizationShape('  早班櫃台 ', ' morning-key ')).toEqual({
      label: '早班櫃台',
      secret: 'morning-key'
    });
  });

  it('名稱不可空白——稽核紀錄留的是名稱，沒有名稱等於沒有留', () => {
    expect(() => assertAuthorizationShape('   ', 'morning-key')).toThrow(
      DomainError
    );
    expect(() =>
      assertAuthorizationShape('x'.repeat(31), 'morning-key')
    ).toThrow(/1-30/);
  });

  it('授權碼太短就拒絕', () => {
    expect(() => assertAuthorizationShape('早班', '12345')).toThrow(
      /at least 6/
    );
    expect(assertAuthorizationShape('早班', '123456').secret).toBe('123456');
  });
});

describe('planDelegationRecord', () => {
  it('稽核紀錄帶名稱與 id，但絕不帶授權碼', () => {
    const decision = authoriseDelegatedAction(
      policy(),
      'front_desk',
      'morning-key'
    );
    const record = planDelegationRecord(policy(), decision);
    expect(record).toEqual({
      delegated: true,
      permission: 'delete_appointment',
      authorizationId: 'auth_1',
      authorizationLabel: '早班櫃台'
    });
    expect(JSON.stringify(record)).not.toContain('morning-key');
  });

  it('未通過的判斷不可能被寫成稽核紀錄', () => {
    const denied = authoriseDelegatedAction(policy(), 'front_desk', 'wrong');
    expect(() => planDelegationRecord(policy(), denied)).toThrow(DomainError);
  });
});

import { describe, expect, it } from 'vitest';

import {
  LEGACY_ROLE_ALIASES,
  OPERATIONAL_ROLES,
  ROLES,
  ROLE_LABELS,
  SYSTEM_ROLES,
  isRole,
  normaliseRole
} from './roles.js';

// 這個模組存在的唯一理由是消滅三套並存的角色定義，所以測試釘的是「單一來源」
// 本身的性質，不是某一次的字串內容。
describe('roles', () => {
  it('keeps operational and system roles disjoint', () => {
    const overlap = OPERATIONAL_ROLES.filter((role) =>
      (SYSTEM_ROLES as readonly string[]).includes(role)
    );
    expect(overlap).toEqual([]);
  });

  it('has no duplicate codes', () => {
    expect(new Set(ROLES).size).toBe(ROLES.length);
  });

  // 少一個標籤不會有型別錯誤以外的徵兆，但介面上會出現一個空白的角色名稱。
  it('labels every role', () => {
    for (const role of ROLES) {
      expect(ROLE_LABELS[role], `${role} 沒有繁中標籤`).toBeTruthy();
    }
  });

  it('separates clinic-operations manager from technical system_admin', () => {
    expect(ROLE_LABELS.manager).not.toBe(ROLE_LABELS.system_admin);
  });

  describe('normaliseRole', () => {
    it('passes through canonical codes', () => {
      expect(normaliseRole('manager')).toBe('manager');
      expect(normaliseRole('physician')).toBe('physician');
    });

    it('maps the browser legacy admin onto manager', () => {
      expect(normaliseRole('admin')).toBe('manager');
    });

    // 認不得的身分必須失去權限，不得繼承任何人的。
    it.each([undefined, null, '', 'superuser', 42, {}])(
      'returns undefined for %p rather than defaulting',
      (value) => {
        expect(normaliseRole(value)).toBeUndefined();
      }
    );

    it('never resolves to a role outside the canonical set', () => {
      for (const legacy of Object.keys(LEGACY_ROLE_ALIASES)) {
        expect(isRole(normaliseRole(legacy))).toBe(true);
      }
    });
  });

  describe('isRole', () => {
    it('accepts every canonical role', () => {
      for (const role of ROLES) expect(isRole(role)).toBe(true);
    });

    // 別名不是正規角色：新程式只能用正規代碼，別名僅供讀取舊資料。
    it('rejects legacy aliases', () => {
      expect(isRole('admin')).toBe(false);
    });
  });
});

import { describe, expect, it } from 'vitest';

import { DomainError } from './errors.js';
import {
  maskNationalId,
  normalisePatientIdentity,
  patientIdentityIssues,
  patientIdentityKey
} from './patient-identity.js';

// 2026-07-26T12:00:00+08:00。生日規則要比對「今天」，所以時間是參數而不是時鐘。
const NOW = Date.parse('2026-07-26T04:00:00Z');

const VALID = {
  name: '王小明',
  phone: '0912-345-678',
  birthDate: '1990-05-20',
  nationalId: 'A123456789',
  hasNhiCard: true
};

describe('patientIdentityIssues', () => {
  it('接受一組完整且格式正確的身分資料', () => {
    expect(patientIdentityIssues(VALID, NOW)).toEqual([]);
  });

  it('空白與缺漏都回 required，而不是 format', () => {
    expect(
      patientIdentityIssues(
        { name: '   ', phone: undefined, birthDate: '', nationalId: null },
        NOW
      )
    ).toEqual([
      { field: 'name', code: 'required' },
      { field: 'phone', code: 'required' },
      { field: 'birthDate', code: 'required' },
      { field: 'nationalId', code: 'required' }
    ]);
  });

  it('依欄位在表單上的順序回報，讓介面可以直接對應', () => {
    const issues = patientIdentityIssues(
      { ...VALID, name: '', nationalId: 'X999' },
      NOW
    );
    expect(issues.map((issue) => issue.field)).toEqual(['name', 'nationalId']);
  });

  // 這是搬進 domain 時修掉的真缺陷：`new Date('1990-02-31T00:00:00+08:00')`
  // 不會失敗，它靜默滾成 3 月 3 日，於是不存在的生日通過了驗證。
  it('擋下格式正確但日曆上不存在的日期', () => {
    expect(
      patientIdentityIssues({ ...VALID, birthDate: '1990-02-31' }, NOW)
    ).toEqual([{ field: 'birthDate', code: 'not_a_calendar_date' }]);
    expect(
      patientIdentityIssues({ ...VALID, birthDate: '2025-02-29' }, NOW)
    ).toEqual([{ field: 'birthDate', code: 'not_a_calendar_date' }]);
  });

  it('閏年的 2 月 29 日是有效日期', () => {
    expect(
      patientIdentityIssues({ ...VALID, birthDate: '2024-02-29' }, NOW)
    ).toEqual([]);
  });

  it('生日不可晚於今天，但今天本身可以', () => {
    expect(
      patientIdentityIssues({ ...VALID, birthDate: '2026-07-26' }, NOW)
    ).toEqual([]);
    expect(
      patientIdentityIssues({ ...VALID, birthDate: '2026-07-27' }, NOW)
    ).toEqual([{ field: 'birthDate', code: 'in_the_future' }]);
  });

  it('年份超出支援範圍與格式錯誤是不同的原因', () => {
    expect(
      patientIdentityIssues({ ...VALID, birthDate: '1899-12-31' }, NOW)
    ).toEqual([{ field: 'birthDate', code: 'out_of_supported_range' }]);
    expect(
      patientIdentityIssues({ ...VALID, birthDate: '90-05-20' }, NOW)
    ).toEqual([{ field: 'birthDate', code: 'format' }]);
  });

  it('身分證字號第二碼只接受 1 或 2', () => {
    expect(
      patientIdentityIssues({ ...VALID, nationalId: 'A323456789' }, NOW)
    ).toEqual([{ field: 'nationalId', code: 'format' }]);
    expect(
      patientIdentityIssues({ ...VALID, nationalId: 'A223456789' }, NOW)
    ).toEqual([]);
  });

  it('姓名以字元數計算，不因表情符號的編碼長度誤判', () => {
    expect(
      patientIdentityIssues({ ...VALID, name: '王'.repeat(30) }, NOW)
    ).toEqual([]);
    expect(
      patientIdentityIssues({ ...VALID, name: '王'.repeat(31) }, NOW)
    ).toEqual([{ field: 'name', code: 'format' }]);
  });
});

describe('normalisePatientIdentity', () => {
  it('去掉空白並把身分證字號轉成大寫', () => {
    const identity = normalisePatientIdentity(
      { ...VALID, name: '  王小明 ', nationalId: 'a123456789' },
      NOW
    );
    expect(identity.name).toBe('王小明');
    expect(identity.nationalId).toBe('A123456789');
  });

  it('hasNhiCard 只認 true，其他一律 false', () => {
    expect(
      normalisePatientIdentity({ ...VALID, hasNhiCard: 'yes' }, NOW).hasNhiCard
    ).toBe(false);
  });

  it('以 DomainError 回報第一個問題的欄位與原因', () => {
    expect(() =>
      normalisePatientIdentity({ ...VALID, nationalId: 'X999' }, NOW)
    ).toThrow(DomainError);
    expect(() =>
      normalisePatientIdentity({ ...VALID, nationalId: 'X999' }, NOW)
    ).toThrow(/nationalId \(format\)/);
  });

  // 錯誤訊息會進日誌與錯誤回報管線。把輸入值回填等於讓身分證字號從一條
  // 沒有人在看的路徑外流。
  it('錯誤訊息不得回填輸入值', () => {
    const secret = 'A187654321';
    try {
      normalisePatientIdentity(
        { ...VALID, birthDate: '2099-01-01', nationalId: secret },
        NOW
      );
      expect.unreachable('應該要丟出 DomainError');
    } catch (error) {
      expect((error as Error).message).not.toContain(secret);
      expect((error as Error).message).not.toContain('2099-01-01');
    }
  });
});

describe('patientIdentityKey', () => {
  it('有身分證字號時以它為準，且不分大小寫', () => {
    expect(patientIdentityKey({ nationalId: 'a123456789' })).toBe(
      patientIdentityKey({ nationalId: 'A123456789' })
    );
  });

  it('沒有身分證字號時退回電話與生日的組合', () => {
    expect(
      patientIdentityKey({ phone: '0912345678', birthDate: '1990-05-20' })
    ).toBe('contact:0912345678|1990-05-20');
  });

  it('不同的人不會共用同一個鍵', () => {
    expect(patientIdentityKey({ nationalId: 'A123456789' })).not.toBe(
      patientIdentityKey({ nationalId: 'B123456789' })
    );
  });
});

describe('maskNationalId', () => {
  it('只露出前三碼與後三碼', () => {
    expect(maskNationalId('A123456789')).toBe('A12****789');
    expect(maskNationalId('A123456789')).not.toContain('456');
  });

  it('長度不足或不是字串時回破折號，不回半截號碼', () => {
    expect(maskNationalId('A123')).toBe('——');
    expect(maskNationalId('')).toBe('——');
    expect(maskNationalId(undefined)).toBe('——');
  });
});

import { describe, expect, it } from 'vitest';

import { DomainError } from './errors.js';
import {
  maskIdentityDocument,
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
      // 兩種證件都空時，問題不屬於其中任何一欄——介面要說的是「請填其中一個」，
      // 而不是對著使用者根本沒看到的那一欄報錯。
      { field: 'identityDocument', code: 'required' }
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

  it('身分證第二碼接受 1／2，居留證接受 8／9，其餘不收', () => {
    for (const nationalId of ['A123456789', 'A223456789'])
      expect(patientIdentityIssues({ ...VALID, nationalId }, NOW)).toEqual([]);
    // 2021-01 起的新式外來人口統一證號與國民身分證同形狀，第二碼是 8 或 9。
    for (const nationalId of ['A812345678', 'A912345678'])
      expect(patientIdentityIssues({ ...VALID, nationalId }, NOW)).toEqual([]);
    for (const nationalId of ['A323456789', 'AB12345678'])
      expect(patientIdentityIssues({ ...VALID, nationalId }, NOW)).toEqual([
        { field: 'nationalId', code: 'format' }
      ]);
  });

  // 2026-07-27（P11，業主）：生日的年份改為選填。
  describe('省略年份的生日', () => {
    const noYear = { ...VALID, birthDate: '--05-20' };

    it('接受 --MM-DD，並且不再套用年份才有的兩條規則', () => {
      expect(patientIdentityIssues(noYear, NOW)).toEqual([]);
      // 沒有年份就沒有「早於 1900」與「晚於今天」可言。
      expect(
        patientIdentityIssues({ ...VALID, birthDate: '--12-31' }, NOW)
      ).toEqual([]);
    });

    it('2 月 29 日不因為沒有年份而被擋下來', () => {
      expect(
        patientIdentityIssues({ ...VALID, birthDate: '--02-29' }, NOW)
      ).toEqual([]);
    });

    it('日曆上不存在的月日仍然擋下來', () => {
      expect(
        patientIdentityIssues({ ...VALID, birthDate: '--02-31' }, NOW)
      ).toEqual([{ field: 'birthDate', code: 'not_a_calendar_date' }]);
      expect(
        patientIdentityIssues({ ...VALID, birthDate: '--13-01' }, NOW)
      ).toEqual([{ field: 'birthDate', code: 'not_a_calendar_date' }]);
    });

    it('裸的 MM-DD 不算數：那個字串沒有人分得出是不是被截斷的', () => {
      expect(
        patientIdentityIssues({ ...VALID, birthDate: '05-20' }, NOW)
      ).toEqual([{ field: 'birthDate', code: 'format' }]);
    });
  });

  // 2026-07-27（P10，業主）：外籍患者改填護照。
  describe('身分證與護照擇一', () => {
    const foreign = {
      ...VALID,
      nationalId: '',
      passportNumber: 'AB1234567'
    };

    it('只有護照也算完整', () => {
      expect(patientIdentityIssues(foreign, NOW)).toEqual([]);
    });

    it('兩個都給不算錯——櫃台核對雙證件時就會兩個都有', () => {
      expect(
        patientIdentityIssues({ ...VALID, passportNumber: 'AB1234567' }, NOW)
      ).toEqual([]);
    });

    it('護照格式刻意寬鬆，但空白與符號仍然擋下來', () => {
      expect(
        patientIdentityIssues({ ...foreign, passportNumber: 'A1' }, NOW)
      ).toEqual([{ field: 'passportNumber', code: 'format' }]);
      expect(
        patientIdentityIssues({ ...foreign, passportNumber: 'AB 123 456' }, NOW)
      ).toEqual([{ field: 'passportNumber', code: 'format' }]);
    });
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

  it('沒有身分證字號時改用護照，優先序在電話生日之前', () => {
    expect(
      patientIdentityKey({
        passportNumber: 'ab1234567',
        phone: '0912345678',
        birthDate: '1990-05-20'
      })
    ).toBe('passport:AB1234567');
  });

  it('兩種證件都沒有時退回電話與生日的組合', () => {
    expect(
      patientIdentityKey({ phone: '0912345678', birthDate: '1990-05-20' })
    ).toBe('contact:0912345678|1990-05-20');
  });

  it('不同的人不會共用同一個鍵', () => {
    expect(patientIdentityKey({ nationalId: 'A123456789' })).not.toBe(
      patientIdentityKey({ nationalId: 'B123456789' })
    );
  });

  // 這是年份改為選填之後最危險的一個後果：同住的家人共用一支電話，而同月同日生
  // 並不罕見。兩件事湊在一起，先前的鍵會把兩個人合併成一個人——症狀是其中一位
  // 被系統告知「您已有一筆未完成的預約」，而他自己根本沒約過。
  it('沒有年份時，同電話同月日的兩個人不得被合併', () => {
    const shared = { phone: '0912345678', birthDate: '--05-20' };
    expect(patientIdentityKey({ ...shared, name: '王小明' })).not.toBe(
      patientIdentityKey({ ...shared, name: '王大明' })
    );
  });

  it('沒有年份時，同一個人重複填寫仍然是同一個鍵', () => {
    const person = {
      phone: '0912345678',
      birthDate: '--05-20',
      name: '王小明'
    };
    expect(patientIdentityKey(person)).toBe(patientIdentityKey({ ...person }));
  });

  it('有年份時維持原本的鍵，不因為新規則而改變既有比對結果', () => {
    expect(
      patientIdentityKey({
        phone: '0912345678',
        birthDate: '1990-05-20',
        name: '王小明'
      })
    ).toBe('contact:0912345678|1990-05-20');
  });
});

describe('maskIdentityDocument', () => {
  it('有身分證就遮身分證', () => {
    expect(maskIdentityDocument({ nationalId: 'A123456789' })).toBe(
      'A12****789'
    );
  });

  // 外籍患者在清單上不該顯示破折號——那看起來像資料缺漏，而不是換了一種證件。
  it('沒有身分證時改遮護照', () => {
    expect(
      maskIdentityDocument({ nationalId: '', passportNumber: 'AB1234567' })
    ).toBe('AB1****567');
  });

  it('兩個都沒有時才是破折號', () => {
    expect(maskIdentityDocument({})).toBe('——');
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

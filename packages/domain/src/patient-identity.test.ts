import { describe, expect, it } from 'vitest';

import { DomainError } from './errors.js';
import {
  maskIdentityDocument,
  maskNationalId,
  normalisePatientIdentity,
  patientIdentityIssues,
  patientIdentityKey,
  patientPhoneDigits,
  resolveIntakeCandidate,
  resolveReturnCandidate
} from './patient-identity.js';

const VALID = {
  name: '測試甲',
  phone: '0912-000-901',
  birthDate: '--05-20',
  nationality: 'domestic'
} as const;

describe('patientIdentityIssues', () => {
  it('接受一組完整且格式正確的新預約資料', () => {
    expect(patientIdentityIssues(VALID)).toEqual([]);
  });

  it('空白與缺漏都回 required，而不是 format', () => {
    expect(
      patientIdentityIssues({
        name: '  ',
        phone: '',
        birthDate: undefined,
        nationality: ''
      })
    ).toEqual([
      { field: 'name', code: 'required' },
      { field: 'phone', code: 'required' },
      { field: 'birthDate', code: 'required' },
      { field: 'nationality', code: 'required' }
    ]);
  });

  it('生日只收月日，帶年份的完整日期一律是 format', () => {
    expect(
      patientIdentityIssues({ ...VALID, birthDate: '1990-05-20' })
    ).toEqual([{ field: 'birthDate', code: 'format' }]);
    expect(patientIdentityIssues({ ...VALID, birthDate: '05-20' })).toEqual([
      { field: 'birthDate', code: 'format' }
    ]);
  });

  it('2 月 29 日是有效的月日', () => {
    expect(patientIdentityIssues({ ...VALID, birthDate: '--02-29' })).toEqual(
      []
    );
  });

  it('不存在的月日回 not_a_calendar_date', () => {
    for (const birthDate of ['--02-30', '--13-01', '--00-10', '--04-31']) {
      expect(patientIdentityIssues({ ...VALID, birthDate })).toEqual([
        { field: 'birthDate', code: 'not_a_calendar_date' }
      ]);
    }
  });

  it('國籍只有本國與外國兩種', () => {
    expect(
      patientIdentityIssues({ ...VALID, nationality: 'foreign' })
    ).toEqual([]);
    expect(
      patientIdentityIssues({ ...VALID, nationality: 'foreign_national' })
    ).toEqual([{ field: 'nationality', code: 'format' }]);
  });

  it('不再要求身分證或護照', () => {
    const issues = patientIdentityIssues(VALID);
    expect(issues.map((issue) => issue.field)).not.toContain('identityDocument');
  });

  it('姓名以字元數計算，不因表情符號的編碼長度誤判', () => {
    const thirty = '測'.repeat(29) + '😀';
    expect(patientIdentityIssues({ ...VALID, name: thirty })).toEqual([]);
    expect(patientIdentityIssues({ ...VALID, name: `${thirty}測` })).toEqual([
      { field: 'name', code: 'format' }
    ]);
  });
});

describe('normalisePatientIdentity', () => {
  it('只回傳新預約會收的四個欄位，並去掉前後空白', () => {
    expect(
      normalisePatientIdentity({
        name: ' 測試甲 ',
        phone: ' 0912-000-901 ',
        birthDate: ' --05-20 ',
        nationality: 'foreign'
      })
    ).toEqual({
      name: '測試甲',
      phone: '0912-000-901',
      birthDate: '--05-20',
      nationality: 'foreign'
    });
  });

  it('以 DomainError 回報第一個問題的欄位與原因', () => {
    expect(() =>
      normalisePatientIdentity({ ...VALID, birthDate: '1990-05-20' })
    ).toThrow(DomainError);
    expect(() =>
      normalisePatientIdentity({ ...VALID, birthDate: '1990-05-20' })
    ).toThrow(/birthDate \(format\)/);
  });

  it('錯誤訊息不得回填輸入值', () => {
    const phone = '0912-ABC';
    try {
      normalisePatientIdentity({ ...VALID, phone });
      expect.unreachable();
    } catch (error) {
      expect(String((error as Error).message)).not.toContain(phone);
    }
  });
});

describe('patientPhoneDigits', () => {
  it('只留下數字，讓不同的電話寫法對到同一個人', () => {
    expect(patientPhoneDigits('0912-000-901')).toBe('0912000901');
    expect(patientPhoneDigits('(0912) 000 901')).toBe('0912000901');
  });
});

describe('patientIdentityKey', () => {
  it('由電話數字與月日組成，姓名不參與', () => {
    expect(patientIdentityKey(VALID)).toBe('contact:0912000901|--05-20');
    expect(patientIdentityKey({ ...VALID, name: '測試乙' })).toBe(
      patientIdentityKey(VALID)
    );
  });

  it('電話寫法不同仍是同一個鍵', () => {
    expect(patientIdentityKey({ ...VALID, phone: '0912000901' })).toBe(
      patientIdentityKey(VALID)
    );
  });
});

describe('resolveIntakeCandidate', () => {
  it('沒有候選時建立新病患', () => {
    expect(resolveIntakeCandidate([], '測試甲')).toEqual({ kind: 'create' });
  });

  it('唯一候選且姓名相同時沿用', () => {
    expect(
      resolveIntakeCandidate(
        [{ patientId: 'patient_syn_001', name: '測試甲' }],
        ' 測試甲 '
      )
    ).toEqual({ kind: 'reuse', patientId: 'patient_syn_001' });
  });

  it('唯一候選但姓名不同時是衝突，不能合併', () => {
    expect(
      resolveIntakeCandidate(
        [{ patientId: 'patient_syn_001', name: '測試甲' }],
        '測試乙'
      )
    ).toEqual({ kind: 'ambiguous' });
  });

  it('多個候選時一律衝突，姓名不能拿來挑人', () => {
    expect(
      resolveIntakeCandidate(
        [
          { patientId: 'patient_syn_001', name: '測試甲' },
          { patientId: 'patient_syn_002', name: '測試乙' }
        ],
        '測試甲'
      )
    ).toEqual({ kind: 'ambiguous' });
  });

  it('姓名比對忽略全形半形與大小寫差異', () => {
    expect(
      resolveIntakeCandidate(
        [{ patientId: 'patient_syn_001', name: 'Test　A' }],
        'test a'
      )
    ).toEqual({ kind: 'reuse', patientId: 'patient_syn_001' });
  });
});

describe('resolveReturnCandidate', () => {
  it('只有唯一候選時回傳病患', () => {
    expect(resolveReturnCandidate(['patient_syn_001'])).toBe('patient_syn_001');
  });

  it('沒有或多個候選都當作查無', () => {
    expect(resolveReturnCandidate([])).toBeUndefined();
    expect(
      resolveReturnCandidate(['patient_syn_001', 'patient_syn_002'])
    ).toBeUndefined();
  });
});

describe('maskIdentityDocument（只用於顯示舊紀錄）', () => {
  it('有身分證就遮身分證', () => {
    expect(maskIdentityDocument({ nationalId: 'A123456789' })).toBe(
      'A12****789'
    );
  });

  it('沒有身分證時改遮護照', () => {
    expect(maskIdentityDocument({ passportNumber: 'SYNTH0001' })).toBe(
      'SYN****001'
    );
  });

  it('兩個都沒有時是破折號', () => {
    expect(maskIdentityDocument({})).toBe('——');
  });
});

describe('maskNationalId（只用於顯示舊紀錄）', () => {
  it('只露出前三碼與後三碼', () => {
    expect(maskNationalId('A123456789')).toBe('A12****789');
  });

  it('長度不足或不是字串時回破折號，不回半截號碼', () => {
    expect(maskNationalId('A123')).toBe('——');
    expect(maskNationalId(undefined)).toBe('——');
  });
});

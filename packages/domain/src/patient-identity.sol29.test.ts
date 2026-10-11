import { describe, expect, it } from 'vitest';
import {
  isPatientBirthMonthDay,
  maskNationalId,
  patientIdentityIssues,
  patientIdentityKey
} from './patient-identity.js';
const BASE = {
  name: 'opaque_fixture',
  phone: '0000000000',
  birthDate: '--02-29',
  nationality: 'domestic'
};
describe('canonical identity and bounded legacy disclosure', () => {
  it.each(['++++++++', '--------', '( ) ( ) ', '0000----'])(
    'denies no matching canonical phone %s',
    (phone) => {
      expect(patientIdentityIssues({ ...BASE, phone })).toContainEqual({
        field: 'phone',
        code: 'format'
      });
    }
  );
  it.each(['00000000', '+000 000 0000', '(000)000-0000'])(
    'keeps valid phone %s',
    (phone) => {
      expect(patientIdentityIssues({ ...BASE, phone })).toEqual([]);
    }
  );
  it('keeps normalization-equivalent keys stable', () => {
    expect(patientIdentityKey({ ...BASE, phone: '(000)000-0000' })).toBe(
      patientIdentityKey(BASE)
    );
  });
  it.each(['--02-30', '--04-31', '--00-01', '--13-01', '2000-02-29'])(
    'denies invalid or yearful month-day %s',
    (value) => {
      expect(isPatientBirthMonthDay(value)).toBe(false);
    }
  );
  it('keeps leap-day', () => {
    expect(isPatientBirthMonthDay('--02-29')).toBe(true);
  });
  it.each(Array.from({ length: 9 }, (_, i) => i + 1))(
    'never reconstructs short legacy value %s',
    (length) => {
      const value = 'ABCDEFGHI'.slice(0, length);
      expect(maskNationalId(value).replace(/\*/g, '')).not.toBe(value);
    }
  );
  it('keeps valid-length masking', () => {
    expect(maskNationalId('ABCDEFGHIJ')).toBe('ABC****HIJ');
  });
});

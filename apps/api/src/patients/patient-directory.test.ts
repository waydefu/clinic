import { describe, expect, it } from 'vitest';

import {
  InMemoryPatientDirectory,
  opaqueLookupIdentity
} from './patient-directory.js';

const INTAKE = {
  name: '合成患者甲',
  phone: '0912-000-001',
  birthDate: '1990-01-15',
  nationalId: 'A123456789',
  privacyConsent: true as const
};

describe('opaque lookup identity', () => {
  it('is stable across phone punctuation and is not the raw phone number', () => {
    expect(opaqueLookupIdentity('0912-000-001', '1990-01-15')).toBe(
      opaqueLookupIdentity('0912000001', '1990-01-15')
    );
    expect(opaqueLookupIdentity('0912000001', '1990-01-15')).not.toMatch(
      /0912/
    );
  });
});

describe('InMemoryPatientDirectory', () => {
  it('reuses a patient and withholds lookup unless follow-up is entitled', async () => {
    const directory = new InMemoryPatientDirectory();
    const first = await directory.resolveFromIntake(
      INTAKE,
      '2026-07-23T14:30:00.000Z',
      () => 'patient_001'
    );
    const second = await directory.resolveFromIntake(
      INTAKE,
      '2026-07-23T14:30:00.000Z',
      () => 'patient_002'
    );
    expect(first).toBe('patient_001');
    expect(second).toBe('patient_001');
    expect(directory.createdPatientCount).toBe(1);
    await expect(
      directory.lookupReturn(
        '0912000001',
        '1990-01-15',
        '2026-07-23T14:30:00.000Z',
        () => 'session'
      )
    ).resolves.toBeUndefined();
    directory.followUp.set('patient_001', { required: true });
    await expect(
      directory.lookupReturn(
        '0912000001',
        '1990-01-15',
        '2026-07-23T14:30:00.000Z',
        () => 'session'
      )
    ).resolves.toMatchObject({ outcome: 'schedule', patientId: 'patient_001' });
  });
});

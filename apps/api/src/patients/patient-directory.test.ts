import { describe, expect, it } from 'vitest';

import { DomainError } from '@beauessence/domain';

import {
  assertFollowUpBookable,
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
    directory.followUp.set('patient_001', {
      required: false,
      activeFollowUpAppointmentId: 'appointment_follow_stale'
    });
    await expect(
      directory.lookupReturn(
        '0912000001',
        '1990-01-15',
        '2026-07-23T14:30:00.000Z',
        () => 'session'
      )
    ).resolves.toBeUndefined();
  });

  it('returns existing when an active follow-up appointment is already reserved', async () => {
    const directory = new InMemoryPatientDirectory();
    await directory.resolveFromIntake(
      INTAKE,
      '2026-07-23T14:30:00.000Z',
      () => 'patient_001'
    );
    directory.followUp.set('patient_001', {
      required: true,
      activeFollowUpAppointmentId: 'appointment_follow_001'
    });
    directory.appointments.push({
      appointmentId: 'appointment_follow_001',
      patientId: 'patient_001',
      slotId: 'slot_follow_001',
      bookingKind: 'follow_up',
      status: 'confirmed',
      startsAt: '2026-08-01T04:15:00.000Z'
    });
    await expect(
      directory.lookupReturn(
        '0912000001',
        '1990-01-15',
        '2026-07-23T14:30:00.000Z',
        () => 'session'
      )
    ).resolves.toMatchObject({
      outcome: 'existing',
      appointmentId: 'appointment_follow_001',
      startsAt: '2026-08-01T04:15:00.000Z'
    });
  });
});

describe('assertFollowUpBookable', () => {
  const codeOf = (run: () => unknown): string => {
    try {
      run();
    } catch (error) {
      return error instanceof DomainError ? error.code : 'NOT_A_DOMAIN_ERROR';
    }
    return 'NO_ERROR';
  };

  it('allows follow_up only for required and unscheduled entitlement', () => {
    expect(
      codeOf(() => assertFollowUpBookable({ required: true }, 'follow_up'))
    ).toBe('NO_ERROR');
    expect(codeOf(() => assertFollowUpBookable(undefined, 'initial'))).toBe(
      'NO_ERROR'
    );
    expect(codeOf(() => assertFollowUpBookable(undefined, 'follow_up'))).toBe(
      'FOLLOW_UP_NOT_ENTITLED'
    );
    expect(
      codeOf(() =>
        assertFollowUpBookable(
          {
            required: true,
            activeFollowUpAppointmentId: 'appointment_follow_001'
          },
          'follow_up'
        )
      )
    ).toBe('FOLLOW_UP_ALREADY_SCHEDULED');
  });
});

import type { Firestore } from 'firebase-admin/firestore';
import { describe, expect, it, vi } from 'vitest';

import { DomainError } from '@beauessence/domain';

import {
  assertFollowUpBookable,
  FirestorePatientDirectory,
  InMemoryPatientDirectory,
  opaqueLookupIdentity,
  PATIENT_COLLECTIONS,
  toListRecord
} from './patient-directory.js';

const INTAKE = {
  name: '合成患者甲',
  phone: '0900-000-001',
  birthDate: '--01-15',
  nationality: 'domestic' as const,
  privacyConsent: true as const
};

describe.each(['firestore', 'memory'] as const)(
  'return lookup UTC admission (%s)',
  (adapter) => {
    const NOW = '2028-02-29T00:00:00.123456789Z';
    const invalidTimes = [
      '2026-02-30T00:00:00Z',
      '2026-01-01T24:00:00Z',
      '2026-01-01T00:00:00',
      '2026-01-01T08:00:00+08:00',
      'Jan 1 2026 GMT'
    ];

    function setup(
      startsAt = NOW,
      status: 'confirmed' | 'cancelled' = 'confirmed'
    ) {
      const appointment = {
        appointmentId: 'synthetic_appointment',
        patientId: 'synthetic_patient',
        slotId: 'synthetic_slot',
        bookingKind: 'follow_up' as const,
        status,
        startsAt
      };
      const followUp = {
        required: true,
        activeFollowUpAppointmentId: appointment.appointmentId
      };
      const allocateId = vi.fn(() => 'synthetic_session');
      if (adapter === 'memory') {
        const directory = new InMemoryPatientDirectory();
        directory.lookup.set(
          opaqueLookupIdentity(INTAKE.phone, INTAKE.birthDate),
          [appointment.patientId]
        );
        directory.patients.set(appointment.patientId, { name: INTAKE.name });
        directory.followUp.set(appointment.patientId, followUp);
        directory.appointments.push(appointment);
        return {
          directory,
          allocateId,
          reads: vi.spyOn(directory.lookup, 'get'),
          sessionCount: () => directory.sessions.size,
          writeData: () => directory.sessions.get('rs_synthetic_session')
        };
      }
      const values = new Map<string, Record<string, unknown>>([
        [
          PATIENT_COLLECTIONS.lookupIndex,
          { patientIds: [appointment.patientId] }
        ],
        [PATIENT_COLLECTIONS.patients, { name: INTAKE.name }],
        [PATIENT_COLLECTIONS.followUpState, followUp],
        ['appointments', appointment]
      ]);
      const writes: Record<string, unknown>[] = [];
      const collection = vi.fn((name: string) => ({
        doc: vi.fn(() => ({
          get: () =>
            Promise.resolve({
              exists: values.has(name),
              data: () => values.get(name)
            }),
          create: (data: Record<string, unknown>) => {
            writes.push(data);
            return Promise.resolve();
          }
        }))
      }));
      return {
        directory: new FirestorePatientDirectory({
          collection
        } as unknown as Firestore),
        allocateId,
        reads: collection,
        sessionCount: () => writes.length,
        writeData: () => writes[0]
      };
    }

    it.each(invalidTimes)(
      'rejects clock %s before patient access',
      async (now) => {
        const fixture = setup();
        await expect(
          fixture.directory.lookupReturn(
            INTAKE.phone,
            INTAKE.birthDate,
            now,
            fixture.allocateId
          )
        ).rejects.toBeInstanceOf(DomainError);
        expect(fixture.reads).not.toHaveBeenCalled();
        expect(fixture.allocateId).not.toHaveBeenCalled();
        expect(fixture.sessionCount()).toBe(0);
      }
    );

    it.each(invalidTimes)(
      'rejects stored startsAt %s before session creation',
      async (startsAt) => {
        const fixture = setup(startsAt);
        await expect(
          fixture.directory.lookupReturn(
            INTAKE.phone,
            INTAKE.birthDate,
            NOW,
            fixture.allocateId
          )
        ).rejects.toBeInstanceOf(DomainError);
        expect(fixture.allocateId).not.toHaveBeenCalled();
        expect(fixture.sessionCount()).toBe(0);
      }
    );

    it('does not leave a session behind when stored time cannot be parsed', async () => {
      const fixture = setup('not-a-time');
      await expect(
        fixture.directory.lookupReturn(
          INTAKE.phone,
          INTAKE.birthDate,
          NOW,
          fixture.allocateId
        )
      ).rejects.toThrow();
      expect(fixture.sessionCount()).toBe(0);
      expect(fixture.allocateId).not.toHaveBeenCalled();
    });

    it.each(['2028-02-29T00:00:00Z', '2028-02-29T00:00:00.123Z', NOW])(
      'preserves valid UTC precision %s and existing durations',
      async (now) => {
        const fixture = setup(now);
        const result = await fixture.directory.lookupReturn(
          INTAKE.phone,
          INTAKE.birthDate,
          now,
          fixture.allocateId
        );
        expect(result).toEqual({
          sessionId: 'rs_synthetic_session',
          expiresAt: new Date(Date.parse(now) + 15 * 60_000).toISOString(),
          outcome: 'existing',
          appointmentId: 'synthetic_appointment',
          startsAt: now,
          endsAt: new Date(Date.parse(now) + 30 * 60_000).toISOString(),
          patientId: 'synthetic_patient'
        });
        expect(fixture.allocateId).toHaveBeenCalledOnce();
        expect(fixture.sessionCount()).toBe(1);
        expect(fixture.writeData()).toMatchObject({
          patientId: 'synthetic_patient',
          expiresAt: result?.expiresAt
        });
        if (adapter === 'firestore')
          expect(fixture.writeData()).toHaveProperty('createdAt', now);
      }
    );

    it.each([
      ['short', INTAKE.birthDate],
      [INTAKE.phone, '1990-01-15']
    ])('preserves identifier denial for %s / %s', async (phone, birthDate) => {
      const fixture = setup();
      await expect(
        fixture.directory.lookupReturn(
          phone,
          birthDate,
          'not-a-time',
          fixture.allocateId
        )
      ).resolves.toBeUndefined();
      expect(fixture.reads).not.toHaveBeenCalled();
      expect(fixture.allocateId).not.toHaveBeenCalled();
      expect(fixture.sessionCount()).toBe(0);
    });

    it('keeps a cancelled follow-up on the scheduling path', async () => {
      const fixture = setup('not-a-time', 'cancelled');
      const result = await fixture.directory.lookupReturn(
        INTAKE.phone,
        INTAKE.birthDate,
        NOW,
        fixture.allocateId
      );
      expect(result).toMatchObject({
        outcome: 'schedule',
        patientId: 'synthetic_patient'
      });
      expect(result).not.toHaveProperty('startsAt');
      expect(fixture.sessionCount()).toBe(1);
    });
  }
);

describe('opaque lookup identity', () => {
  it('is stable across phone punctuation and is not the raw phone number', () => {
    expect(opaqueLookupIdentity('0900000001', '--01-15')).toBe(
      'rlk2_419cef9b92f07cec89263a4bda9dfa10'
    );
    expect(opaqueLookupIdentity('0900-000-001', '--01-15')).toBe(
      opaqueLookupIdentity('0900000001', '--01-15')
    );
    expect(opaqueLookupIdentity('0900000001', '--01-15')).not.toMatch(/0900/);
  });
});

describe('phone + month-day identity (BOOKING-MINIMIZATION-2026-09-22)', () => {
  const NOW = '2026-09-28T04:00:00.000Z';

  it('refuses a different name on the same phone and month-day instead of merging', async () => {
    const directory = new InMemoryPatientDirectory();
    await directory.resolveFromIntake(INTAKE, NOW, () => 'patient_001');
    await expect(
      directory.resolveFromIntake(
        { ...INTAKE, name: '合成患者乙' },
        NOW,
        () => 'patient_002'
      )
    ).rejects.toMatchObject({ code: 'PATIENT_IDENTITY_AMBIGUOUS' });
    expect(directory.createdPatientCount).toBe(1);
  });

  it('refuses when the index already holds more than one candidate, whatever the name', async () => {
    const directory = new InMemoryPatientDirectory();
    const key = opaqueLookupIdentity(INTAKE.phone, INTAKE.birthDate);
    directory.lookup.set(key, ['patient_001', 'patient_002']);
    directory.patients.set('patient_001', { name: INTAKE.name });
    directory.patients.set('patient_002', { name: '合成患者乙' });
    await expect(
      directory.resolveFromIntake(INTAKE, NOW, () => 'patient_003')
    ).rejects.toMatchObject({ code: 'PATIENT_IDENTITY_AMBIGUOUS' });
  });

  it('ignores archived candidates and preserves their IDs when creating a replacement', async () => {
    const directory = new InMemoryPatientDirectory();
    const key = opaqueLookupIdentity(INTAKE.phone, INTAKE.birthDate);
    directory.lookup.set(key, ['patient_archived']);
    directory.patients.set('patient_archived', {
      name: INTAKE.name,
      archivedAt: '2030-10-01T00:00:00.000Z'
    });

    await expect(
      directory.resolveFromIntake(INTAKE, NOW, () => 'patient_replacement')
    ).resolves.toBe('patient_replacement');
    expect(directory.lookup.get(key)).toEqual([
      'patient_archived',
      'patient_replacement'
    ]);
  });

  it('answers a return lookup with several candidates exactly like a miss', async () => {
    const directory = new InMemoryPatientDirectory();
    const key = opaqueLookupIdentity(INTAKE.phone, INTAKE.birthDate);
    directory.lookup.set(key, ['patient_001', 'patient_002']);
    directory.followUp.set('patient_001', { required: true });
    directory.followUp.set('patient_002', { required: true });
    await expect(
      directory.lookupReturn('0900000001', '--01-15', NOW, () => 'session')
    ).resolves.toBeUndefined();
    expect(directory.sessions.size).toBe(0);
  });

  it('treats a full birth date as a miss rather than parsing a year', async () => {
    const directory = new InMemoryPatientDirectory();
    await directory.resolveFromIntake(INTAKE, NOW, () => 'patient_001');
    directory.followUp.set('patient_001', { required: true });
    await expect(
      directory.lookupReturn('0900000001', '1990-01-15', NOW, () => 'session')
    ).resolves.toBeUndefined();
  });

  it('rejects an intake that still carries a year', async () => {
    const directory = new InMemoryPatientDirectory();
    await expect(
      directory.resolveFromIntake(
        { ...INTAKE, birthDate: '1990-01-15' },
        NOW,
        () => 'patient_001'
      )
    ).rejects.toBeInstanceOf(DomainError);
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
        '0900000001',
        '--01-15',
        '2026-07-23T14:30:00.000Z',
        () => 'session'
      )
    ).resolves.toBeUndefined();
    directory.followUp.set('patient_001', { required: true });
    await expect(
      directory.lookupReturn(
        '0900000001',
        '--01-15',
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
        '0900000001',
        '--01-15',
        '2026-07-23T14:30:00.000Z',
        () => 'session'
      )
    ).resolves.toBeUndefined();
  });

  it('does not resolve or continue a return session for an archived patient', async () => {
    const directory = new InMemoryPatientDirectory();
    await directory.resolveFromIntake(
      INTAKE,
      '2026-07-23T14:30:00.000Z',
      () => 'patient_001'
    );
    directory.followUp.set('patient_001', { required: true });
    directory.patients.set('patient_001', {
      ...directory.patients.get('patient_001')!,
      archivedAt: '2030-10-01T00:00:00.000Z'
    });
    directory.sessions.set('session_ret_archived', {
      patientId: 'patient_001',
      expiresAt: '2030-10-20T00:15:00.000Z'
    });

    await expect(
      directory.lookupReturn(
        '0900000001',
        '--01-15',
        '2030-10-20T00:00:00.000Z',
        () => 'unused'
      )
    ).resolves.toBeUndefined();
    await expect(
      directory.readReturnSession(
        'session_ret_archived',
        '2030-10-20T00:00:00.000Z'
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
        '0900000001',
        '--01-15',
        '2026-07-23T14:30:00.000Z',
        () => 'session'
      )
    ).resolves.toMatchObject({
      outcome: 'existing',
      appointmentId: 'appointment_follow_001',
      startsAt: '2026-08-01T04:15:00.000Z'
    });
  });

  it.each(['cancelled', 'no_show'] as const)(
    'offers scheduling again when the active follow-up is %s',
    async (status) => {
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
        status,
        startsAt: '2026-08-01T04:15:00.000Z'
      });
      const result = await directory.lookupReturn(
        '0900000001',
        '--01-15',
        '2026-07-23T14:30:00.000Z',
        () => 'session'
      );
      expect(result?.outcome).toBe('schedule');
      expect(result).not.toHaveProperty('appointmentId');
    }
  );
});

// ADR-0007：清單把國籍帶給工作臺，但只放行兩個核准值。
describe('toListRecord intake nationality', () => {
  const row = {
    patientId: 'patient_001',
    slotId: 'slot_001',
    bookingKind: 'initial',
    status: 'confirmed',
    startsAt: '2026-09-29T04:00:00.000Z'
  };

  it('passes an approved stored value through', () => {
    expect(
      toListRecord('appointment_001', { ...row, intakeNationality: 'foreign' })
    ).toMatchObject({ intakeNationality: 'foreign' });
  });

  it('drops a missing or unapproved value instead of echoing it', () => {
    for (const data of [row, { ...row, intakeNationality: 'martian' }])
      expect(toListRecord('appointment_001', data)).not.toHaveProperty(
        'intakeNationality'
      );
  });
});

describe('toListRecord booking note', () => {
  const row = {
    patientId: 'patient_001',
    slotId: 'slot_001',
    bookingKind: 'initial',
    status: 'confirmed'
  };

  it('passes a stored note of at most 120 characters', () => {
    expect(
      toListRecord('appointment_001', { ...row, patientNote: '合成備註' })
        .patientNote
    ).toBe('合成備註');
  });

  it('drops an empty, oversized or non-string note', () => {
    for (const patientNote of ['', '甲'.repeat(121), 42])
      expect(
        'patientNote' in
          toListRecord('appointment_001', { ...row, patientNote })
      ).toBe(false);
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

describe('patient contact storage (EXPORT-CONTACT-STORAGE-2026-09-29)', () => {
  const NOW = '2026-09-29T04:00:00.000Z';

  it('stores phone digits and month-day on a new patient, never a year', async () => {
    const directory = new InMemoryPatientDirectory();
    await directory.resolveFromIntake(INTAKE, NOW, () => 'patient_c01');
    expect(directory.patients.get('patient_c01')).toEqual({
      name: '合成患者甲',
      phoneDigits: '0900000001',
      birthMonthDay: '--01-15'
    });
  });

  it('fills contact on reuse only when it is missing', async () => {
    const directory = new InMemoryPatientDirectory();
    directory.lookup.set(opaqueLookupIdentity('0900000001', '--01-15'), [
      'patient_legacy'
    ]);
    directory.patients.set('patient_legacy', { name: '合成患者甲' });
    await directory.resolveFromIntake(INTAKE, NOW, () => 'unused');
    expect(directory.patients.get('patient_legacy')).toEqual({
      name: '合成患者甲',
      phoneDigits: '0900000001',
      birthMonthDay: '--01-15'
    });
  });

  it('never overwrites contact already stored', async () => {
    const directory = new InMemoryPatientDirectory();
    await directory.resolveFromIntake(INTAKE, NOW, () => 'patient_c02');
    const stored = directory.patients.get('patient_c02');
    directory.patients.set('patient_c02', {
      ...stored!,
      phoneDigits: '0900000999'
    });
    await directory.resolveFromIntake(INTAKE, NOW, () => 'unused');
    expect(directory.patients.get('patient_c02')?.phoneDigits).toBe(
      '0900000999'
    );
  });

  it('stores nothing when the intake is refused as ambiguous', async () => {
    const directory = new InMemoryPatientDirectory();
    await directory.resolveFromIntake(INTAKE, NOW, () => 'patient_c03');
    await expect(
      directory.resolveFromIntake(
        { ...INTAKE, name: '合成患者乙' },
        NOW,
        () => 'patient_c04'
      )
    ).rejects.toBeInstanceOf(DomainError);
    expect(directory.patients.has('patient_c04')).toBe(false);
  });
});

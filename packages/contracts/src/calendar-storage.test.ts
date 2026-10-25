import { describe, expect, it } from 'vitest';

import {
  CalendarPilotAppointmentRecordSchema,
  CalendarPilotCandidateRecordSchema,
  CalendarPilotConfigurationRecordSchema,
  CalendarPilotMirrorRecordSchema,
  CalendarPilotSourceRecordSchema,
  parseCalendarPilotRecord
} from './calendar-storage.js';
import { CalendarSourcePreflightResponseSchema } from './calendar-sync.js';

const now = '2030-01-02T00:00:00.000Z';
const configuration = {
  activeSourceId: 'synthetic_source',
  version: 1,
  expiresAt: now,
  health: 'healthy',
  lastSuccessfulSyncAt: null,
  nextScheduledSyncAt: null,
  inboundEnabled: true,
  outboundEnabled: true,
  workerLeaseOwner: 'synthetic_worker'
};
const source = {
  displayName: 'Synthetic source',
  enabled: true,
  syncToken: null,
  lastSyncedAt: now
};
const mirror = {
  mirrorId: 'synthetic_mirror',
  sourceId: 'synthetic_source',
  externalEventId: 'synthetic_event',
  etag: 'synthetic_etag',
  externalStatus: 'confirmed',
  sourceVersion: 1,
  parsed: {
    ok: true,
    kind: 'appointment',
    patientCode: 'A01',
    bookingKind: 'initial',
    serviceId: 'service_snoring',
    displayLabel: 'Synthetic appointment',
    startsAt: now,
    endsAt: '2030-01-02T00:30:00.000Z'
  },
  localDirty: false,
  updatedAt: now
};
const preflight = {
  preflightId: 'synthetic_preflight',
  sourceId: 'synthetic_source',
  expectedVersion: 1,
  status: 'passed',
  readable: true,
  writable: true,
  scannedEvents: 1,
  validEvents: 1,
  invalidEvents: 0,
  completedAt: now,
  expiresAt: '2030-01-02T00:15:00.000Z'
};

const cases = [
  {
    name: 'configuration',
    schema: CalendarPilotConfigurationRecordSchema,
    value: configuration,
    invalid: [
      { ...configuration, expiresAt: 'Jul 25 2026 Z' },
      { ...configuration, inboundEnabled: 'true' },
      { ...configuration, version: -1 },
      { ...configuration, version: 1.5 },
      { ...configuration, health: 'unknown' }
    ]
  },
  {
    name: 'source',
    schema: CalendarPilotSourceRecordSchema,
    value: source,
    invalid: [
      { ...source, displayName: {} },
      { ...source, enabled: 'true' },
      { ...source, lastSyncedAt: '2030-02-30T00:00:00Z' },
      { ...source, syncToken: 12 }
    ]
  },
  {
    name: 'mirror',
    schema: CalendarPilotMirrorRecordSchema,
    value: mirror,
    invalid: [
      { ...mirror, sourceVersion: -1 },
      { ...mirror, externalStatus: 'unknown' },
      { ...mirror, parsed: { ok: true } },
      { ...mirror, parsed: { ok: false, errors: ['unknown'] } },
      { ...mirror, parsed: { ...mirror.parsed, patientCode: 'unknown' } },
      {
        ...mirror,
        parsed: { ...mirror.parsed, startsAt: '2030-01-02T24:00:00Z' }
      }
    ]
  },
  {
    name: 'preflight',
    schema: CalendarSourcePreflightResponseSchema,
    value: preflight,
    invalid: [
      { ...preflight, expectedVersion: -1 },
      { ...preflight, status: 'unknown' },
      { ...preflight, readable: 'true' },
      { ...preflight, scannedEvents: -1 },
      { ...preflight, expiresAt: '2030-01-02T00:00:00+08:00' }
    ]
  }
];

describe.each(cases)('stored $name', ({ schema, value, invalid }) => {
  it('accepts the existing unversioned writer shape without mutating it', () => {
    const original = structuredClone(value);
    expect(parseCalendarPilotRecord<unknown>(schema, value)).toEqual(value);
    expect(value).toEqual(original);
    expect(value).not.toHaveProperty('schemaVersion');
  });

  it.each([null, [], 'synthetic', undefined])('rejects %s', (value) => {
    expect(() => parseCalendarPilotRecord<unknown>(schema, value)).toThrow(
      'Unreadable CAL-PILOT record.'
    );
  });

  it.each(invalid)('rejects malformed existing fields', (value) => {
    expect(() => parseCalendarPilotRecord<unknown>(schema, value)).toThrow(
      'Unreadable CAL-PILOT record.'
    );
  });

  it('rejects an unrecognised data version without inventing a migration', () => {
    expect(() =>
      parseCalendarPilotRecord<unknown>(schema, { ...value, schemaVersion: 2 })
    ).toThrow('Unreadable CAL-PILOT record.');
  });

  it('does not include a rejected value in its error', () => {
    try {
      parseCalendarPilotRecord<unknown>(schema, {
        privateValue: 'synthetic_private_value'
      });
      expect.unreachable();
    } catch (error) {
      expect(String(error)).toBe('Error: Unreadable CAL-PILOT record.');
    }
  });
});

it('validates stored candidate and appointment fields before use', () => {
  const appointment = {
    appointmentId: 'synthetic_appointment',
    patientCode: 'A01',
    bookingKind: 'initial',
    serviceId: 'service_snoring',
    startsAt: now,
    endsAt: '2030-01-02T00:30:00Z',
    status: 'confirmed',
    version: 1
  };
  expect(
    parseCalendarPilotRecord(CalendarPilotAppointmentRecordSchema, appointment)
  ).toEqual(appointment);
  expect(() =>
    parseCalendarPilotRecord(CalendarPilotAppointmentRecordSchema, {
      ...appointment,
      version: 0
    })
  ).toThrow('Unreadable CAL-PILOT record.');
  const candidate = {
    candidateId: 'synthetic_candidate',
    mirrorId: mirror.mirrorId,
    sourceId: mirror.sourceId,
    expectedEtag: mirror.etag,
    kind: 'create_appointment',
    status: 'pending',
    displayLabel: mirror.parsed.displayLabel,
    startsAt: mirror.parsed.startsAt,
    endsAt: mirror.parsed.endsAt,
    sourceVersion: 1,
    expectedVersion: 0,
    validationErrors: [],
    createdAt: now,
    before: null,
    parsed: mirror.parsed
  };
  expect(
    parseCalendarPilotRecord(CalendarPilotCandidateRecordSchema, candidate)
  ).toEqual(candidate);
  expect(() =>
    parseCalendarPilotRecord(CalendarPilotCandidateRecordSchema, {
      ...candidate,
      parsed: { ok: true }
    })
  ).toThrow('Unreadable CAL-PILOT record.');
});

it('retains the existing configuration lease fields without changing them', () => {
  expect(
    parseCalendarPilotRecord(
      CalendarPilotConfigurationRecordSchema,
      configuration
    )
  ).toEqual(configuration);
});

it('accepts a stored invalid-format mirror for the existing review queue', () => {
  const invalidFormat = {
    ...mirror,
    parsed: { ok: false, errors: ['title_missing'] }
  };
  expect(
    parseCalendarPilotRecord(CalendarPilotMirrorRecordSchema, invalidFormat)
  ).toEqual(invalidFormat);
});

import { describe, expect, it } from 'vitest';

import {
  CalendarPilotAppointmentIdentityRecordSchema,
  CalendarPilotAppointmentRecordSchema,
  CalendarPilotAvailabilityOverlapRecordSchema,
  CalendarPilotAvailabilityRecordSchema,
  CalendarPilotCandidateRecordSchema,
  CalendarPilotEnabledRecordSchema,
  CalendarPilotGuardRecordSchema,
  CalendarPilotHealthRecordSchema,
  CalendarPilotJobSelectionRecordSchema,
  CalendarPilotRuntimeAppointmentRecordSchema,
  CalendarPilotRuntimeJobRecordSchema,
  CalendarPilotConfigurationRecordSchema,
  CalendarPilotMirrorRecordSchema,
  CalendarPilotMirrorReviewRecordSchema,
  CalendarPilotSourceRecordSchema,
  CalendarPilotSourceSummaryRecordSchema,
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

it('does not treat source metadata as an allowlist permission', () => {
  const metadata = { displayName: source.displayName };
  expect(
    parseCalendarPilotRecord(CalendarPilotSourceSummaryRecordSchema, metadata)
  ).toEqual(metadata);
  expect(() =>
    parseCalendarPilotRecord(CalendarPilotSourceRecordSchema, metadata)
  ).toThrow('Unreadable CAL-PILOT record.');
});

it('keeps omitted sync clocks distinct from malformed clocks', () => {
  const value = {
    activeSourceId: configuration.activeSourceId,
    version: configuration.version,
    expiresAt: configuration.expiresAt,
    health: configuration.health,
    inboundEnabled: configuration.inboundEnabled,
    outboundEnabled: configuration.outboundEnabled
  };
  expect(
    parseCalendarPilotRecord(CalendarPilotConfigurationRecordSchema, value)
  ).toEqual(value);
  expect(() =>
    parseCalendarPilotRecord(CalendarPilotConfigurationRecordSchema, {
      ...value,
      lastSuccessfulSyncAt: 'Jul 25 2026 Z'
    })
  ).toThrow('Unreadable CAL-PILOT record.');
});

it('validates consumed mirror fields without requiring worker metadata', () => {
  const partial = {
    externalEventId: mirror.externalEventId,
    etag: mirror.etag,
    parsed: mirror.parsed,
    linkId: 'synthetic_appointment'
  };
  expect(
    parseCalendarPilotRecord(CalendarPilotMirrorReviewRecordSchema, partial)
  ).toEqual(partial);
  expect(() =>
    parseCalendarPilotRecord(CalendarPilotMirrorRecordSchema, partial)
  ).toThrow('Unreadable CAL-PILOT record.');
  expect(() =>
    parseCalendarPilotRecord(CalendarPilotMirrorReviewRecordSchema, {
      ...partial,
      etag: 12
    })
  ).toThrow('Unreadable CAL-PILOT record.');
  expect(() =>
    parseCalendarPilotRecord(CalendarPilotMirrorReviewRecordSchema, {
      ...partial,
      parsed: { ok: true }
    })
  ).toThrow('Unreadable CAL-PILOT record.');
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

it.each([
  {
    ok: true,
    kind: 'busy',
    busyReason: 'meeting',
    displayLabel: 'Synthetic meeting',
    startsAt: now,
    endsAt: '2030-01-02T00:30:00Z'
  },
  {
    ok: true,
    kind: 'busy',
    busyReason: 'leave',
    displayLabel: 'Synthetic all-day leave',
    startsAt: '2030-01-01T16:00:00Z',
    endsAt: '2030-01-02T16:00:00Z',
    allDay: true,
    startDate: '2030-01-02',
    endDate: '2030-01-03'
  }
])('accepts the existing timed and all-day busy shapes', (parsed) => {
  const value = { ...mirror, parsed };
  expect(
    parseCalendarPilotRecord(CalendarPilotMirrorRecordSchema, value)
  ).toEqual(value);
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

const readBoundaryCases = [
  {
    name: 'enabled permission',
    schema: CalendarPilotEnabledRecordSchema,
    value: { enabled: true },
    invalid: { enabled: 'true' }
  },
  {
    name: 'guard',
    schema: CalendarPilotGuardRecordSchema,
    value: { recordId: null },
    invalid: { recordId: 12 }
  },
  {
    name: 'appointment identity',
    schema: CalendarPilotAppointmentIdentityRecordSchema,
    value: { patientCode: 'A01', version: 0 },
    invalid: { patientCode: 'unknown' }
  },
  {
    name: 'availability overlap',
    schema: CalendarPilotAvailabilityOverlapRecordSchema,
    value: { endsAt: now },
    invalid: { endsAt: '2030-02-30T00:00:00Z' }
  },
  {
    name: 'availability',
    schema: CalendarPilotAvailabilityRecordSchema,
    value: {
      kind: 'busy',
      bookingKind: null,
      startsAt: now,
      endsAt: now,
      displayLabel: 'Synthetic busy'
    },
    invalid: { kind: 'unknown' }
  },
  {
    name: 'runtime appointment',
    schema: CalendarPilotRuntimeAppointmentRecordSchema,
    value: mirror.parsed,
    invalid: { ...mirror.parsed, startsAt: 'Jan 2 2030 Z' }
  },
  {
    name: 'health',
    schema: CalendarPilotHealthRecordSchema,
    value: {
      health: 'healthy',
      expiresAt: now,
      inboundEnabled: true,
      outboundEnabled: true
    },
    invalid: { health: 'unknown' }
  },
  {
    name: 'job selection',
    schema: CalendarPilotJobSelectionRecordSchema,
    value: { status: 'pending', nextAttemptAt: null },
    invalid: { status: 'unknown' }
  },
  {
    name: 'runtime job',
    schema: CalendarPilotRuntimeJobRecordSchema,
    value: {
      kind: 'calendar_projection_delete',
      status: 'pending',
      generation: 0,
      attemptCount: 0,
      localRecordId: 'synthetic_record'
    },
    invalid: { kind: 'unknown', status: 'pending' }
  }
];

describe.each(readBoundaryCases)(
  'consumed $name fields',
  ({ schema, value, invalid }) => {
    it('accepts the existing writer shape without modifying it', () => {
      const before = structuredClone(value);
      expect(parseCalendarPilotRecord<unknown>(schema, value)).toEqual(value);
      expect(value).toEqual(before);
    });

    it.each([null, [], 'synthetic', undefined])(
      'rejects a non-record %s',
      (value) => {
        expect(() => parseCalendarPilotRecord<unknown>(schema, value)).toThrow(
          'Unreadable CAL-PILOT record.'
        );
      }
    );

    it('rejects malformed fields and an unknown version with a fixed error', () => {
      for (const record of [invalid, { ...value, schemaVersion: 2 }])
        expect(() => parseCalendarPilotRecord<unknown>(schema, record)).toThrow(
          'Unreadable CAL-PILOT record.'
        );
    });
  }
);

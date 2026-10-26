import type { DocumentSnapshot, Firestore } from 'firebase-admin/firestore';
import { describe, expect, it, vi } from 'vitest';

import {
  assertExpectedMirrorEtag,
  CalendarPilotRuntime,
  claimCalendarPilotJobs,
  C1_SYNTHETIC_CALENDAR_SOURCE_ID,
  calendarWriteEventForConfirmedAppointment,
  calendarWriteEventForMirror,
  resolveCalendarPilotRuntimeConfiguration
} from './calendar-pilot-runtime.js';

describe('calendar pilot canonical runtime clock', () => {
  const environment = {
    CALENDAR_PILOT_RUNTIME_MODE: 'C1_SYNTHETIC_ADC',
    GOOGLE_CLOUD_PROJECT: 'beauessence-clinic-stg-c1a01',
    CALENDAR_PILOT_PSEUDONYM_KEY: 'p'.repeat(32),
    GOOGLE_CALENDAR_AUTH: 'CLOUD_ADC',
    GOOGLE_CALENDAR_ID: 'synthetic-calendar-id'
  };
  function setup() {
    const query = {
      doc: vi.fn(() => ({})),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      get: vi.fn(() => Promise.resolve({ docs: [] }))
    };
    const collection = vi.fn(() => query);
    const runTransaction = vi.fn(() => Promise.resolve(undefined));
    const db = { collection, runTransaction } as unknown as Firestore;
    return { db, collection, runTransaction };
  }

  it.each([
    '2026-02-30T00:00:00Z',
    '2026-02-29T00:00:00Z',
    '2026-01-01T24:00:00Z',
    '2026-01-01T00:00:00',
    '2026-01-01T08:00:00+08:00',
    'Jan 1 2026 GMT'
  ])(
    'rejects noncanonical clock %s before lease or job access',
    async (now) => {
      const { db, collection, runTransaction } = setup();
      const runtime = new CalendarPilotRuntime(db, environment, () => now);
      await expect(runtime.run()).rejects.toThrow(/lease/iu);
      await expect(
        claimCalendarPilotJobs(db, 'synthetic_worker', now)
      ).rejects.toThrow(/lease/iu);
      expect(collection).not.toHaveBeenCalled();
      expect(runTransaction).not.toHaveBeenCalled();
    }
  );

  it.each(['2028-02-29T00:00:00Z', '2028-02-29T00:00:00.123456Z'])(
    'keeps valid leap-day UTC precision %s',
    async (now) => {
      const { db, collection, runTransaction } = setup();
      const runtime = new CalendarPilotRuntime(db, environment, () => now);
      await expect(runtime.run()).resolves.toEqual({
        acquired: false,
        processedJobs: 0,
        failedJobs: 0
      });
      await expect(
        claimCalendarPilotJobs(db, 'synthetic_worker', now)
      ).resolves.toEqual([]);
      expect(collection).toHaveBeenCalledWith('calendar_pilot_configuration');
      expect(collection).toHaveBeenCalledWith('calendar_pilot_outbox');
      expect(runTransaction).toHaveBeenCalledOnce();
    }
  );
});

function jobDocument(id: string, row: unknown): DocumentSnapshot {
  const ref = { id };
  return {
    id,
    ref,
    exists: true,
    data: () => row
  } as unknown as DocumentSnapshot;
}

function setupJobClaim(
  candidates: {
    readonly processing: readonly DocumentSnapshot[];
    readonly pending: readonly DocumentSnapshot[];
  },
  authoritativeRows: Readonly<Record<string, unknown>>
) {
  let queryIndex = 0;
  const collection = vi.fn(() => {
    const query = {
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      get: vi.fn(() =>
        Promise.resolve({
          docs: candidates[queryIndex++ === 0 ? 'processing' : 'pending']
        })
      )
    };
    return query;
  });
  const update = vi.fn();
  const runTransaction = vi.fn((callback: (transaction: never) => unknown) =>
    Promise.resolve(
      callback({
        get: vi.fn((ref: { readonly id: string }) => {
          const row = authoritativeRows[ref.id];
          return Promise.resolve({
            exists: row !== undefined,
            ref,
            data: () => row
          });
        }),
        update
      } as never)
    )
  );
  const db = { collection, runTransaction } as unknown as Firestore;
  return { db, update, runTransaction };
}

describe('calendar pilot job UTC admission', () => {
  const owner = 'synthetic_worker';

  it.each([
    {
      name: 'claims an expired processing lease',
      leaseExpiresAt: '2025-12-31T23:59:59.000Z',
      expectedClaimCount: 1
    },
    {
      name: 'does not claim a lease renewed by the transaction read',
      leaseExpiresAt: '2026-01-01T00:00:01.000Z',
      expectedClaimCount: 0
    },
    {
      name: 'rejects a noncanonical transaction lease at the schema',
      leaseExpiresAt: '2026-01-01T08:00:00+08:00',
      expectedClaimCount: undefined
    }
  ])(
    '$name',
    async ({
      leaseExpiresAt,
      expectedClaimCount
    }: {
      leaseExpiresAt: string;
      expectedClaimCount: number | undefined;
    }) => {
      const now = '2026-01-01T00:00:00.000Z';
      const queryRow = {
        kind: 'calendar_projection_delete',
        status: 'processing',
        leaseOwner: 'previous_worker',
        leaseExpiresAt: '2025-12-31T23:59:59.000Z'
      };
      const candidate = jobDocument('processing_job', queryRow);
      const currentRow = { ...queryRow, leaseExpiresAt };
      const { db, update } = setupJobClaim(
        { processing: [candidate], pending: [] },
        { processing_job: currentRow }
      );

      if (expectedClaimCount === undefined)
        await expect(claimCalendarPilotJobs(db, owner, now)).rejects.toThrow(
          'Unreadable CAL-PILOT record.'
        );
      else
        expect(await claimCalendarPilotJobs(db, owner, now)).toHaveLength(
          expectedClaimCount
        );
      expect(update).toHaveBeenCalledTimes(expectedClaimCount ?? 0);
    }
  );

  it.each([
    {
      name: 'claims a due timestamp',
      nextAttemptAt: '2025-12-31T23:59:59.000Z',
      includeNextAttemptAt: true,
      expectedClaimCount: 1
    },
    {
      name: 'skips a future timestamp',
      nextAttemptAt: '2026-01-01T00:00:01.000Z',
      includeNextAttemptAt: true,
      expectedClaimCount: 0
    },
    {
      name: 'claims null backoff',
      nextAttemptAt: null,
      includeNextAttemptAt: true,
      expectedClaimCount: 1
    },
    {
      name: 'claims missing backoff',
      nextAttemptAt: undefined,
      includeNextAttemptAt: false,
      expectedClaimCount: 1
    },
    {
      name: 'skips an impossible date',
      nextAttemptAt: '2026-02-30T00:00:00Z',
      includeNextAttemptAt: true,
      expectedClaimCount: 0
    },
    {
      name: 'skips an offset timestamp',
      nextAttemptAt: '2026-01-01T08:00:00+08:00',
      includeNextAttemptAt: true,
      expectedClaimCount: 0
    },
    {
      name: 'skips a legacy date string',
      nextAttemptAt: 'Jan 1 2026 GMT',
      includeNextAttemptAt: true,
      expectedClaimCount: 0
    }
  ])(
    '$name without updating a rejected candidate',
    async ({
      nextAttemptAt,
      includeNextAttemptAt,
      expectedClaimCount
    }: {
      nextAttemptAt: string | null | undefined;
      includeNextAttemptAt: boolean;
      expectedClaimCount: number;
    }) => {
      const row = {
        kind: 'calendar_projection_delete',
        status: 'pending',
        ...(includeNextAttemptAt ? { nextAttemptAt } : {})
      };
      const candidate = jobDocument('pending_job', row);
      const { db, update } = setupJobClaim(
        { processing: [], pending: [candidate] },
        { pending_job: row }
      );

      expect(
        await claimCalendarPilotJobs(db, owner, '2026-01-01T00:00:00.000Z')
      ).toHaveLength(expectedClaimCount);
      expect(update).toHaveBeenCalledTimes(expectedClaimCount);
    }
  );

  it.each([
    {
      name: 'future backoff',
      nextAttemptAt: '2026-01-01T00:00:01.000Z'
    },
    { name: 'malformed backoff', nextAttemptAt: 'Jan 1 2026 GMT' }
  ])(
    'rechecks a due query snapshot against a transaction with $name',
    async ({ nextAttemptAt }: { nextAttemptAt: string }) => {
      const queryRow = {
        kind: 'calendar_projection_delete',
        status: 'pending',
        nextAttemptAt: '2025-12-31T23:59:59.000Z'
      };
      const candidate = jobDocument('pending_job', queryRow);
      const { db, update, runTransaction } = setupJobClaim(
        { processing: [], pending: [candidate] },
        {
          pending_job: {
            ...queryRow,
            nextAttemptAt
          }
        }
      );

      await expect(
        claimCalendarPilotJobs(db, owner, '2026-01-01T00:00:00.000Z')
      ).resolves.toEqual([]);
      expect(runTransaction).toHaveBeenCalledOnce();
      expect(update).not.toHaveBeenCalled();
    }
  );

  it('writes the established lease shape for a real leap-day candidate', async () => {
    const now = '2028-02-29T23:58:59.987654321Z';
    const row = {
      kind: 'calendar_projection_delete',
      status: 'pending',
      nextAttemptAt: '2028-02-29T23:58:59.000Z'
    };
    const candidate = jobDocument('pending_job', row);
    const { db, update } = setupJobClaim(
      { processing: [], pending: [candidate] },
      { pending_job: row }
    );

    expect(await claimCalendarPilotJobs(db, owner, now)).toHaveLength(1);
    expect(update).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith(candidate.ref, {
      status: 'processing',
      leaseOwner: owner,
      leaseExpiresAt: '2028-03-01T00:02:59.987Z'
    });
  });
});

describe('calendar pilot runtime configuration', () => {
  const pseudonymKey = 'p'.repeat(32);

  it('uses one synthetic Calendar through keyless ADC in C1', () => {
    expect(
      resolveCalendarPilotRuntimeConfiguration({
        CALENDAR_PILOT_RUNTIME_MODE: 'C1_SYNTHETIC_ADC',
        GOOGLE_CLOUD_PROJECT: 'beauessence-clinic-stg-c1a01',
        CALENDAR_PILOT_PSEUDONYM_KEY: pseudonymKey,
        GOOGLE_CALENDAR_AUTH: 'CLOUD_ADC',
        GOOGLE_CALENDAR_ID: 'synthetic-calendar-id'
      })
    ).toEqual({
      auth: 'cloud_adc',
      pseudonymKey,
      sources: {
        [C1_SYNTHETIC_CALENDAR_SOURCE_ID]: {
          calendarId: 'synthetic-calendar-id'
        }
      }
    });
  });

  it('refuses user-managed service-account credentials in C1', () => {
    expect(() =>
      resolveCalendarPilotRuntimeConfiguration({
        CALENDAR_PILOT_RUNTIME_MODE: 'C1_SYNTHETIC_ADC',
        GOOGLE_CLOUD_PROJECT: 'beauessence-clinic-stg-c1a01',
        CALENDAR_PILOT_PSEUDONYM_KEY: pseudonymKey,
        GOOGLE_CALENDAR_AUTH: 'CLOUD_ADC',
        GOOGLE_CALENDAR_ID: 'synthetic-calendar-id',
        GOOGLE_SERVICE_ACCOUNT_JSON: 'forbidden-secret'
      })
    ).toThrow(/forbids user-managed/u);
  });

  it('fails closed when the pseudonym key is missing or short', () => {
    expect(() =>
      resolveCalendarPilotRuntimeConfiguration({
        CALENDAR_PILOT_RUNTIME_MODE: 'C1_SYNTHETIC_ADC',
        GOOGLE_CLOUD_PROJECT: 'beauessence-clinic-stg-c1a01',
        CALENDAR_PILOT_PSEUDONYM_KEY: 'short',
        GOOGLE_CALENDAR_AUTH: 'CLOUD_ADC',
        GOOGLE_CALENDAR_ID: 'synthetic-calendar-id'
      })
    ).toThrow(/at least 32/u);
  });

  it('refuses C1 mode outside the isolated project and unknown modes', () => {
    expect(() =>
      resolveCalendarPilotRuntimeConfiguration({
        CALENDAR_PILOT_RUNTIME_MODE: 'C1_SYNTHETIC_ADC',
        CALENDAR_PILOT_PSEUDONYM_KEY: pseudonymKey,
        GOOGLE_CLOUD_PROJECT: 'beauessence-clinic-staging',
        GOOGLE_CALENDAR_AUTH: 'CLOUD_ADC',
        GOOGLE_CALENDAR_ID: 'synthetic-calendar-id'
      })
    ).toThrow(/isolated C1 project/u);
    expect(() =>
      resolveCalendarPilotRuntimeConfiguration({
        CALENDAR_PILOT_RUNTIME_MODE: 'unknown',
        CALENDAR_PILOT_PSEUDONYM_KEY: pseudonymKey
      })
    ).toThrow(/Unknown Calendar pilot runtime mode/u);
  });
});

describe('calendar projection restore', () => {
  it('restores the original event from the confirmed appointment source of truth', () => {
    const appointmentId = 'appointment_001';
    const mirror = {
      externalEventId: 'linked_external_event_77',
      etag: '"etag-001"',
      linkId: appointmentId,
      parsed: {
        ok: true as const,
        kind: 'appointment' as const,
        patientCode: 'A18',
        bookingKind: 'follow_up' as const,
        serviceId: 'service_aesthetic' as const,
        displayLabel: 'A18，複診，美學',
        startsAt: '2030-01-02T04:30:00.000Z',
        endsAt: '2030-01-02T05:00:00.000Z'
      }
    };

    expect(
      calendarWriteEventForConfirmedAppointment(
        mirror,
        {
          appointmentId,
          status: 'confirmed',
          patientCode: 'A17',
          bookingKind: 'initial',
          serviceId: 'service_snoring',
          startsAt: '2030-01-02T04:00:00.000Z',
          endsAt: '2030-01-02T04:30:00.000Z'
        },
        appointmentId
      )
    ).toEqual({
      eventId: 'linked_external_event_77',
      title: '[預約] A17｜初診｜止鼾',
      startsAt: '2030-01-02T04:00:00.000Z',
      endsAt: '2030-01-02T04:30:00.000Z',
      linkId: appointmentId
    });
  });

  it('fails closed when the SoT appointment is missing, cancelled, or linked elsewhere', () => {
    const appointmentId = 'appointment_001';
    const mirror = {
      externalEventId: 'linked_external_event_77',
      etag: '"etag-001"',
      linkId: appointmentId,
      parsed: {
        ok: true as const,
        kind: 'appointment' as const,
        patientCode: 'A17',
        bookingKind: 'initial' as const,
        serviceId: 'service_snoring' as const,
        displayLabel: 'A17，初診，止鼾',
        startsAt: '2030-01-02T04:30:00.000Z',
        endsAt: '2030-01-02T05:00:00.000Z'
      }
    };
    const confirmed = {
      appointmentId,
      status: 'confirmed',
      patientCode: 'A17',
      bookingKind: 'initial',
      serviceId: 'service_snoring',
      startsAt: '2030-01-02T04:00:00.000Z',
      endsAt: '2030-01-02T04:30:00.000Z'
    };

    expect(() =>
      calendarWriteEventForConfirmedAppointment(
        mirror,
        undefined,
        appointmentId
      )
    ).toThrow(/link is invalid/u);
    expect(() =>
      calendarWriteEventForConfirmedAppointment(
        mirror,
        { ...confirmed, status: 'cancelled' },
        appointmentId
      )
    ).toThrow(/missing or changed/u);
    expect(() =>
      calendarWriteEventForConfirmedAppointment(
        { ...mirror, linkId: 'another_appointment' },
        confirmed,
        appointmentId
      )
    ).toThrow(/link is invalid/u);
  });

  it('fails closed on mirror ETag drift before updating an existing event', () => {
    const mirror = {
      externalEventId: 'linked_external_event_77',
      etag: '"etag-002"',
      parsed: {
        ok: true as const,
        kind: 'appointment' as const,
        patientCode: 'A17',
        bookingKind: 'initial' as const,
        serviceId: 'service_snoring' as const,
        displayLabel: 'A17，初診，止鼾',
        startsAt: '2030-01-02T04:30:00.000Z',
        endsAt: '2030-01-02T05:00:00.000Z'
      }
    };
    expect(() => assertExpectedMirrorEtag(mirror, '"etag-001"')).toThrow(
      /version is stale/u
    );
    expect(() => assertExpectedMirrorEtag(mirror, undefined)).toThrow(
      /version is stale/u
    );
  });

  it('updates the original event and adds only the private opaque link', () => {
    expect(
      calendarWriteEventForMirror(
        {
          externalEventId: 'original_google_event',
          etag: '"etag-001"',
          linkId: 'projection_001',
          parsed: {
            ok: true,
            kind: 'appointment',
            patientCode: 'A17',
            bookingKind: 'initial',
            serviceId: 'service_snoring',
            displayLabel: 'A17，初診，止鼾',
            startsAt: '2026-09-02T06:00:00.000Z',
            endsAt: '2026-09-02T06:30:00.000Z'
          }
        },
        'fallback_link'
      )
    ).toEqual({
      eventId: 'original_google_event',
      title: '[預約] A17｜初診｜止鼾',
      startsAt: '2026-09-02T06:00:00.000Z',
      endsAt: '2026-09-02T06:30:00.000Z',
      linkId: 'projection_001'
    });
  });

  it('preserves all-day and cross-day busy metadata', () => {
    expect(
      calendarWriteEventForMirror(
        {
          externalEventId: 'original_busy_event',
          etag: '"etag-002"',
          parsed: {
            ok: true,
            kind: 'busy',
            busyReason: 'leave',
            displayLabel: '忙碌：休假',
            startsAt: '2026-09-01T16:00:00.000Z',
            endsAt: '2026-09-03T16:00:00.000Z',
            allDay: true,
            startDate: '2026-09-02',
            endDate: '2026-09-04'
          }
        },
        'mirror_001'
      )
    ).toEqual({
      eventId: 'original_busy_event',
      title: '[忙碌] 休假',
      allDay: true,
      startDate: '2026-09-02',
      endDate: '2026-09-04',
      linkId: 'mirror_001'
    });
  });
});

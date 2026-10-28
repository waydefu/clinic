import { CalendarAvailabilityResponseSchema } from '@beauessence/contracts';
import type { Firestore } from 'firebase-admin/firestore';
import { describe, expect, it, vi } from 'vitest';

import { FirestoreCalendarPilotRepository } from './calendar-pilot.repository.js';

function store(
  value: unknown,
  blocks: readonly unknown[] = [],
  documentIds: readonly string[] = []
) {
  const snapshot = { exists: value !== undefined, data: () => value };
  const query = {
    get: () =>
      Promise.resolve({
        docs: blocks.map((block, index) => ({
          id: documentIds[index] ?? `synthetic_block_${index}`,
          exists: true,
          data: () => block
        }))
      })
  };
  const collection = vi.fn((name: string) => ({
    doc: () => ({
      get: () =>
        Promise.resolve(
          name === 'calendar_pilot_sources' ? { exists: false } : snapshot
        )
    }),
    orderBy: () => ({ limit: () => query }),
    where: () => ({
      get: query.get,
      orderBy: () => ({ ...query, limit: () => query }),
      count: () => ({
        get: () => Promise.resolve({ data: () => ({ count: 0 }) })
      })
    })
  }));
  const runTransaction = vi.fn();
  const db = { collection, runTransaction } as unknown as Firestore;
  return {
    repository: new FirestoreCalendarPilotRepository(db),
    collection,
    runTransaction
  };
}

const configuration = {
  activeSourceId: 'synthetic_source',
  version: 1,
  expiresAt: '2030-01-03T00:00:00Z',
  health: 'healthy',
  lastSuccessfulSyncAt: null,
  nextScheduledSyncAt: null,
  inboundEnabled: true,
  outboundEnabled: true
};
const preflight = {
  preflightId: 'synthetic_preflight',
  sourceId: 'synthetic_source',
  expectedVersion: 1,
  status: 'passed',
  readable: true,
  writable: true,
  scannedEvents: 0,
  validEvents: 0,
  invalidEvents: 0,
  completedAt: '2030-01-02T00:00:00Z',
  expiresAt: '2030-01-02T00:15:00Z'
};

describe('CAL-PILOT API stored read boundary', () => {
  describe.each([
    {
      method: 'listSources',
      record: { displayName: 'Synthetic source' },
      malformedRecord: { displayName: 42 },
      expected: { displayName: 'Synthetic source' }
    },
    {
      method: 'listCandidates',
      record: {
        candidateId: 'synthetic_candidate',
        kind: 'create_block',
        status: 'pending',
        displayLabel: 'Synthetic busy',
        startsAt: '2030-01-02T00:00:00Z',
        endsAt: '2030-01-02T00:30:00Z',
        sourceVersion: 1,
        expectedVersion: 0,
        validationErrors: [],
        createdAt: '2030-01-02T00:00:00Z',
        before: null,
        mirrorId: 'synthetic_mirror',
        expectedEtag: 'synthetic_etag',
        sourceId: 'synthetic_source',
        parsed: {
          ok: true,
          kind: 'busy',
          busyReason: 'other',
          displayLabel: 'Synthetic busy',
          startsAt: '2030-01-02T00:00:00Z',
          endsAt: '2030-01-02T00:30:00Z'
        }
      },
      malformedRecord: {
        candidateId: 'synthetic_candidate',
        kind: 'unknown',
        status: 'pending',
        displayLabel: 'Synthetic busy',
        startsAt: '2030-01-02T00:00:00Z',
        endsAt: '2030-01-02T00:30:00Z',
        sourceVersion: 1,
        expectedVersion: 0,
        validationErrors: [],
        createdAt: '2030-01-02T00:00:00Z',
        before: null,
        mirrorId: 'synthetic_mirror',
        expectedEtag: 'synthetic_etag',
        sourceId: 'synthetic_source',
        parsed: {
          ok: true,
          kind: 'busy',
          busyReason: 'other',
          displayLabel: 'Synthetic busy',
          startsAt: '2030-01-02T00:00:00Z',
          endsAt: '2030-01-02T00:30:00Z'
        }
      },
      expected: { candidateId: 'synthetic_candidate', kind: 'create_block' }
    },
    {
      method: 'listSyntheticAppointments',
      record: {
        appointmentId: 'synthetic_appointment',
        patientCode: 'A17',
        bookingKind: 'initial',
        serviceId: 'service_snoring',
        startsAt: '2030-01-02T00:00:00Z',
        endsAt: '2030-01-02T00:30:00Z',
        displayLabel: 'Synthetic appointment',
        version: 1,
        status: 'confirmed',
        sourceId: 'synthetic_source',
        mirrorId: 'synthetic_mirror'
      },
      malformedRecord: { appointmentId: 42 },
      expected: { appointmentId: 'synthetic_appointment', patientCode: 'A17' }
    }
  ] as const)(
    '$method stored read codec',
    ({ method, record, malformedRecord, expected }) => {
      it('decodes valid records without changing them or transacting', async () => {
        const before = structuredClone(record);
        const { repository, runTransaction } = store(configuration, [record]);
        await expect(repository[method]()).resolves.toMatchObject([expected]);
        expect(record).toEqual(before);
        expect(runTransaction).not.toHaveBeenCalled();
      });

      it('does not forward uncontracted stored fields into public query results', async () => {
        const stored = { ...record, syntheticInternalOnly: 'synthetic marker' };
        const before = structuredClone(stored);
        const { repository, runTransaction } = store(configuration, [stored]);
        const result = await repository[method]();
        expect(result).toMatchObject([expected]);
        expect(result[0]).not.toHaveProperty('syntheticInternalOnly');
        expect(stored).toEqual(before);
        expect(runTransaction).not.toHaveBeenCalled();
      });

      it.each([1, 2])(
        'rejects schemaVersion %s without transacting',
        async (schemaVersion) => {
          const { repository, runTransaction } = store(configuration, [
            { ...record, schemaVersion }
          ]);
          await expect(repository[method]()).rejects.toThrow(
            'Unreadable CAL-PILOT record.'
          );
          expect(runTransaction).not.toHaveBeenCalled();
        }
      );

      it('rejects malformed records without transacting', async () => {
        const { repository, runTransaction } = store(configuration, [
          malformedRecord
        ]);
        await expect(repository[method]()).rejects.toThrow(
          'Unreadable CAL-PILOT record.'
        );
        expect(runTransaction).not.toHaveBeenCalled();
      });
    }
  );

  it('accepts the existing configuration and empty availability', async () => {
    const { repository, runTransaction } = store(configuration);
    await expect(
      repository.getAvailability('2030-01-02T00:00:00Z')
    ).resolves.toEqual({
      generatedAt: '2030-01-02T00:00:00Z',
      sourceVersion: 1,
      blocks: []
    });
    expect(runTransaction).not.toHaveBeenCalled();
  });

  it('accepts contract-valid synthetic patient codes without rewriting records', async () => {
    const patient = { enabled: true };
    const before = structuredClone(patient);
    const { repository, runTransaction } = store(undefined, [patient], ['A17']);
    await expect(repository.listSyntheticPatients()).resolves.toEqual([
      { patientCode: 'A17' }
    ]);
    expect(patient).toEqual(before);
    expect(runTransaction).not.toHaveBeenCalled();
  });

  it.each(['A00', 'A31', 'synthetic_patient'])(
    'refuses a patient document ID outside the existing summary contract: %s',
    async (patientCode) => {
      const patient = { enabled: true };
      const before = structuredClone(patient);
      const { repository, runTransaction } = store(
        undefined,
        [patient],
        [patientCode]
      );
      await expect(repository.listSyntheticPatients()).rejects.toThrow(
        'Unreadable CAL-PILOT record.'
      );
      expect(patient).toEqual(before);
      expect(runTransaction).not.toHaveBeenCalled();
    }
  );

  it('refuses an availability document ID outside the existing wire contract', async () => {
    const block = {
      kind: 'busy',
      startsAt: '2030-01-02T00:00:00Z',
      endsAt: '2030-01-02T00:30:00Z',
      displayLabel: 'Synthetic busy'
    };
    const before = structuredClone(block);
    const { repository, runTransaction } = store(
      configuration,
      [block],
      ['x'.repeat(256)]
    );
    await expect(
      repository.getAvailability('2030-01-02T00:00:00Z')
    ).rejects.toThrow('Unreadable CAL-PILOT record.');
    expect(block).toEqual(before);
    expect(runTransaction).not.toHaveBeenCalled();
  });

  it('accepts an existing availability block without rewriting it', async () => {
    const block = {
      kind: 'appointment',
      bookingKind: 'initial',
      startsAt: '2030-01-02T00:00:00Z',
      endsAt: '2030-01-02T00:30:00Z',
      displayLabel: 'Synthetic appointment',
      sourceVersion: 1
    };
    const before = structuredClone(block);
    const { repository, runTransaction } = store(configuration, [block]);
    const availability = await repository.getAvailability(block.startsAt);
    expect(
      CalendarAvailabilityResponseSchema.safeParse(availability).success
    ).toBe(true);
    expect(availability).toMatchObject({
      blocks: [
        {
          blockId: 'synthetic_block_0',
          kind: 'appointment',
          bookingKind: 'initial',
          startsAt: block.startsAt,
          endsAt: block.endsAt,
          displayLabel: block.displayLabel
        }
      ]
    });
    expect(block).toEqual(before);
    expect(runTransaction).not.toHaveBeenCalled();
  });

  it.each([
    {
      kind: 'busy',
      startsAt: '2030-01-02T00:00:00Z',
      endsAt: '2030-02-30T00:00:00Z',
      displayLabel: 'Synthetic busy'
    },
    {
      kind: 'unknown',
      startsAt: '2030-01-02T00:00:00Z',
      endsAt: '2030-01-02T00:30:00Z',
      displayLabel: 'Synthetic busy'
    },
    {
      kind: 'appointment',
      bookingKind: 'unknown',
      startsAt: '2030-01-02T00:00:00Z',
      endsAt: '2030-01-02T00:30:00Z',
      displayLabel: 'Synthetic appointment'
    },
    {
      kind: 'busy',
      startsAt: '2030-01-02T00:00:00Z',
      endsAt: '2030-01-02T00:30:00Z',
      displayLabel: 'Synthetic busy',
      schemaVersion: 2
    }
  ])(
    'refuses malformed availability rather than returning success',
    async (block) => {
      const { repository, runTransaction } = store(configuration, [block]);
      await expect(
        repository.getAvailability('2030-01-02T00:00:00Z')
      ).rejects.toThrow('Unreadable CAL-PILOT record.');
      expect(runTransaction).not.toHaveBeenCalled();
    }
  );

  it.each([
    null,
    [],
    { ...configuration, expiresAt: 'Jul 25 2026 Z' },
    { ...configuration, version: -1 },
    { ...configuration, inboundEnabled: 'true' },
    { ...configuration, schemaVersion: 2 }
  ])('refuses malformed configuration before further reads', async (value) => {
    const { repository, collection, runTransaction } = store(value);
    await expect(
      repository.getAvailability('2030-01-02T00:00:00Z')
    ).rejects.toThrow('Unreadable CAL-PILOT record.');
    expect(collection).toHaveBeenCalledTimes(1);
    expect(runTransaction).not.toHaveBeenCalled();
  });

  it('renders omitted sync clocks as null without a write', async () => {
    const legacy = {
      activeSourceId: configuration.activeSourceId,
      version: configuration.version,
      expiresAt: configuration.expiresAt,
      health: configuration.health,
      inboundEnabled: configuration.inboundEnabled,
      outboundEnabled: configuration.outboundEnabled
    };
    const { repository, runTransaction } = store(legacy);
    const result = await repository.getStatus('2030-01-02T00:00:00Z');
    expect(result.lastSuccessfulSyncAt).toBeNull();
    expect(result.nextScheduledSyncAt).toBeNull();
    expect(runTransaction).not.toHaveBeenCalled();
  });

  it('validates the existing preflight wire shape on read', async () => {
    await expect(
      store(preflight).repository.getSourcePreflight('synthetic_preflight')
    ).resolves.toEqual(preflight);
  });

  it.each([
    { ...preflight, status: 'unknown' },
    { ...preflight, writable: 'true' },
    { ...preflight, expectedVersion: -1 },
    { ...preflight, expiresAt: '2030-02-30T00:00:00Z' }
  ])('refuses malformed preflight instead of success', async (value) => {
    const { repository, runTransaction } = store(value);
    await expect(
      repository.getSourcePreflight('synthetic_preflight')
    ).rejects.toThrow('Unreadable CAL-PILOT record.');
    expect(runTransaction).not.toHaveBeenCalled();
  });
});

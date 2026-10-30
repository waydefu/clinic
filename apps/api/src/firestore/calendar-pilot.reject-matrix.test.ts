import { createHash } from 'node:crypto';

import type { Firestore } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';

import {
  ConflictError,
  ServiceUnavailableError
} from '../platform/errors/api-error.js';
import { FirestoreCalendarPilotRepository } from './calendar-pilot.repository.js';

// D-33: decision matrix for rejecting a CAL-PILOT candidate. The real
// repository runs against a small in-memory Firestore whose transaction
// buffers writes and commits them together, or not at all. Nothing here is a
// Firestore semantics test; the emulator suite in
// tests/firestore/calendar-candidate-review.test.ts covers the real database.

type Doc = Record<string, unknown>;
type Collections = Record<string, Record<string, Doc>>;
interface Write {
  readonly transaction: number | null;
  readonly operation: 'create' | 'set' | 'update';
  readonly path: string;
  readonly data: Doc;
}
interface Ref {
  readonly collection: string;
  readonly id: string;
}

class FakeFirestore {
  public readonly writes: Write[] = [];
  public transactions = 0;
  public constructor(public collections: Collections) {}

  public collection(collection: string) {
    return { doc: (id: string): Ref => ({ collection, id }) };
  }

  public put(collection: string, id: string, data: Doc): void {
    (this.collections[collection] ??= {})[id] = data;
  }

  public remove(collection: string, id: string): void {
    delete this.collections[collection]?.[id];
  }

  public snapshot(): Collections {
    return structuredClone(this.collections);
  }

  public async runTransaction<T>(
    body: (transaction: unknown) => Promise<T>
  ): Promise<T> {
    const id = ++this.transactions;
    const pending: Write[] = [];
    const exists = (ref: Ref) =>
      this.collections[ref.collection]?.[ref.id] !== undefined;
    const queue = (operation: Write['operation'], ref: Ref, data: Doc) => {
      if (operation === 'create' && exists(ref))
        throw new Error(`ALREADY_EXISTS ${ref.collection}/${ref.id}`);
      if (operation === 'update' && !exists(ref))
        throw new Error(`NOT_FOUND ${ref.collection}/${ref.id}`);
      pending.push({
        transaction: id,
        operation,
        path: `${ref.collection}/${ref.id}`,
        data: structuredClone(data)
      });
    };
    const transaction = {
      get: (ref: Ref) => {
        const data = this.collections[ref.collection]?.[ref.id];
        return Promise.resolve({
          id: ref.id,
          exists: data !== undefined,
          data: () => structuredClone(data)
        });
      },
      create: (ref: Ref, data: Doc) => queue('create', ref, data),
      set: (ref: Ref, data: Doc) => queue('set', ref, data),
      update: (ref: Ref, data: Doc) => queue('update', ref, data)
    };
    const result = await body(transaction);
    for (const write of pending) {
      const [collection = '', id = ''] = write.path.split('/');
      const bucket = (this.collections[collection] ??= {});
      bucket[id] =
        write.operation === 'update'
          ? { ...bucket[id], ...write.data }
          : structuredClone(write.data);
      this.writes.push(write);
    }
    return result;
  }
}

const NOW = '2026-09-24T03:00:00.000Z';
const SOURCE_ID = 'synthetic_source';
const CANDIDATE_ID = 'candidate_001';
const MIRROR_ID = 'mirror_001';
const APPOINTMENT_ID = 'appointment_001';
const ETAG = '"etag-001"';
const PARSED = {
  ok: true,
  kind: 'appointment',
  patientCode: 'A17',
  bookingKind: 'initial',
  serviceId: 'service_snoring',
  displayLabel: 'A17，初診，止鼾',
  startsAt: '2030-01-02T04:30:00.000Z',
  endsAt: '2030-01-02T05:00:00.000Z'
};
const CONFIGURATION = {
  activeSourceId: SOURCE_ID,
  version: 1,
  expiresAt: '2026-11-28T04:51:37Z',
  health: 'healthy',
  lastSuccessfulSyncAt: NOW,
  nextScheduledSyncAt: null,
  inboundEnabled: true,
  outboundEnabled: true
};
const UPDATE_CANDIDATE: Doc = {
  candidateId: CANDIDATE_ID,
  kind: 'update_appointment',
  status: 'pending',
  displayLabel: 'A17，初診，止鼾',
  startsAt: PARSED.startsAt,
  endsAt: PARSED.endsAt,
  sourceId: SOURCE_ID,
  sourceVersion: 1,
  expectedVersion: 1,
  validationErrors: [],
  createdAt: NOW,
  before: {
    kind: 'appointment',
    displayLabel: 'A17，初診，止鼾',
    startsAt: '2030-01-02T04:00:00.000Z',
    endsAt: '2030-01-02T04:30:00.000Z'
  },
  mirrorId: MIRROR_ID,
  expectedEtag: ETAG,
  parsed: PARSED,
  localRecordId: APPOINTMENT_ID
};
const APPOINTMENT: Doc = {
  appointmentId: APPOINTMENT_ID,
  patientCode: 'A17',
  bookingKind: 'initial',
  serviceId: 'service_snoring',
  startsAt: '2030-01-02T04:00:00.000Z',
  endsAt: '2030-01-02T04:30:00.000Z',
  status: 'confirmed',
  version: 1
};
const MIRROR: Doc = {
  sourceId: SOURCE_ID,
  externalEventId: 'linked_external_event_77',
  etag: ETAG,
  linkId: APPOINTMENT_ID,
  parsed: PARSED
};

function fixture(overrides: { candidate?: Doc; configuration?: Doc } = {}) {
  const collections: Collections = {
    calendar_pilot_configuration: {
      active: { ...CONFIGURATION, ...overrides.configuration }
    },
    calendar_pilot_candidates: {
      [CANDIDATE_ID]: { ...UPDATE_CANDIDATE, ...overrides.candidate }
    },
    calendar_pilot_appointments: { [APPOINTMENT_ID]: { ...APPOINTMENT } },
    calendar_pilot_mirrors: { [MIRROR_ID]: { ...MIRROR } }
  };
  const db = new FakeFirestore(collections);
  return {
    db,
    repository: new FirestoreCalendarPilotRepository(db as unknown as Firestore)
  };
}

// Restore jobs are keyed by candidate, so a retry can never queue a second one.
const jobId = (suffix: string) =>
  createHash('sha256')
    .update(`${CANDIDATE_ID}:${suffix}`)
    .digest('hex')
    .slice(0, 32);

let sequence = 0;
function command(overrides: Record<string, unknown> = {}) {
  sequence += 1;
  return {
    candidateId: CANDIDATE_ID,
    action: 'reject' as const,
    expectedVersion: 1,
    idempotencyKey: `candidate_reject_matrix_${sequence.toString().padStart(4, '0')}`,
    actorId: 'manager_001',
    actorRole: 'manager' as const,
    occurredAt: NOW,
    ...overrides
  };
}

describe('CAL-PILOT candidate reject decision matrix (D-33)', () => {
  describe('version guards', () => {
    it.each([0, 2])(
      'refuses expectedVersion %i against stored version 1 and writes nothing',
      async (expectedVersion) => {
        const { db, repository } = fixture();
        const before = db.snapshot();
        await expect(
          repository.reviewCandidate(command({ expectedVersion }))
        ).rejects.toBeInstanceOf(ConflictError);
        expect(db.snapshot()).toEqual(before);
        expect(db.writes).toEqual([]);
      }
    );

    it('refuses a candidate from an older source generation and writes nothing', async () => {
      const { db, repository } = fixture({ configuration: { version: 2 } });
      const before = db.snapshot();
      await expect(
        repository.reviewCandidate(command())
      ).rejects.toBeInstanceOf(ConflictError);
      expect(db.snapshot()).toEqual(before);
      expect(db.writes).toEqual([]);
    });

    it('refuses a missing candidate', async () => {
      const { db, repository } = fixture();
      await expect(
        repository.reviewCandidate(command({ candidateId: 'candidate_gone' }))
      ).rejects.toBeInstanceOf(ConflictError);
      expect(db.writes).toEqual([]);
    });
  });

  describe('candidate status', () => {
    it.each(['accepted', 'rejected', 'superseded'])(
      'refuses a fresh decision on a %s candidate',
      async (status) => {
        const { db, repository } = fixture({ candidate: { status } });
        const before = db.snapshot();
        await expect(
          repository.reviewCandidate(command())
        ).rejects.toBeInstanceOf(ConflictError);
        expect(db.snapshot()).toEqual(before);
      }
    );

    it.each(['pending', 'conflict', 'unmatched'])(
      'lets a %s candidate be rejected',
      async (status) => {
        const { db, repository } = fixture({
          candidate: { kind: 'create_block', status, localRecordId: undefined }
        });
        const response = await repository.reviewCandidate(command());
        expect(response.candidate.status).toBe('rejected');
        expect(db.writes.length).toBeGreaterThan(0);
      }
    );
  });

  describe('unmatched rule', () => {
    const unmatched = {
      kind: 'unmatched',
      status: 'unmatched',
      startsAt: null,
      endsAt: null,
      before: null,
      validationErrors: ['title_format_invalid'],
      parsed: { ok: false, errors: ['title_format_invalid'] },
      localRecordId: undefined
    };

    it.each(['accept', 'resolve_google', 'resolve_system'] as const)(
      'refuses %s on an unmatched event and writes nothing',
      async (action) => {
        const { db, repository } = fixture({ candidate: unmatched });
        const before = db.snapshot();
        await expect(
          repository.reviewCandidate(command({ action }))
        ).rejects.toBeInstanceOf(ConflictError);
        expect(db.snapshot()).toEqual(before);
        expect(db.writes).toEqual([]);
      }
    );

    it('treats the unmatched kind alone as unmatched, whatever the status says', async () => {
      const { db, repository } = fixture({
        candidate: { ...unmatched, status: 'pending' }
      });
      await expect(
        repository.reviewCandidate(command({ action: 'accept' }))
      ).rejects.toBeInstanceOf(ConflictError);
      expect(db.writes).toEqual([]);
    });

    it('rejects an unmatched event with audit and without a restore job', async () => {
      const { db, repository } = fixture({ candidate: unmatched });
      const response = await repository.reviewCandidate(command());
      expect(response.candidate.status).toBe('rejected');
      expect(db.collections['calendar_pilot_outbox']).toBeUndefined();
      expect(
        Object.values(db.collections['calendar_pilot_audit_events'] ?? {})
      ).toMatchObject([{ action: 'calendar_candidate_reject' }]);
    });
  });

  describe('legal reject keeps the source of truth', () => {
    it('queues an ETag guarded restore of the linked appointment, the audit event and the status change in one transaction', async () => {
      const { db, repository } = fixture();
      const request = command({
        actorId: 'front_001',
        actorRole: 'front_desk'
      });
      const response = await repository.reviewCandidate(request);

      expect(response.candidate).toMatchObject({
        candidateId: CANDIDATE_ID,
        kind: 'update_appointment',
        status: 'rejected',
        expectedVersion: 2
      });
      expect(response.projection).toBeNull();
      expect(db.transactions).toBe(1);
      expect(db.writes.map((write) => write.transaction)).toEqual([1, 1, 1, 1]);
      expect(db.writes.map((write) => write.operation).sort()).toEqual([
        'create',
        'create',
        'set',
        'update'
      ]);

      expect(
        Object.keys(db.collections['calendar_pilot_outbox'] ?? {})
      ).toEqual([jobId('reject-update-restore')]);
      const outbox = Object.values(
        db.collections['calendar_pilot_outbox'] ?? {}
      );
      expect(outbox).toEqual([
        {
          kind: 'calendar_projection_restore',
          writeMode: 'update_existing',
          restoreSource: 'confirmed_appointment',
          localRecordId: APPOINTMENT_ID,
          mirrorId: MIRROR_ID,
          expectedEtag: ETAG,
          generation: 1,
          status: 'pending',
          createdAt: NOW,
          attemptCount: 0
        }
      ]);
      expect(
        db.collections['calendar_pilot_candidates']?.[CANDIDATE_ID]
      ).toMatchObject({
        status: 'rejected',
        expectedVersion: 2,
        reviewedBy: 'front_001',
        reviewedAt: NOW
      });
      expect(
        Object.values(db.collections['calendar_pilot_audit_events'] ?? {})
      ).toEqual([
        {
          action: 'calendar_candidate_reject',
          actorId: 'front_001',
          actorRole: 'front_desk',
          candidateId: CANDIDATE_ID,
          occurredAt: NOW
        }
      ]);
      expect(
        Object.keys(db.collections['calendar_pilot_idempotency'] ?? {})
      ).toHaveLength(1);
      expect(
        db.collections['calendar_pilot_appointments']?.[APPOINTMENT_ID]
      ).toEqual(APPOINTMENT);
    });

    it('queues a recreate of the projected event when Google deleted a clinic appointment', async () => {
      const { db, repository } = fixture({
        candidate: { kind: 'cancel_appointment', localRecordId: undefined }
      });
      const response = await repository.reviewCandidate(command());
      expect(response.candidate.status).toBe('rejected');
      expect(db.transactions).toBe(1);
      expect(
        Object.keys(db.collections['calendar_pilot_outbox'] ?? {})
      ).toEqual([jobId('recreate')]);
      expect(
        Object.values(db.collections['calendar_pilot_outbox'] ?? {})
      ).toEqual([
        {
          kind: 'calendar_projection_restore',
          mirrorId: MIRROR_ID,
          generation: 1,
          status: 'pending',
          createdAt: NOW,
          attemptCount: 0
        }
      ]);
      expect(
        Object.values(db.collections['calendar_pilot_audit_events'] ?? {})
      ).toMatchObject([{ action: 'calendar_candidate_reject' }]);
    });

    it.each([
      'create_appointment',
      'create_block',
      'update_block',
      'release_block',
      'invalid_format',
      'conflict'
    ])(
      'rejects a %s candidate with audit and without a restore job',
      async (kind) => {
        const { db, repository } = fixture({
          candidate: { kind, localRecordId: undefined }
        });
        const response = await repository.reviewCandidate(command());
        expect(response.candidate.status).toBe('rejected');
        expect(db.collections['calendar_pilot_outbox']).toBeUndefined();
        expect(db.writes).toHaveLength(3);
        expect(
          Object.values(db.collections['calendar_pilot_audit_events'] ?? {})
        ).toMatchObject([
          { action: 'calendar_candidate_reject', candidateId: CANDIDATE_ID }
        ]);
      }
    );
  });

  describe('restore preconditions fail closed without partial writes', () => {
    const cases: readonly [
      string,
      (db: FakeFirestore) => void,
      { candidate?: Doc; configuration?: Doc }?
    ][] = [
      [
        'no linked appointment id on the candidate',
        () => undefined,
        { candidate: { localRecordId: undefined } }
      ],
      [
        'missing appointment',
        (db) => db.remove('calendar_pilot_appointments', APPOINTMENT_ID)
      ],
      [
        'cancelled appointment',
        (db) =>
          db.put('calendar_pilot_appointments', APPOINTMENT_ID, {
            ...APPOINTMENT,
            status: 'cancelled'
          })
      ],
      [
        'appointment record under another id',
        (db) =>
          db.put('calendar_pilot_appointments', APPOINTMENT_ID, {
            ...APPOINTMENT,
            appointmentId: 'another_appointment'
          })
      ],
      [
        'missing mirror',
        (db) => db.remove('calendar_pilot_mirrors', MIRROR_ID)
      ],
      [
        'mirror linked to another appointment',
        (db) =>
          db.put('calendar_pilot_mirrors', MIRROR_ID, {
            ...MIRROR,
            linkId: 'another_appointment'
          })
      ],
      [
        'mirror ETag moved on',
        (db) =>
          db.put('calendar_pilot_mirrors', MIRROR_ID, {
            ...MIRROR,
            etag: '"etag-002"'
          })
      ],
      [
        'mirror that is not an appointment',
        (db) =>
          db.put('calendar_pilot_mirrors', MIRROR_ID, {
            ...MIRROR,
            parsed: {
              ok: true,
              kind: 'busy',
              busyReason: 'other',
              displayLabel: '忙碌',
              startsAt: PARSED.startsAt,
              endsAt: PARSED.endsAt
            }
          })
      ],
      [
        'candidate from a source that is no longer active',
        (db) =>
          db.put('calendar_pilot_mirrors', MIRROR_ID, {
            ...MIRROR,
            sourceId: 'another_source'
          }),
        { candidate: { sourceId: 'another_source' } }
      ],
      [
        'mirror from another source than the candidate',
        (db) =>
          db.put('calendar_pilot_mirrors', MIRROR_ID, {
            ...MIRROR,
            sourceId: 'another_source'
          })
      ]
    ];

    it.each(cases)('%s', async (_label, mutate, overrides) => {
      const { db, repository } = fixture(overrides);
      mutate(db);
      const before = db.snapshot();
      await expect(
        repository.reviewCandidate(command())
      ).rejects.toBeInstanceOf(ConflictError);
      expect(db.snapshot()).toEqual(before);
      expect(db.writes).toEqual([]);
    });
  });

  describe('pilot state', () => {
    it.each([
      ['expired', { expiresAt: '2026-09-24T03:00:00Z' }],
      ['inbound switched off', { inboundEnabled: false }],
      ['outbound switched off', { outboundEnabled: false }]
    ])('refuses to decide while the pilot is %s', async (_label, overrides) => {
      const { db, repository } = fixture({ configuration: overrides });
      await expect(
        repository.reviewCandidate(command())
      ).rejects.toBeInstanceOf(ServiceUnavailableError);
      expect(db.writes).toEqual([]);
    });
  });

  describe('idempotency', () => {
    it('replays an exact retry without a second restore job or audit event', async () => {
      const { db, repository } = fixture();
      const request = command();
      const first = await repository.reviewCandidate(request);
      const writes = db.writes.length;
      const replay = await repository.reviewCandidate({
        ...request,
        occurredAt: '2026-09-24T03:01:00.000Z'
      });
      expect(replay).toEqual(first);
      expect(db.writes).toHaveLength(writes);
    });

    it('refuses the same key with a different request', async () => {
      const { db, repository } = fixture();
      const request = command();
      await repository.reviewCandidate(request);
      const writes = db.writes.length;
      await expect(
        repository.reviewCandidate({ ...request, expectedVersion: 2 })
      ).rejects.toBeInstanceOf(ConflictError);
      expect(db.writes).toHaveLength(writes);
    });
  });
});

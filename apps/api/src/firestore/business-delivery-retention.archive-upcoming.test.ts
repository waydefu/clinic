import { resolveApprovedBusinessDeliveryPolicy } from '@beauessence/domain';
import { describe, expect, it } from 'vitest';

import { ConflictError } from '../platform/errors/api-error.js';
import { FirestoreBusinessRetentionRepository } from './business-delivery-retention.repository.js';

// 封存前的「未來預約」守門：在任何寫入之前就以帶原因代碼的 409 拒絕。
const NOW = '2030-10-20T00:00:00.000Z';
const REACHED_FOLLOW_UPS = new Error('reached follow-up read');

function archiveWith(appointments: Array<Record<string, unknown>>) {
  const docs = appointments.map((data) => ({ data: () => data }));
  const ref = (name: string) => ({
    where: () => ({ name }),
    doc: () => ({ name })
  });
  const db = {
    collection: (name: string) => ref(name),
    runTransaction: (run: (tx: unknown) => Promise<unknown>) =>
      run({
        get: (target: { name: string }) => {
          if (target.name === 'appointments')
            return { docs, size: docs.length };
          if (target.name === 'follow_ups') throw REACHED_FOLLOW_UPS;
          if (target.name === 'patients')
            return {
              exists: true,
              data: () => ({ name: '王小明', phone: '0912345678' })
            };
          return { exists: false };
        }
      })
  };
  return new FirestoreBusinessRetentionRepository(db as never).archive({
    idempotencyKey: 'key_archive_1',
    patientId: 'patient_wang_1',
    actorRef: 'a'.repeat(64),
    now: NOW,
    scope: 'internal_synthetic',
    policy: resolveApprovedBusinessDeliveryPolicy(
      'BD-POLICY-2026-09-29',
      'internal_synthetic'
    )
  });
}

describe('patient archive with upcoming appointments', () => {
  it.each(['confirmed', 'arrived'])(
    'rejects a %s future appointment with the stable reason',
    async (status) => {
      const error = await archiveWith([
        { status, startsAt: '2030-10-21T02:00:00.000Z' }
      ]).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(ConflictError);
      expect((error as ConflictError).reason).toBe(
        'PATIENT_HAS_UPCOMING_APPOINTMENT'
      );
    }
  );

  it.each([
    ['cancelled', '2030-10-21T02:00:00.000Z'],
    ['confirmed', '2030-10-19T02:00:00.000Z'],
    ['completed', '2030-10-21T02:00:00.000Z']
  ])('does not block on a %s appointment at %s', async (status, startsAt) => {
    await expect(archiveWith([{ status, startsAt }])).rejects.toBe(
      REACHED_FOLLOW_UPS
    );
  });
});

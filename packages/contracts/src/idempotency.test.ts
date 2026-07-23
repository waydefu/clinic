import { describe, expect, it } from 'vitest';

import { IdempotencyRecordV1Schema } from './idempotency.js';

const HASH = 'a'.repeat(64);

const record = {
  actorId: 'actor_front_desk_001',
  scope: 'appointment:appointment_001:transition',
  requestHash: HASH,
  responseReference: {
    resourceType: 'appointment',
    resourceId: 'appointment_001'
  },
  recordedAt: '2026-07-23T14:30:00.000Z',
  schemaVersion: 1
} as const;

describe('IdempotencyRecordV1Schema', () => {
  it('accepts the privacy-minimised replay record', () => {
    expect(IdempotencyRecordV1Schema.parse(record)).toEqual(record);
  });

  it('rejects a non-SHA-256 request hash', () => {
    expect(() =>
      IdempotencyRecordV1Schema.parse({ ...record, requestHash: 'not-a-hash' })
    ).toThrow();
  });

  it('rejects legacy and raw-key fields', () => {
    expect(() =>
      IdempotencyRecordV1Schema.parse({
        ...record,
        key: 'booking_request_0001',
        appointmentId: 'appointment_001'
      })
    ).toThrow();
  });
});

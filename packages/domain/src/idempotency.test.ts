import { describe, expect, it } from 'vitest';

import { DomainError } from './errors.js';
import {
  assertIdempotencyContext,
  planIdempotencyRecord,
  resolveIdempotencyReplay,
  type IdempotencyContext
} from './idempotency.js';

const context: IdempotencyContext = {
  actorId: 'actor_front_desk_001',
  scope: 'appointment:create',
  requestHash: 'a'.repeat(64),
  recordId: 'b'.repeat(64)
};

describe('idempotency domain contract', () => {
  it('plans a versioned response reference without the raw key', () => {
    expect(
      planIdempotencyRecord(
        context,
        'appointment_001',
        '2026-07-23T14:30:00.000Z'
      )
    ).toEqual({
      actorId: context.actorId,
      scope: context.scope,
      requestHash: context.requestHash,
      responseReference: {
        resourceType: 'appointment',
        resourceId: 'appointment_001'
      },
      recordedAt: '2026-07-23T14:30:00.000Z',
      schemaVersion: 1
    });
  });

  it('resolves an exact replay to the original appointment', () => {
    const record = planIdempotencyRecord(
      context,
      'appointment_001',
      '2026-07-23T14:30:00.000Z'
    );

    expect(resolveIdempotencyReplay(record, context)).toBe('appointment_001');
  });

  it('rejects the same scoped key when the request hash differs', () => {
    const record = planIdempotencyRecord(
      context,
      'appointment_001',
      '2026-07-23T14:30:00.000Z'
    );

    expect(() =>
      resolveIdempotencyReplay(record, {
        ...context,
        requestHash: 'c'.repeat(64)
      })
    ).toThrowError(
      expect.objectContaining<Partial<DomainError>>({
        code: 'IDEMPOTENCY_KEY_REUSED'
      })
    );
  });

  it('requires the idempotency actor to match the audit actor', () => {
    expect(() => assertIdempotencyContext(context, 'actor_other')).toThrowError(
      expect.objectContaining<Partial<DomainError>>({
        code: 'INVALID_VALUE'
      })
    );
  });
});

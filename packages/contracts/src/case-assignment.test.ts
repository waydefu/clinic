import { describe, expect, it } from 'vitest';

import {
  AssignCaseManagerRequestSchema,
  AssignCaseManagerResponseSchema
} from './case-assignment.js';

describe('AssignCaseManagerRequestSchema', () => {
  it('accepts an idempotency key and an opaque manager selector', () => {
    expect(
      AssignCaseManagerRequestSchema.parse({
        idempotencyKey: 'case-assign-key-0001',
        managerId: 'manager_alpha'
      })
    ).toEqual({
      idempotencyKey: 'case-assign-key-0001',
      managerId: 'manager_alpha'
    });
  });

  it.each([
    ['patient identity', { patientId: 'patient_001' }],
    ['an actor', { actorId: 'actor_001' }],
    ['a role', { role: 'manager' }],
    ['an effective time', { effectiveAt: '2026-07-24T00:00:00.000Z' }],
    ['a free-text note', { note: 'reassigned per request' }]
  ])('rejects a body carrying %s', (_caseName, extra) => {
    expect(
      AssignCaseManagerRequestSchema.safeParse({
        idempotencyKey: 'case-assign-key-0001',
        managerId: 'manager_alpha',
        ...extra
      }).success
    ).toBe(false);
  });
});

describe('AssignCaseManagerResponseSchema', () => {
  it('returns opaque identifiers and a server activeFrom', () => {
    expect(
      AssignCaseManagerResponseSchema.safeParse({
        patientId: 'patient_001',
        managerId: 'manager_alpha',
        activeFrom: '2026-07-24T00:00:00.000Z'
      }).success
    ).toBe(true);
  });
});

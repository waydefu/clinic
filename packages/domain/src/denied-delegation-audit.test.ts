import { describe, expect, it } from 'vitest';

import { DomainError } from './errors.js';
import { planDeniedDelegationAudit } from './denied-delegation-audit.js';

const valid = {
  eventId: 'aud_denied_001',
  occurredAt: '2026-09-13T15:00:00.000Z',
  actorId: 'staff_front_001',
  actorRole: 'front_desk' as const,
  permission: 'delete_appointment',
  reasonCode: 'secret_not_recognised' as const,
  locked: false,
  failedAttempts: 1,
  correlationId: 'corr_001'
};

describe('planDeniedDelegationAudit', () => {
  it('records a denial without any secret material', () => {
    const event = planDeniedDelegationAudit(valid);
    expect(event).toEqual({
      ...valid,
      result: 'denied',
      source: 'api'
    });
    expect(JSON.stringify(event)).not.toContain('morning-key');
    expect(event).not.toHaveProperty('authorizationId');
    expect(event).not.toHaveProperty('secretHash');
    expect(event).not.toHaveProperty('secretSalt');
  });

  it('records a lockout as verification_locked', () => {
    const event = planDeniedDelegationAudit({
      ...valid,
      reasonCode: 'verification_locked',
      locked: true,
      failedAttempts: 3
    });
    expect(event.reasonCode).toBe('verification_locked');
    expect(event.locked).toBe(true);
  });

  it('rejects a non-canonical role rather than storing it', () => {
    expect(() =>
      planDeniedDelegationAudit({
        ...valid,
        actorRole: 'admin' as never
      })
    ).toThrow(DomainError);
  });

  it('rejects a locked event with zero failures', () => {
    expect(() =>
      planDeniedDelegationAudit({
        ...valid,
        locked: true,
        failedAttempts: 0
      })
    ).toThrow(/at least one failed attempt/);
  });
});

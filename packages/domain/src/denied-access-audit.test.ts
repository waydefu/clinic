import { describe, expect, it } from 'vitest';

import { DomainError } from './errors.js';
import { planDeniedAccessAudit } from './denied-access-audit.js';

const BASE = {
  eventId: 'denial_event_0001',
  occurredAt: '2026-09-14T12:00:00.000Z',
  actorId: 'anonymous',
  actorType: 'unauthenticated',
  action: 'create_appointment',
  resourceType: 'appointment',
  correlationId: 'corr_denial_0001',
  environment: 'internal_test',
  reasonCategory: 'authentication_required' as const
};

describe('planDeniedAccessAudit', () => {
  it('plans a durable denial without secret or PII field names', () => {
    expect(planDeniedAccessAudit(BASE)).toMatchObject({
      outcome: 'denied',
      actorId: 'anonymous',
      resourceId: null
    });
  });

  it('rejects labels that look like secrets or identity fields', () => {
    expect(() =>
      planDeniedAccessAudit({ ...BASE, action: 'submit_password' })
    ).toThrow(DomainError);
    expect(() =>
      planDeniedAccessAudit({ ...BASE, actorType: 'phone' })
    ).toThrow(DomainError);
    expect(() =>
      planDeniedAccessAudit({ ...BASE, action: 'set_cookie' })
    ).toThrow(DomainError);
  });

  it('does not copy a resource identifier when none is supplied', () => {
    expect(planDeniedAccessAudit(BASE).resourceId).toBeNull();
  });
});

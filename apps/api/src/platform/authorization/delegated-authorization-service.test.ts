import { describe, expect, it } from 'vitest';

import {
  createDelegatedAuthorization,
  verifyDelegatedSecret
} from './delegated-authorization-crypto.js';
import { InMemoryDelegatedAuthorizationAttemptStore } from './delegated-authorization-attempt-store.js';
import { InMemoryDeniedAuthorizationAuditSink } from './denied-authorization-audit-sink.js';
import { DelegatedAuthorizationService } from './delegated-authorization-service.js';

const SECRET = 'synthetic-key-lock-001';

function createService() {
  const stored = createDelegatedAuthorization({
    id: 'auth_lock_001',
    label: 'synthetic front desk',
    secret: SECRET
  });
  const store = new InMemoryDelegatedAuthorizationAttemptStore();
  const audit = new InMemoryDeniedAuthorizationAuditSink();
  const service = new DelegatedAuthorizationService(
    store,
    audit,
    verifyDelegatedSecret
  );
  const policy = {
    permission: 'delete_appointment' as const,
    delegatedToRole: 'front_desk' as const,
    enabled: true,
    authorizations: [stored]
  };
  return { service, store, audit, policy, stored };
}

describe('DelegatedAuthorizationService', () => {
  it('authorises a correct secret and does not write a denial audit', async () => {
    const { service, audit, policy } = createService();
    const result = await service.evaluate({
      policy,
      actorId: 'staff_front_010',
      actorRole: 'front_desk',
      presentedSecret: SECRET,
      correlationId: 'corr_ok_001',
      eventId: 'aud_ok_001',
      occurredAt: '2026-09-13T16:00:00.000Z',
      maximumFailures: 3
    });
    expect(result.decision.authorised).toBe(true);
    expect(result.attemptState).toEqual({ failedAttempts: 0, locked: false });
    expect(audit.list()).toEqual([]);
    expect(JSON.stringify(result)).not.toContain(SECRET);
  });

  it('locks after the injected maximum and audits without the secret', async () => {
    const { service, audit, policy } = createService();
    for (let index = 0; index < 3; index += 1) {
      const result = await service.evaluate({
        policy,
        actorId: 'staff_front_011',
        actorRole: 'front_desk',
        presentedSecret: 'wrong-synthetic-key',
        correlationId: `corr_fail_${index}`,
        eventId: `aud_fail_${index}`,
        occurredAt: '2026-09-13T16:01:00.000Z',
        maximumFailures: 3
      });
      expect(result.decision).toEqual({
        authorised: false,
        reason: 'secret_not_recognised'
      });
    }
    expect(audit.list()).toHaveLength(3);
    expect(audit.list()[2]).toMatchObject({
      reasonCode: 'verification_locked',
      locked: true,
      failedAttempts: 3,
      result: 'denied'
    });
    expect(JSON.stringify(audit.list())).not.toContain('wrong-synthetic-key');
    expect(JSON.stringify(audit.list())).not.toContain(SECRET);
  });

  it('skips verification after lock and still returns a generic denial', async () => {
    const { service, audit, policy, stored } = createService();
    await service.evaluate({
      policy,
      actorId: 'staff_front_012',
      actorRole: 'front_desk',
      presentedSecret: 'wrong-synthetic-key',
      correlationId: 'corr_lock_0',
      eventId: 'aud_lock_0',
      occurredAt: '2026-09-13T16:02:00.000Z',
      maximumFailures: 1
    });
    const before = stored.secretHash;
    const locked = await service.evaluate({
      policy,
      actorId: 'staff_front_012',
      actorRole: 'front_desk',
      presentedSecret: SECRET,
      correlationId: 'corr_lock_1',
      eventId: 'aud_lock_1',
      occurredAt: '2026-09-13T16:02:01.000Z',
      maximumFailures: 1
    });
    expect(locked.decision).toEqual({
      authorised: false,
      reason: 'secret_not_recognised'
    });
    expect(locked.attemptState.locked).toBe(true);
    expect(stored.secretHash).toBe(before);
    expect(audit.list()[1]?.reasonCode).toBe('verification_locked');
  });

  it('does not count a role mismatch as a secret failure', async () => {
    const { service, audit, policy } = createService();
    const result = await service.evaluate({
      policy,
      actorId: 'staff_phys_001',
      actorRole: 'physician',
      presentedSecret: SECRET,
      correlationId: 'corr_role_001',
      eventId: 'aud_role_001',
      occurredAt: '2026-09-13T16:03:00.000Z',
      maximumFailures: 3
    });
    expect(result.decision).toEqual({
      authorised: false,
      reason: 'not_delegated_to_role'
    });
    expect(result.attemptState).toEqual({ failedAttempts: 0, locked: false });
    expect(audit.list()[0]?.reasonCode).toBe('not_delegated_to_role');
  });
});

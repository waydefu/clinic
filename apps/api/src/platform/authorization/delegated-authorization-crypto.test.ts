import { describe, expect, it } from 'vitest';

import {
  createDelegatedAuthorization,
  verifyDelegatedSecret
} from './delegated-authorization-crypto.js';
import { authoriseDelegatedAction } from '@beauessence/domain';

describe('delegated authorization crypto', () => {
  it('stores only a salted scrypt verifier, never the presented secret', () => {
    const stored = createDelegatedAuthorization({
      id: 'auth_001',
      label: 'synthetic front desk',
      secret: 'synthetic-key-001'
    });

    expect(stored).toMatchObject({
      id: 'auth_001',
      label: 'synthetic front desk',
      enabled: true,
      secretKdf: 'scrypt'
    });
    expect(stored).toHaveProperty('secretSalt');
    expect(stored).toHaveProperty('secretHash');
    expect(JSON.stringify(stored)).not.toContain('synthetic-key-001');
    expect(stored).not.toHaveProperty('secret');
  });

  it('verifies the correct secret and rejects an incorrect one', () => {
    const stored = createDelegatedAuthorization({
      id: 'auth_002',
      label: 'synthetic evening desk',
      secret: 'synthetic-key-002'
    });

    expect(verifyDelegatedSecret(stored, 'synthetic-key-002')).toBe(true);
    expect(verifyDelegatedSecret(stored, 'wrong-synthetic-key')).toBe(false);
  });

  it('uses a different salt for each authorization record', () => {
    const first = createDelegatedAuthorization({
      id: 'auth_005',
      label: 'synthetic first desk',
      secret: 'same-synthetic-key'
    });
    const second = createDelegatedAuthorization({
      id: 'auth_006',
      label: 'synthetic second desk',
      secret: 'same-synthetic-key'
    });

    expect(first.secretSalt).not.toBe(second.secretSalt);
    expect(first.secretHash).not.toBe(second.secretHash);
    expect(verifyDelegatedSecret(first, 'same-synthetic-key')).toBe(true);
    expect(verifyDelegatedSecret(second, 'same-synthetic-key')).toBe(true);
  });

  it('connects the server verifier to the domain delegation decision', () => {
    const stored = createDelegatedAuthorization({
      id: 'auth_004',
      label: 'synthetic delegated desk',
      secret: 'synthetic-key-004'
    });
    const policy = {
      permission: 'delete_appointment',
      delegatedToRole: 'front_desk' as const,
      enabled: true,
      authorizations: [stored]
    };

    expect(
      authoriseDelegatedAction(
        policy,
        'front_desk',
        'synthetic-key-004',
        verifyDelegatedSecret
      )
    ).toEqual({
      authorised: true,
      authorizationId: 'auth_004',
      authorizationLabel: 'synthetic delegated desk'
    });
    expect(
      authoriseDelegatedAction(
        policy,
        'front_desk',
        'wrong-synthetic-key',
        verifyDelegatedSecret
      )
    ).toEqual({ authorised: false, reason: 'secret_not_recognised' });
  });

  it('fails closed for disabled or malformed records', () => {
    const stored = createDelegatedAuthorization({
      id: 'auth_003',
      label: 'synthetic revoked desk',
      secret: 'synthetic-key-003'
    });

    expect(
      verifyDelegatedSecret({ ...stored, enabled: false }, 'synthetic-key-003')
    ).toBe(false);
    expect(
      verifyDelegatedSecret(
        { ...stored, secretHash: 'not-base64' },
        'synthetic-key-003'
      )
    ).toBe(false);
  });
});

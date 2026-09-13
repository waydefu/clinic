import { describe, expect, it } from 'vitest';

import {
  assertSyntheticAuthorizationShape,
  authoriseSyntheticDelegatedAction,
  planSyntheticDelegationRecord,
  type SyntheticDelegationPolicy
} from './synthetic-delegated-authorization.js';

const policy = (
  overrides: Partial<SyntheticDelegationPolicy> = {}
): SyntheticDelegationPolicy => ({
  permission: 'delete_appointment',
  delegatedToRole: 'front_desk',
  enabled: true,
  authorizations: [
    {
      id: 'auth_synthetic_001',
      label: 'synthetic desk',
      secret: 'synthetic-key-001',
      enabled: true
    }
  ],
  ...overrides
});

describe('synthetic delegated authorization boundary', () => {
  it('keeps synthetic browser verification separate from server records', () => {
    const decision = authoriseSyntheticDelegatedAction(
      policy(),
      'front_desk',
      'synthetic-key-001'
    );

    expect(decision).toEqual({
      authorised: true,
      authorizationId: 'auth_synthetic_001',
      authorizationLabel: 'synthetic desk'
    });
    expect(planSyntheticDelegationRecord(policy(), decision)).toEqual({
      delegated: true,
      permission: 'delete_appointment',
      authorizationId: 'auth_synthetic_001',
      authorizationLabel: 'synthetic desk'
    });
  });

  it('fails closed for disabled or unknown synthetic authorization', () => {
    expect(
      authoriseSyntheticDelegatedAction(
        policy({ enabled: false }),
        'front_desk',
        'synthetic-key-001'
      )
    ).toEqual({ authorised: false, reason: 'delegation_disabled' });
    expect(
      authoriseSyntheticDelegatedAction(
        policy(),
        'front_desk',
        'wrong-synthetic-key'
      )
    ).toEqual({ authorised: false, reason: 'secret_not_recognised' });
  });

  it('validates synthetic input before browser-local storage', () => {
    expect(
      assertSyntheticAuthorizationShape('  synthetic desk  ', ' synthetic-key ')
    ).toEqual({ label: 'synthetic desk', secret: 'synthetic-key' });
  });
});

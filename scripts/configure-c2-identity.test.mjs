import { describe, expect, it } from 'vitest';

import {
  C2_FORBIDDEN_PROJECT,
  C2_TOTP_ADJACENT_INTERVALS,
  C2_UNAPPLIED_PLACEHOLDER,
  assertC2IdentityApplyGate,
  assertC2IdentityProjectId,
  c2IdentityConfigUrl,
  c2IdentityInitializeUrl,
  c2IdentityMutatePlan,
  c2TotpConfigPatch
} from './configure-c2-identity.mjs';

describe('C2 identity configurator (dry-run, not apply)', () => {
  it('refuses CAL-PILOT staging, the placeholder, and ungated apply', () => {
    expect(() => assertC2IdentityProjectId(C2_FORBIDDEN_PROJECT)).toThrow(
      /CAL-PILOT/
    );
    expect(() => assertC2IdentityProjectId(C2_UNAPPLIED_PLACEHOLDER)).toThrow(
      /unapplied/
    );
    expect(() => assertC2IdentityProjectId('prod-clinic')).toThrow(/isolated/);
    expect(() => assertC2IdentityApplyGate({})).toThrow(/inert/);
    expect(() =>
      assertC2IdentityProjectId('beauessence-clinic-stg-abc1')
    ).not.toThrow();
    expect(() =>
      assertC2IdentityApplyGate({ C2_IDENTITY_APPLY: 'granted' })
    ).not.toThrow();
  });

  it('emits TOTP adjacentIntervals=1 and no secret values', () => {
    expect(C2_TOTP_ADJACENT_INTERVALS).toBe(1);
    const patch = c2TotpConfigPatch();
    expect(
      patch.mfa.providerConfigs[0].totpProviderConfig.adjacentIntervals
    ).toBe(1);
    expect(JSON.stringify(patch)).not.toMatch(/AIza|BEGIN |private_key/);
  });

  it('prints initializeAuth then TOTP PATCH and never executes either', () => {
    expect(() => c2IdentityInitializeUrl(C2_FORBIDDEN_PROJECT)).toThrow(
      /CAL-PILOT/
    );
    expect(() => c2IdentityConfigUrl(C2_FORBIDDEN_PROJECT)).toThrow(
      /CAL-PILOT/
    );
    const plan = c2IdentityMutatePlan('beauessence-clinic-stg-abc1');
    expect(plan.execute).toBe(false);
    expect(plan.steps).toHaveLength(2);
    expect(plan.steps[0].method).toBe('POST');
    expect(plan.steps[0].url).toContain(
      '/v2/projects/beauessence-clinic-stg-abc1/identityPlatform:initializeAuth'
    );
    expect(plan.steps[1].method).toBe('PATCH');
    expect(plan.steps[1].url).toContain(
      '/admin/v2/projects/beauessence-clinic-stg-abc1/config'
    );
    expect(plan.steps[0].url).not.toContain('beauessence-clinic-staging');
    expect(plan.steps[1].url).not.toContain('beauessence-clinic-staging');
    expect(
      plan.steps[1].body.mfa.providerConfigs[0].totpProviderConfig
        .adjacentIntervals
    ).toBe(1);
  });
});

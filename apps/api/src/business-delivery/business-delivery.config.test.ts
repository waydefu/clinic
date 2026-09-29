import { describe, expect, it } from 'vitest';

import { readBusinessDeliveryConfig } from './business-delivery.config.js';

const COMPLETE = {
  BUSINESS_DELIVERY_ENABLED: 'true',
  BUSINESS_DELIVERY_POLICY_VERSION: 'BD-POLICY-2026-09-29',
  BUSINESS_DELIVERY_SCOPE: 'internal_synthetic',
  BUSINESS_DELIVERY_OBSERVED_SINCE: '2030-09-01T00:00:00.000Z'
};

describe('readBusinessDeliveryConfig', () => {
  it('enables only a complete, approved configuration', () => {
    const config = readBusinessDeliveryConfig(COMPLETE);
    expect(config.enabled).toBe(true);
    if (config.enabled) {
      expect(config.policy.version).toBe('BD-POLICY-2026-09-29');
      expect(config.scope).toBe('internal_synthetic');
      expect(config.observedSince).toBe('2030-09-01T00:00:00.000Z');
    }
  });

  it('is off by default', () => {
    expect(readBusinessDeliveryConfig({})).toEqual({ enabled: false });
  });

  it.each([
    ['BUSINESS_DELIVERY_ENABLED', '1'],
    ['BUSINESS_DELIVERY_POLICY_VERSION', 'BD-POLICY-1999-01-01'],
    ['BUSINESS_DELIVERY_POLICY_VERSION', undefined],
    ['BUSINESS_DELIVERY_SCOPE', 'production'],
    ['BUSINESS_DELIVERY_SCOPE', undefined],
    ['BUSINESS_DELIVERY_OBSERVED_SINCE', '2030-09-01'],
    ['BUSINESS_DELIVERY_OBSERVED_SINCE', undefined]
  ])('stays off when %s is %s', (name, value) => {
    const environment: Record<string, string | undefined> = { ...COMPLETE };
    if (value === undefined) delete environment[name];
    else environment[name] = value;
    expect(readBusinessDeliveryConfig(environment)).toEqual({ enabled: false });
  });
});

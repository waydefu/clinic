import { afterEach, describe, expect, it, vi } from 'vitest';

import type { StructuredLog } from '@beauessence/domain';

import {
  BUSINESS_DELIVERY_ALLOWLIST_INVALID_CODE,
  businessDeliveryAllowlistNotice,
  readBusinessDeliveryConfig,
  reportBusinessDeliveryAllowlistNotice
} from './business-delivery.config.js';
import { BusinessDeliveryModule } from './business-delivery.module.js';

const COMPLETE = {
  BUSINESS_DELIVERY_ENABLED: 'true',
  BUSINESS_DELIVERY_POLICY_VERSION: 'BD-POLICY-2026-09-29',
  BUSINESS_DELIVERY_SCOPE: 'internal_synthetic',
  BUSINESS_DELIVERY_OBSERVED_SINCE: '2030-09-01T00:00:00.000Z',
  BUSINESS_DELIVERY_MAINTENANCE_EMAILS: 'maintenance@example.test'
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
    ['BUSINESS_DELIVERY_OBSERVED_SINCE', undefined],
    ['BUSINESS_DELIVERY_MAINTENANCE_EMAILS', undefined],
    ['BUSINESS_DELIVERY_MAINTENANCE_EMAILS', ''],
    ['BUSINESS_DELIVERY_MAINTENANCE_EMAILS', '  '],
    ['BUSINESS_DELIVERY_MAINTENANCE_EMAILS', 'maintenance@example.test,'],
    ['BUSINESS_DELIVERY_MAINTENANCE_EMAILS', 'not-an-email']
  ])('stays off when %s is %s', (name, value) => {
    const environment: Record<string, string | undefined> = { ...COMPLETE };
    if (value === undefined) delete environment[name];
    else environment[name] = value;
    expect(readBusinessDeliveryConfig(environment)).toEqual({ enabled: false });
  });
});

describe('maintenance allowlist fail-closed notice', () => {
  const SECRET_PAYLOAD =
    'secret.person@example.test,\nother.person@example.test,';

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    ['trailing comma', 'maintenance@example.test,'],
    ['newline separated', 'one@example.test\ntwo@example.test'],
    ['not an email', 'not-an-email'],
    ['blank', '  '],
    ['absent', undefined]
  ])(
    'notes the invalid allowlist (%s) when the feature is requested',
    (_label, value) => {
      const environment: Record<string, string | undefined> = {
        ...COMPLETE,
        BUSINESS_DELIVERY_MAINTENANCE_EMAILS: value
      };
      // The behaviour under notice is unchanged: the routes stay off.
      expect(readBusinessDeliveryConfig(environment)).toEqual({
        enabled: false
      });
      const notice = businessDeliveryAllowlistNotice(environment);
      expect(notice).toMatchObject({
        service: 'api',
        operation: 'business_delivery_config',
        result: 'error',
        errorCode: BUSINESS_DELIVERY_ALLOWLIST_INVALID_CODE,
        retryState: 'none'
      });
    }
  );

  it('is silent when the feature is not requested or the allowlist is valid', () => {
    expect(businessDeliveryAllowlistNotice(COMPLETE)).toBeUndefined();
    expect(businessDeliveryAllowlistNotice({})).toBeUndefined();
    expect(
      businessDeliveryAllowlistNotice({
        BUSINESS_DELIVERY_ENABLED: 'false',
        BUSINESS_DELIVERY_MAINTENANCE_EMAILS: 'not-an-email'
      })
    ).toBeUndefined();
  });

  it('never carries the payload, an address or a count', () => {
    expect(
      readBusinessDeliveryConfig({
        ...COMPLETE,
        BUSINESS_DELIVERY_MAINTENANCE_EMAILS: SECRET_PAYLOAD
      })
    ).toEqual({ enabled: false });
    const notice = businessDeliveryAllowlistNotice({
      ...COMPLETE,
      BUSINESS_DELIVERY_MAINTENANCE_EMAILS: SECRET_PAYLOAD
    });
    const serialized = JSON.stringify(notice);
    expect(notice).toBeDefined();
    expect(serialized).not.toContain('secret.person');
    expect(serialized).not.toContain('other.person');
    expect(serialized).not.toContain('@');
    expect(serialized).not.toContain('example.test');
    expect(Object.keys(notice ?? {}).sort()).toEqual(
      [
        'correlationId',
        'durationMs',
        'environment',
        'errorCode',
        'operation',
        'result',
        'retryState',
        'service',
        'timestamp'
      ].sort()
    );
  });

  it('emits exactly one entry through the structured logger', () => {
    const entries: StructuredLog[] = [];
    const logger = { emit: (entry: StructuredLog) => entries.push(entry) };
    reportBusinessDeliveryAllowlistNotice(
      { ...COMPLETE, BUSINESS_DELIVERY_MAINTENANCE_EMAILS: SECRET_PAYLOAD },
      logger
    );
    expect(entries).toHaveLength(1);
    reportBusinessDeliveryAllowlistNotice(COMPLETE, logger);
    expect(entries).toHaveLength(1);
  });

  it('never lets a logging failure change boot', () => {
    expect(() =>
      reportBusinessDeliveryAllowlistNotice(
        { ...COMPLETE, BUSINESS_DELIVERY_MAINTENANCE_EMAILS: 'bad,' },
        {
          emit: () => {
            throw new Error('logger down');
          }
        }
      )
    ).not.toThrow();
  });

  it('is reported once at module init, from the real process environment', () => {
    for (const [name, value] of Object.entries(COMPLETE)) {
      vi.stubEnv(name, value);
    }
    vi.stubEnv(
      'BUSINESS_DELIVERY_MAINTENANCE_EMAILS',
      'maintenance@example.test,'
    );
    const entries: StructuredLog[] = [];
    new BusinessDeliveryModule({
      emit: (entry) => entries.push(entry)
    }).onModuleInit();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.errorCode).toBe(
      BUSINESS_DELIVERY_ALLOWLIST_INVALID_CODE
    );

    vi.stubEnv(
      'BUSINESS_DELIVERY_MAINTENANCE_EMAILS',
      'maintenance@example.test'
    );
    new BusinessDeliveryModule({
      emit: (entry) => entries.push(entry)
    }).onModuleInit();
    expect(entries).toHaveLength(1);
  });
});

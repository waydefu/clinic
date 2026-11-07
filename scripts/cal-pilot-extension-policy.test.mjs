import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  CAL_PILOT_EXTENDED_EXPIRY,
  CAL_PILOT_ORIGINAL_EXPIRY,
  nextHostingExpiry,
  validateActivationWindow,
  validateExtensionRequest,
  validateExtensionState
} from './cal-pilot-extension-policy.mjs';

const activationNow = '2026-10-28T00:00:00Z';
const activationWindow = {
  configurationExists: true,
  expiresAt: CAL_PILOT_EXTENDED_EXPIRY,
  now: activationNow
};

describe('CAL-PILOT activation time admission (pure policy only)', () => {
  it.each([CAL_PILOT_EXTENDED_EXPIRY, '2026-11-28T04:51:37.123456789Z'])(
    'preserves valid future UTC expiry %s',
    (expiresAt) => {
      expect(() =>
        validateActivationWindow({ ...activationWindow, expiresAt })
      ).not.toThrow();
    }
  );

  it.each([
    undefined,
    null,
    2030,
    {},
    '',
    'not-a-timestamp',
    'Jan 02 2030 Z',
    '2030-02-30T00:00:00Z',
    '2030-01-02T00:00:00+08:00'
  ])('rejects missing, malformed or non-UTC stored expiry %s', (expiresAt) => {
    expect(() =>
      validateActivationWindow({ ...activationWindow, expiresAt })
    ).toThrow();
  });

  it.each([activationNow, CAL_PILOT_ORIGINAL_EXPIRY])(
    'rejects equal or expired windows %s',
    (expiresAt) => {
      expect(() =>
        validateActivationWindow({ ...activationWindow, expiresAt })
      ).toThrow('configuration is missing or expired');
    }
  );

  it('rejects a missing configuration and an invalid comparison clock', () => {
    expect(() =>
      validateActivationWindow({
        ...activationWindow,
        configurationExists: false
      })
    ).toThrow('configuration is missing or expired');
    expect(() =>
      validateActivationWindow({ ...activationWindow, now: 'not-a-timestamp' })
    ).toThrow();
  });

  it('wires admission before both mutations without importing the entry point', () => {
    const source = readFileSync(
      new URL('./activate-cal-pilot.mjs', import.meta.url),
      'utf8'
    );
    expect(source).toContain(
      "import { validateActivationWindow } from './cal-pilot-extension-policy.mjs';"
    );
    const admission = source.indexOf('validateActivationWindow({');
    expect(admission).toBeGreaterThan(0);
    expect(source.indexOf('transaction.update(')).toBeGreaterThan(admission);
    expect(source.indexOf('transaction.create(')).toBeGreaterThan(admission);
  });
});

describe('CAL-PILOT extension policy', () => {
  it.each(['now', 'currentExpiry'])(
    'rejects a normalized calendar date in %s before planning a renewal',
    (field) => {
      expect(() =>
        nextHostingExpiry({
          now: '2026-09-28T05:18:46Z',
          currentExpiry: '2026-10-05T05:18:46Z',
          targetExpiry: CAL_PILOT_EXTENDED_EXPIRY,
          [field]: '2026-09-31T05:18:46Z'
        })
      ).toThrow(`${field} must be an exact UTC timestamp.`);
    }
  );

  it('accepts only the approved staging expiry transition', () => {
    expect(() =>
      validateExtensionRequest({
        projectId: 'beauessence-clinic-staging',
        expectedCurrentExpiry: CAL_PILOT_ORIGINAL_EXPIRY,
        requestedExpiry: CAL_PILOT_EXTENDED_EXPIRY
      })
    ).not.toThrow();

    expect(() =>
      validateExtensionRequest({
        projectId: 'another-project',
        expectedCurrentExpiry: CAL_PILOT_ORIGINAL_EXPIRY,
        requestedExpiry: CAL_PILOT_EXTENDED_EXPIRY
      })
    ).toThrow('outside beauessence-clinic-staging');
    expect(() =>
      validateExtensionRequest({
        projectId: 'beauessence-clinic-staging',
        expectedCurrentExpiry: '2026-09-30T04:51:37Z',
        requestedExpiry: CAL_PILOT_EXTENDED_EXPIRY
      })
    ).toThrow('not the approved baseline');
    expect(() =>
      validateExtensionRequest({
        projectId: 'beauessence-clinic-staging',
        expectedCurrentExpiry: CAL_PILOT_ORIGINAL_EXPIRY,
        requestedExpiry: '2026-12-28T04:51:37Z'
      })
    ).toThrow('not the approved extension');
  });

  it('refuses drifted runtime or allowlist state', () => {
    const healthy = {
      expiresAt: CAL_PILOT_ORIGINAL_EXPIRY,
      inboundEnabled: true,
      outboundEnabled: true,
      health: 'healthy',
      sourceGeneration: 1,
      expectedSourceGeneration: 1,
      enabledSourceIds: [
        'calendar_source_primary',
        'calendar_source_secondary'
      ],
      activeSourceEnabled: true
    };
    expect(() => validateExtensionState(healthy)).not.toThrow();
    expect(() =>
      validateExtensionState({ ...healthy, inboundEnabled: false })
    ).toThrow('must both be enabled');
    expect(() =>
      validateExtensionState({
        ...healthy,
        enabledSourceIds: ['calendar_source_primary', 'replacement_source']
      })
    ).toThrow('two-source allowlist');
    expect(() =>
      validateExtensionState({ ...healthy, expectedSourceGeneration: 2 })
    ).toThrow('source generation drifted');
  });

  it('renews only in the final seven days and never exceeds 30 days', () => {
    expect(
      nextHostingExpiry({
        now: '2026-09-23T05:18:46Z',
        currentExpiry: '2026-09-29T05:18:46Z',
        targetExpiry: CAL_PILOT_EXTENDED_EXPIRY
      })
    ).toBe('2026-10-23T05:18:46.000Z');
    expect(() =>
      nextHostingExpiry({
        now: '2026-09-20T05:18:46Z',
        currentExpiry: '2026-09-29T05:18:46Z',
        targetExpiry: CAL_PILOT_EXTENDED_EXPIRY
      })
    ).toThrow('final seven days');
    expect(
      nextHostingExpiry({
        now: '2026-11-20T04:51:37Z',
        currentExpiry: '2026-11-22T04:51:37Z',
        targetExpiry: CAL_PILOT_EXTENDED_EXPIRY
      })
    ).toBe(CAL_PILOT_EXTENDED_EXPIRY.replace('Z', '.000Z'));
  });

  it('keeps both cloud mutation entry points review-only by default', () => {
    const extension = readFileSync(
      new URL('./cal-pilot-extend.ps1', import.meta.url),
      'utf8'
    );
    const renewal = readFileSync(
      new URL('./cal-pilot-renew-hosting.ps1', import.meta.url),
      'utf8'
    );
    expect(extension.indexOf('if (-not $ConfirmApply)')).toBeLessThan(
      extension.indexOf('node scripts/extend-cal-pilot.mjs')
    );
    expect(
      extension.indexOf(
        "Assert-RunService 'cal-pilot-api' $ExpectedApiRevision $ExpectedApiImage"
      )
    ).toBeLessThan(extension.indexOf('node scripts/extend-cal-pilot.mjs'));
    expect(
      extension.indexOf(
        "Assert-RunService 'cal-pilot-worker' $ExpectedWorkerRevision $ExpectedWorkerImage"
      )
    ).toBeLessThan(extension.indexOf('node scripts/extend-cal-pilot.mjs'));
    expect(
      extension.indexOf('if ((Get-HostingVersion) -ne $ExpectedHostingVersion)')
    ).toBeLessThan(extension.indexOf('node scripts/extend-cal-pilot.mjs'));
    expect(extension.indexOf('\nAssert-SecretVersions\n')).toBeLessThan(
      extension.indexOf('node scripts/extend-cal-pilot.mjs')
    );
    expect(renewal.indexOf('if (-not $ConfirmApply)')).toBeLessThan(
      renewal.indexOf('Invoke-RestMethod -Method Patch')
    );
  });

  it('keeps the extension infrastructure and Hosting copy inside the approved diff', () => {
    const terraform = readFileSync(
      new URL('../infra/terraform/cal-pilot/main.tf', import.meta.url),
      'utf8'
    );
    const client = readFileSync(
      new URL('../apps/web/src/calendar-pilot-entry.js', import.meta.url),
      'utf8'
    );
    expect(terraform).toContain(
      'display_name    = "CAL-PILOT synthetic alert budget through 2026-11-28"'
    );
    expect(terraform).toContain('custom_period {');
    expect(terraform).toContain('day = 29');
    expect(terraform).toContain('for_each = toset([0.5, 0.8, 1.0])');
    expect(terraform).toContain('paused           = false');
    expect(client).toContain('CAL-PILOT 合成日曆測試');
    expect(client).toContain('CAL-PILOT 合成同步測試');
    expect(client).not.toContain('30 天合成');
  });
});

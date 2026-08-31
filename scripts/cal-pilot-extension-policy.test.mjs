import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  CAL_PILOT_EXTENDED_EXPIRY,
  CAL_PILOT_ORIGINAL_EXPIRY,
  nextHostingExpiry,
  validateExtensionRequest,
  validateExtensionState
} from './cal-pilot-extension-policy.mjs';

describe('CAL-PILOT extension policy', () => {
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

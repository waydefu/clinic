import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import vitestConfig from '../vitest.config.ts';

const source = readFileSync(
  new URL('./cal-pilot-renew-hosting.ps1', import.meta.url),
  'utf8'
);
const helper = source.match(/^function Get-Channel \{[\s\S]*?^\}/mu)?.[0];
if (helper === undefined) throw new Error('Channel selection helper is missing.');

describe('CAL-PILOT synthetic channel selection', () => {
  it('rejects zero or duplicate matches and selects the unique match', () => {
    const target = {
      name: 'projects/synthetic/sites/synthetic/channels/cal-pilot',
      syntheticMarker: 'selected'
    };
    const inputs = [
      { channels: [] },
      { channels: [target] },
      { channels: [target, target] }
    ];
    const command = [
      "$ErrorActionPreference = 'Stop'",
      'Set-StrictMode -Version Latest',
      "$projectId = 'synthetic'",
      "$channel = 'cal-pilot'",
      'function firebase { $script:syntheticPayload }',
      helper,
      '$inputs = ConvertFrom-Json $env:SYNTHETIC_CHANNELS',
      '$results = @(foreach ($testCase in $inputs) {',
      '  $script:syntheticPayload = @{ result = $testCase } | ConvertTo-Json -Depth 10 -Compress',
      '  try {',
      '    $selected = Get-Channel',
      '    [PSCustomObject]@{ accepted = $true; marker = $selected.syntheticMarker }',
      '  } catch {',
      "    [PSCustomObject]@{ accepted = $false; marker = '' }",
      '  }',
      '})',
      '[Console]::WriteLine((ConvertTo-Json -InputObject $results -Compress))'
    ].join('\n');
    const result = spawnSync(
      'pwsh',
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command],
      {
        encoding: 'utf8',
        timeout: vitestConfig.test.testTimeout,
        env: { ...process.env, SYNTHETIC_CHANNELS: JSON.stringify(inputs) }
      }
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual([
      { accepted: false, marker: '' },
      { accepted: true, marker: 'selected' },
      { accepted: false, marker: '' }
    ]);
    expect(helper).not.toMatch(/\$matches\b/iu);
    expect(source.indexOf('if (-not $ConfirmApply)')).toBeLessThan(
      source.indexOf('Invoke-RestMethod -Method Patch')
    );
  });
});

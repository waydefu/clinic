import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import vitestConfig from '../vitest.config.ts';

const source = readFileSync(
  new URL('./cal-pilot-release.ps1', import.meta.url),
  'utf8'
);
const cleanup = source.match(
  /^\} finally \{\r?\n( {2}\$apiIdentityToken = \$null[\s\S]*?)^\}\r?\n\r?\n(?=gcloud run services add-iam-policy-binding cal-pilot-worker)/mu
)?.[1];
if (cleanup === undefined) throw new Error('Release smoke cleanup is missing.');

const actions = ['api', 'worker', 'revoke', 'configuration'];
const cases = [
  ...Array.from({ length: 8 }, (_, mask) => ({
    id: `created-flags-${mask}`,
    api: Boolean(mask & 1),
    worker: Boolean(mask & 2),
    configuration: Boolean(mask & 4),
    failures: [],
    smokeFailed: false
  })),
  ...actions.map((action) => ({
    id: `cleanup-failure-${action}`,
    api: true,
    worker: true,
    configuration: true,
    failures: [action],
    smokeFailed: false
  })),
  {
    id: 'original-smoke-failure',
    api: true,
    worker: true,
    configuration: true,
    failures: [],
    smokeFailed: true
  },
  {
    id: 'multiple-cleanup-failures',
    api: true,
    worker: true,
    configuration: true,
    failures: ['api', 'revoke'],
    smokeFailed: true
  }
];
let invocation;
function invokeCleanup() {
  if (invocation !== undefined) return invocation;
  // Execute only the selected cleanup with an in-process fake; never run the
  // deployment script, read a credential, or resolve a native cloud executable.
  const command = `
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$env:PATH = ''
$projectId = 'synthetic-project'
$region = 'synthetic-region'
$smokeMember = 'synthetic-member'
$smokeConfiguration = 'synthetic-configuration'
$smokeIdentityEmail = 'synthetic-identity'
function gcloud {
  if ($args[0] -eq 'run' -and $args[3] -eq 'cal-pilot-api') { $action = 'api' }
  elseif ($args[0] -eq 'run' -and $args[3] -eq 'cal-pilot-worker') { $action = 'worker' }
  elseif ($args[0] -eq 'auth' -and $args[1] -eq 'revoke') { $action = 'revoke' }
  elseif ($args[0] -eq 'config' -and $args[2] -eq 'delete') { $action = 'configuration' }
  else { throw 'Unexpected synthetic cleanup operation' }
  $script:calls.Add($action)
  if ($script:failures -contains $action) { throw 'Synthetic cleanup failure' }
}
if ((Get-Command gcloud).CommandType -ne 'Function') { throw 'Fake gcloud is missing' }
$inputs = ConvertFrom-Json $env:SYNTHETIC_RELEASE_CLEANUP_CASES
$results = @(foreach ($case in $inputs) {
  $script:calls = [System.Collections.Generic.List[string]]::new()
  $script:failures = @($case.failures)
  $apiSmokeBindingAdded = [bool]$case.api
  $workerSmokeBindingAdded = [bool]$case.worker
  $smokeConfigurationCreated = [bool]$case.configuration
  $apiIdentityToken = 'synthetic-only'
  $workerIdentityToken = 'synthetic-only'
  $failed = $false
  try {
    try {
      if ($case.smokeFailed) { throw 'Synthetic smoke failure' }
    } finally {
${cleanup}
    }
  } catch { $failed = $true }
  [PSCustomObject]@{
    id = $case.id
    calls = @($script:calls.ToArray())
    failed = $failed
    tokensCleared = ($null -eq $apiIdentityToken -and $null -eq $workerIdentityToken)
  }
})
[Console]::WriteLine((ConvertTo-Json -InputObject $results -Depth 5 -Compress))
`;
  invocation = spawnSync(
    process.platform === 'win32' ? 'powershell.exe' : 'pwsh',
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command],
    {
      encoding: 'utf8',
      timeout: vitestConfig.test.testTimeout,
      env: {
        ...process.env,
        SYNTHETIC_RELEASE_CLEANUP_CASES: JSON.stringify(cases)
      }
    }
  );
  return invocation;
}

describe('CAL-PILOT release smoke cleanup with synthetic commands only', () => {
  it.each(cases)('attempts every applicable cleanup: $id', (entry) => {
    const result = invokeCleanup();
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    const outcomes = JSON.parse(result.stdout);
    expect(outcomes.map((outcome) => outcome.id)).toEqual(
      cases.map((c) => c.id)
    );
    const outcome = outcomes.find((value) => value.id === entry.id);
    expect(outcome.calls).toEqual([
      ...(entry.api ? ['api'] : []),
      ...(entry.worker ? ['worker'] : []),
      ...(entry.configuration ? ['revoke', 'configuration'] : [])
    ]);
    expect(outcome.failed).toBe(entry.smokeFailed || entry.failures.length > 0);
    expect(outcome.tokensCleared).toBe(true);
  });
});

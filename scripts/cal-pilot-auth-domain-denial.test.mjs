import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import vitestConfig from '../vitest.config.ts';

const source = readFileSync(
  new URL('./cal-pilot-runtime-update.ps1', import.meta.url),
  'utf8'
);
const helperPattern = /^function Assert-AuthDomain \{[\s\S]*?^\}/mu;
const helper = source.match(helperPattern)?.[0];
if (helper === undefined) throw new Error('Auth-domain helper is missing.');

const cases = [
  '',
  'synthetic-project.firebaseapp.com',
  'other-project.firebaseapp.com',
  'other-project.web.app',
  'preview--other-project.web.app',
  'https://other-project.web.app',
  'other-project.web.app/path',
  'synthetic-project.firebaseapp.com:443',
  '127.0.0.1'
];
let invocation;

// Compile only the inspected local predicate, never dot-source the deployment
// script. Share one native process, not nine cold starts during the full suite.
// Every input/result is asserted; reuse the repository's existing test budget.
function invokePredicates() {
  if (invocation !== undefined) return invocation;
  const command = [
    "$ErrorActionPreference = 'Stop'",
    'Set-StrictMode -Version Latest',
    "$defaultAuthDomain = 'synthetic-project.firebaseapp.com'",
    helper,
    '$values = ConvertFrom-Json $env:SYNTHETIC_AUTH_DOMAINS',
    '$results = @(foreach ($value in $values) {',
    '  $AuthDomain = [string]$value',
    '  if ([string]::IsNullOrWhiteSpace($AuthDomain)) {',
    '    $AuthDomain = $defaultAuthDomain',
    '  }',
    '  try {',
    '    Assert-AuthDomain',
    "    [PSCustomObject]@{ value = [string]$value; accepted = $true; message = '' }",
    '  } catch {',
    '    [PSCustomObject]@{ value = [string]$value; accepted = $false; message = $_.Exception.Message }',
    '  }',
    '})',
    '[Console]::WriteLine((ConvertTo-Json -InputObject $results -Compress))'
  ].join('\n');
  const flags = ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command'];
  const data = JSON.stringify(cases);
  const env = { ...process.env, SYNTHETIC_AUTH_DOMAINS: data };
  invocation = spawnSync('pwsh', [...flags, command], {
    encoding: 'utf8',
    timeout: vitestConfig.test.testTimeout,
    env
  });
  return invocation;
}

describe('CAL-PILOT auth-domain authority stays closed', () => {
  it.each(cases)('rejects unapproved identity %j natively', (value) => {
    const result = invokePredicates();
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    const outcomes = JSON.parse(result.stdout);
    expect(outcomes.map((outcome) => outcome.value)).toEqual(cases);
    const outcome = outcomes.find((outcome) => outcome.value === value);
    expect(outcome.accepted).toBe(false);
    expect(outcome.message).toContain('Unsupported authDomain.');
  });

  it('places denial before preflight can consult a cloud login', () => {
    const callPattern =
      /^Assert-(?:AuthDomain|PreflightTools|CandidateSha)$/gmu;
    const calls = source.match(callPattern);
    expect(calls).toEqual([
      'Assert-AuthDomain',
      'Assert-PreflightTools',
      'Assert-CandidateSha'
    ]);
  });
});

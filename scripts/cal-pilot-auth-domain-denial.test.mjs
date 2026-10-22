import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./cal-pilot-runtime-update.ps1', import.meta.url),
  'utf8'
);
const helperPattern = /^function Assert-AuthDomain \{[\s\S]*?^\}/mu;
const helper = source.match(helperPattern)?.[0];
if (helper === undefined) throw new Error('Auth-domain helper is missing.');

// Compile only the inspected local predicate, never dot-source the deployment
// script. No preflight, SDK, credentials, network, or provider is involved.
function invokePredicate(value) {
  const command = [
    "$ErrorActionPreference = 'Stop'",
    'Set-StrictMode -Version Latest',
    "$defaultAuthDomain = 'synthetic-project.firebaseapp.com'",
    '$AuthDomain = $env:SYNTHETIC_AUTH_DOMAIN',
    'if ([string]::IsNullOrWhiteSpace($AuthDomain)) {',
    '  $AuthDomain = $defaultAuthDomain',
    '}',
    helper,
    'try {',
    '  Assert-AuthDomain',
    "  [Console]::WriteLine('ACCEPT')",
    '  exit 0',
    '} catch {',
    "  [Console]::WriteLine('REJECT:' + $_.Exception.Message)",
    '  exit 3',
    '}'
  ].join('\n');
  const flags = ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command'];
  return spawnSync('pwsh', [...flags, command], {
    encoding: 'utf8',
    timeout: 5000,
    env: { ...process.env, SYNTHETIC_AUTH_DOMAIN: value }
  });
}

describe('CAL-PILOT auth-domain authority stays closed', () => {
  it.each([
    '',
    'synthetic-project.firebaseapp.com',
    'other-project.firebaseapp.com',
    'other-project.web.app',
    'preview--other-project.web.app',
    'https://other-project.web.app',
    'other-project.web.app/path',
    'synthetic-project.firebaseapp.com:443',
    '127.0.0.1'
  ])('rejects unapproved identity %j natively', (value) => {
    const result = invokePredicate(value);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(3);
    expect(result.stdout).toContain('REJECT:Unsupported authDomain.');
    expect(result.stdout).not.toContain('ACCEPT');
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

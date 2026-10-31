import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import vitestConfig from '../vitest.config.ts';

const source = readFileSync(
  new URL('./cal-pilot-release.ps1', import.meta.url),
  'utf8'
);
const helpers = source.match(
  /^function Invoke-SmokeIamPolicy \{[\s\S]*?(?=^\$readerKey =)/mu
)?.[0];
if (!helpers) throw new Error('Smoke binding ownership helpers are missing.');
const cleanup = source.match(
  /^\} finally \{\r?\n( {2}\$apiIdentityToken = \$null[\s\S]*?)^\}\r?\n\r?\n(?=gcloud run services add-iam-policy-binding cal-pilot-worker)/mu
)?.[1];
if (!cleanup) throw new Error('Release smoke cleanup is missing.');
const fixture = fileURLToPath(
  new URL('./fixtures/cal-pilot-iam-cli.mjs', import.meta.url)
);
const directory = mkdtempSync(join(tmpdir(), 'synthetic-smoke-iam-'));
afterAll(() => rmSync(directory, { recursive: true, force: true }));
const member = 'serviceAccount:synthetic-smoke@example.invalid';
const services = ['cal-pilot-api', 'cal-pilot-worker'];
const cases = [
  { id: 'existing', existing: true, members: [true, true] },
  { id: 'created', members: [false, false] },
  {
    id: 'first-read-fails',
    fail: 'cal-pilot-api:get',
    members: [false, false]
  },
  {
    id: 'first-grant-fails',
    fail: 'cal-pilot-api:grant',
    members: [false, false]
  },
  {
    id: 'second-grant-fails',
    fail: 'cal-pilot-worker:grant',
    members: [false, false]
  },
  {
    id: 'first-reply-lost',
    lostReply: 'cal-pilot-api',
    members: [true, false]
  },
  {
    id: 'second-reply-lost',
    lostReply: 'cal-pilot-worker',
    members: [false, true]
  },
  {
    id: 'api-cleanup-fails',
    fail: 'cal-pilot-api:restore',
    members: [true, false]
  },
  { id: 'api-policy-drift', drift: 'cal-pilot-api', members: [true, false] },
  { id: 'smoke-fails', smokeFailed: true, members: [false, false] },
  { id: 'empty-policy', empty: true, members: [false, false] },
  { id: 'missing-etag', invalidEtag: true, members: [false, false] },
  { id: 'unresolved-condition', unresolved: true, members: [false, false] },
  { id: 'concurrent-grant', race: 'cal-pilot-api', members: [true, false] }
];
for (const entry of cases) {
  entry.path = join(directory, `${entry.id}.json`);
  const policies = Object.fromEntries(
    services.map((service) => [
      service,
      {
        version: 3,
        etag: 'synthetic-initial',
        bindings: [
          {
            role: 'roles/run.invoker',
            members: [
              'serviceAccount:synthetic-other@example.invalid',
              ...(entry.existing ? [member] : [])
            ]
          },
          {
            role: 'roles/run.invoker',
            members: ['serviceAccount:synthetic-conditional@example.invalid'],
            condition: { title: 'synthetic-existing', expression: 'true' }
          }
        ]
      }
    ])
  );
  if (entry.empty)
    services.forEach((service) => {
      policies[service].bindings = [];
    });
  if (entry.invalidEtag)
    services.forEach((service) => {
      policies[service].etag = '';
    });
  if (entry.unresolved)
    policies['cal-pilot-api'].bindings[0].role =
      'roles/run.invoker_withcond_synthetic';
  writeFileSync(
    entry.path,
    JSON.stringify({
      synthetic: true,
      member,
      revision: 0,
      policies,
      calls: [],
      fail: entry.fail,
      lostReply: entry.lostReply,
      drift: entry.drift,
      race: entry.race
    })
  );
}
const psQuote = (value) => `'${value.replaceAll("'", "''")}'`;
let invocation;
function invokeCases() {
  if (invocation) return invocation;
  // Only extracted functions/finally execute. PATH is empty; the gcloud function
  // invokes this synthetic Node fixture by absolute executable/file paths.
  const command = `
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
Set-StrictMode -Version Latest
$env:PATH = ''
$projectId = 'synthetic-project'
$region = 'synthetic-region'
$smokeMember = '${member}'
function gcloud {
  & ${psQuote(process.execPath)} ${psQuote(fixture)} $script:statePath @args
  $global:LASTEXITCODE = $LASTEXITCODE
}
${helpers}
$inputs = ConvertFrom-Json $env:SYNTHETIC_SMOKE_IAM_CASES
$results = @(foreach ($case in $inputs) {
  $script:statePath = $case.path
  $apiSmokeBindingAdded = $false
  $workerSmokeBindingAdded = $false
  $apiSmokeBindingLease = $null
  $workerSmokeBindingLease = $null
  $smokeConfigurationCreated = $false
  $apiIdentityToken = 'synthetic-only'
  $workerIdentityToken = 'synthetic-only'
  $failed = $false
  try {
    try {
      $apiSmokeBindingLease = Enter-SmokeInvokerBinding -Service 'cal-pilot-api' -Member $smokeMember -ProjectId $projectId -Region $region
      $apiSmokeBindingAdded = $apiSmokeBindingLease.Created
      $workerSmokeBindingLease = Enter-SmokeInvokerBinding -Service 'cal-pilot-worker' -Member $smokeMember -ProjectId $projectId -Region $region
      $workerSmokeBindingAdded = $workerSmokeBindingLease.Created
      if ($case.smokeFailed) { throw 'Synthetic smoke failure' }
    } finally {
${cleanup}
    }
  } catch { $failed = $true }
  [PSCustomObject]@{ id = $case.id; failed = $failed; tokensCleared = ($null -eq $apiIdentityToken -and $null -eq $workerIdentityToken) }
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
        SYNTHETIC_SMOKE_IAM_CASES: JSON.stringify(
          cases.map((entry) => ({
            id: entry.id,
            path: entry.path,
            smokeFailed: Boolean(entry.smokeFailed)
          }))
        )
      }
    }
  );
  return invocation;
}

describe('owned-only CAL-PILOT smoke IAM with a synthetic native CLI', () => {
  it.each(cases)(
    'preserves non-owned bindings and isolates uncertainty: $id',
    (entry) => {
      const result = invokeCases();
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(0);
      const outcome = JSON.parse(result.stdout).find(
        (value) => value.id === entry.id
      );
      expect(outcome.failed).toBe(
        !['existing', 'created', 'empty-policy'].includes(entry.id)
      );
      expect(outcome.tokensCleared).toBe(true);
      const state = JSON.parse(readFileSync(entry.path, 'utf8'));
      services.forEach((service, index) => {
        const bindings = state.policies[service].bindings;
        expect(
          bindings.some(
            (binding) => !binding.condition && binding.members.includes(member)
          )
        ).toBe(entry.members[index]);
        if (!entry.empty) {
          expect(
            bindings.some((binding) =>
              binding.members.includes(
                'serviceAccount:synthetic-other@example.invalid'
              )
            )
          ).toBe(true);
          expect(
            bindings.some(
              (binding) => binding.condition?.title === 'synthetic-existing'
            )
          ).toBe(true);
        }
      });
      if (entry.existing)
        expect(state.calls.every((call) => call.kind === 'get')).toBe(true);
      if (entry.lostReply)
        expect(
          state.calls.some(
            (call) =>
              call.service === entry.lostReply && call.kind === 'restore'
          )
        ).toBe(false);
      if (entry.drift)
        expect(
          state.policies[entry.drift].bindings.some((binding) =>
            binding.members.includes(
              'serviceAccount:synthetic-concurrent@example.invalid'
            )
          )
        ).toBe(true);
    }
  );
});

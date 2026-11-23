import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import vitestConfig from '../vitest.config.ts';

const scriptNames = [
  'cal-pilot-release.ps1',
  'cal-pilot-update.ps1',
  'cal-pilot-rollback.ps1',
  'cal-pilot-build-images.ps1',
  'cal-pilot-renew-hosting.ps1',
  'cal-pilot-runtime-update.ps1'
];

function readScript(name) {
  return readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
}

function runPwsh(command, extraEnv = {}) {
  const result = spawnSync(
    'pwsh',
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command],
    {
      encoding: 'utf8',
      timeout: vitestConfig.test.testTimeout,
      env: { ...process.env, ...extraEnv }
    }
  );
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);
  return JSON.parse(result.stdout);
}

describe('CAL-PILOT release and rollback script safety', () => {
  it('enforces PowerShell 7+, native strictness, and channel readback', () => {
    for (const name of scriptNames) {
      const content = readScript(name);
      expect(content).toContain('PowerShell 7+ (pwsh) is required.');
      expect(content).toContain('$PSNativeCommandUseErrorActionPreference = $true');
    }

    const updateScript = readScript('cal-pilot-update.ps1');
    expect(updateScript).not.toContain('$expectedExpiry');

    const releaseScript = readScript('cal-pilot-release.ps1');
    expect(releaseScript).not.toContain('Find-PreviewUrl');
    expect(releaseScript).not.toContain(
      'firebase hosting:channel:deploy $channel --expires 30d --project $projectId --json'
    );
    expect(releaseScript).toContain(
      'firebase hosting:channel:deploy $channel --expires 30d --project $projectId'
    );
    expect(releaseScript).toContain(
      'firebase hosting:channel:list --project $projectId --json'
    );
  });

  it('aborts cal-pilot-rollback.ps1 immediately on any failing step', () => {
    const rollbackPath = fileURLToPath(
      new URL('./cal-pilot-rollback.ps1', import.meta.url)
    );
    const command = [
      "$ErrorActionPreference = 'Stop'",
      'Set-StrictMode -Version Latest',
      "$env:PATH = ''",
      '$cases = @("pause", "disable", "api", "worker", "token", "none")',
      'function node {',
      '  $global:testCalls += "disable"',
      '  if ($global:testFailAt -eq "disable") { $global:LASTEXITCODE = 1 } else { $global:LASTEXITCODE = 0 }',
      '}',
      'function gcloud {',
      '  $sub = ($args[0..1] -join " ")',
      '  if ($sub -eq "scheduler jobs") {',
      '    $global:testCalls += "pause"',
      '    if ($global:testFailAt -eq "pause") { $global:LASTEXITCODE = 1 } else { $global:LASTEXITCODE = 0 }',
      '  } elseif ($args -contains "cal-pilot-api") {',
      '    $global:testCalls += "api"',
      '    if ($global:testFailAt -eq "api") { $global:LASTEXITCODE = 1 } else { $global:LASTEXITCODE = 0 }',
      '  } elseif ($args -contains "cal-pilot-worker") {',
      '    $global:testCalls += "worker"',
      '    if ($global:testFailAt -eq "worker") { $global:LASTEXITCODE = 1 } else { $global:LASTEXITCODE = 0 }',
      '  } elseif ($sub -eq "auth print-access-token") {',
      '    $global:testCalls += "token"',
      '    if ($global:testFailAt -eq "token") { $global:LASTEXITCODE = 1 } else { $global:LASTEXITCODE = 0; "synthetic-token" }',
      '  }',
      '}',
      'function Invoke-RestMethod { $global:testCalls += "hosting-release"; $null }',
      'function Write-Host([object]$Object) { $global:testHosts += [string]$Object }',
      '$results = @(foreach ($failAt in $cases) {',
      '  $global:testFailAt = $failAt',
      '  $global:testCalls = @()',
      '  $global:testHosts = @()',
      '  $ok = $false',
      '  try {',
      '    & $env:ROLLBACK_SCRIPT `',
      '      -PreviousApiRevision "cal-pilot-api-00001-abc" `',
      '      -PreviousWorkerRevision "cal-pilot-worker-00001-def" `',
      '      -PreviousHostingVersion "sites/beauessence-clinic-staging/versions/v1" `',
      '      -ConfirmRollback',
      '    $ok = $true',
      '  } catch {',
      '    $ok = $false',
      '  }',
      '  [PSCustomObject]@{',
      '    failAt = $failAt',
      '    ok = $ok',
      '    calls = @($global:testCalls)',
      '    completedHost = ($global:testHosts -join "`n") -like "*Rollback complete*"',
      '  }',
      '})',
      '[Console]::WriteLine((ConvertTo-Json -InputObject $results -Depth 5 -Compress))'
    ].join('\n');

    const results = runPwsh(command, { ROLLBACK_SCRIPT: rollbackPath });
    expect(results).toEqual([
      { failAt: 'pause', ok: false, calls: ['pause'], completedHost: false },
      {
        failAt: 'disable',
        ok: false,
        calls: ['pause', 'disable'],
        completedHost: false
      },
      {
        failAt: 'api',
        ok: false,
        calls: ['pause', 'disable', 'api'],
        completedHost: false
      },
      {
        failAt: 'worker',
        ok: false,
        calls: ['pause', 'disable', 'api', 'worker'],
        completedHost: false
      },
      {
        failAt: 'token',
        ok: false,
        calls: ['pause', 'disable', 'api', 'worker', 'token'],
        completedHost: false
      },
      {
        failAt: 'none',
        ok: true,
        calls: [
          'pause',
          'disable',
          'api',
          'worker',
          'token',
          'hosting-release'
        ],
        completedHost: true
      }
    ]);
  });

  it('aborts cal-pilot-build-images.ps1 immediately on any native failure', () => {
    const buildPath = fileURLToPath(
      new URL('./cal-pilot-build-images.ps1', import.meta.url)
    );
    const sha = 'a'.repeat(40);
    const command = [
      "$ErrorActionPreference = 'Stop'",
      'Set-StrictMode -Version Latest',
      "$env:PATH = ''",
      '$cases = @("rev-parse", "status", "builds-submit", "describe-api", "describe-worker", "none")',
      'function git {',
      '  if ($args[0] -eq "rev-parse") {',
      '    $global:testCalls += "rev-parse"',
      '    if ($global:testFailAt -eq "rev-parse") { $global:LASTEXITCODE = 128 } else { $global:LASTEXITCODE = 0; $env:TEST_SHA }',
      '  } elseif ($args[0] -eq "status") {',
      '    $global:testCalls += "status"',
      '    if ($global:testFailAt -eq "status") { $global:LASTEXITCODE = 128 } else { $global:LASTEXITCODE = 0 }',
      '  }',
      '}',
      'function gcloud {',
      '  if ($args[0] -eq "builds") {',
      '    $global:testCalls += "builds-submit"',
      '    if ($global:testFailAt -eq "builds-submit") { $global:LASTEXITCODE = 1 } else { $global:LASTEXITCODE = 0 }',
      '  } elseif ($args[3] -like "*/api:*") {',
      '    $global:testCalls += "describe-api"',
      '    if ($global:testFailAt -eq "describe-api") { $global:LASTEXITCODE = 1 } else { $global:LASTEXITCODE = 0; "sha256:" + ("b" * 64) }',
      '  } elseif ($args[3] -like "*/worker:*") {',
      '    $global:testCalls += "describe-worker"',
      '    if ($global:testFailAt -eq "describe-worker") { $global:LASTEXITCODE = 1 } else { $global:LASTEXITCODE = 0; "sha256:" + ("c" * 64) }',
      '  }',
      '}',
      'function Write-Host([object]$Object) { $global:testHosts += [string]$Object }',
      '$results = @(foreach ($failAt in $cases) {',
      '  $global:testFailAt = $failAt',
      '  $global:testCalls = @()',
      '  $global:testHosts = @()',
      '  $ok = $false',
      '  try {',
      '    & $env:BUILD_SCRIPT -Commit $env:TEST_SHA -ConfirmBuild',
      '    $ok = $true',
      '  } catch {',
      '    $ok = $false',
      '  }',
      '  $joined = $global:testHosts -join "`n"',
      '  [PSCustomObject]@{',
      '    failAt = $failAt',
      '    ok = $ok',
      '    calls = @($global:testCalls)',
      '    emittedImages = ($joined -like "*API_IMAGE=*" -and $joined -like "*WORKER_IMAGE=*")',
      '  }',
      '})',
      '[Console]::WriteLine((ConvertTo-Json -InputObject $results -Depth 5 -Compress))'
    ].join('\n');

    const results = runPwsh(command, {
      BUILD_SCRIPT: buildPath,
      TEST_SHA: sha
    });
    expect(results).toEqual([
      {
        failAt: 'rev-parse',
        ok: false,
        calls: ['rev-parse'],
        emittedImages: false
      },
      {
        failAt: 'status',
        ok: false,
        calls: ['rev-parse', 'status'],
        emittedImages: false
      },
      {
        failAt: 'builds-submit',
        ok: false,
        calls: ['rev-parse', 'status', 'builds-submit'],
        emittedImages: false
      },
      {
        failAt: 'describe-api',
        ok: false,
        calls: ['rev-parse', 'status', 'builds-submit', 'describe-api'],
        emittedImages: false
      },
      {
        failAt: 'describe-worker',
        ok: false,
        calls: [
          'rev-parse',
          'status',
          'builds-submit',
          'describe-api',
          'describe-worker'
        ],
        emittedImages: false
      },
      {
        failAt: 'none',
        ok: true,
        calls: [
          'rev-parse',
          'status',
          'builds-submit',
          'describe-api',
          'describe-worker'
        ],
        emittedImages: true
      }
    ]);
  });

  it('fetches missing candidate commits without failing Assert-CandidateSha probe', () => {
    const runtimeSource = readScript('cal-pilot-runtime-update.ps1');
    const helper = runtimeSource.match(
      /^function Assert-CandidateSha \{[\s\S]*?^\}/mu
    )?.[0];
    expect(helper).toBeDefined();

    const sha = 'd'.repeat(40);
    const command = [
      "$ErrorActionPreference = 'Stop'",
      'Set-StrictMode -Version Latest',
      "$env:PATH = ''",
      '$PSNativeCommandUseErrorActionPreference = $true',
      '$CandidateSha = $env:TEST_SHA',
      'function git {',
      '  $script:gitLog += [PSCustomObject]@{ cmd = $args[0]; pref = $PSNativeCommandUseErrorActionPreference }',
      '  $idx = $script:gitLog.Count',
      '  switch ($script:scenario) {',
      '    "present" { $global:LASTEXITCODE = 0 }',
      '    "fetch-ok" { $global:LASTEXITCODE = if ($idx -eq 1) { 1 } else { 0 } }',
      '    "fetch-fail" { $global:LASTEXITCODE = if ($idx -eq 1) { 1 } else { 128 } }',
      '    "post-fetch-missing" { $global:LASTEXITCODE = if ($idx -eq 2) { 0 } else { 1 } }',
      '  }',
      '}',
      helper,
      '$results = @(foreach ($name in @("present", "fetch-ok", "fetch-fail", "post-fetch-missing")) {',
      '  $script:scenario = $name',
      '  $script:gitLog = @()',
      '  $PSNativeCommandUseErrorActionPreference = $true',
      '  $ok = $false',
      '  try {',
      '    Assert-CandidateSha',
      '    $ok = $true',
      '  } catch {',
      '    $ok = $false',
      '  }',
      '  [PSCustomObject]@{',
      '    scenario = $name',
      '    ok = $ok',
      '    prefAfter = $PSNativeCommandUseErrorActionPreference',
      '    log = @($script:gitLog)',
      '  }',
      '})',
      '[Console]::WriteLine((ConvertTo-Json -InputObject $results -Depth 6 -Compress))'
    ].join('\n');

    const results = runPwsh(command, { TEST_SHA: sha });
    expect(results).toEqual([
      {
        scenario: 'present',
        ok: true,
        prefAfter: true,
        log: [{ cmd: 'cat-file', pref: false }]
      },
      {
        scenario: 'fetch-ok',
        ok: true,
        prefAfter: true,
        log: [
          { cmd: 'cat-file', pref: false },
          { cmd: 'fetch', pref: true },
          { cmd: 'cat-file', pref: true }
        ]
      },
      {
        scenario: 'fetch-fail',
        ok: false,
        prefAfter: true,
        log: [
          { cmd: 'cat-file', pref: false },
          { cmd: 'fetch', pref: true }
        ]
      },
      {
        scenario: 'post-fetch-missing',
        ok: false,
        prefAfter: true,
        log: [
          { cmd: 'cat-file', pref: false },
          { cmd: 'fetch', pref: true },
          { cmd: 'cat-file', pref: true }
        ]
      }
    ]);
  });

  it('requires a unique Hosting channel readback in cal-pilot-release.ps1', () => {
    const releaseSource = readScript('cal-pilot-release.ps1');
    const helper = releaseSource.match(
      /^function Get-HostingChannel \{[\s\S]*?^\}/mu
    )?.[0];
    expect(helper).toBeDefined();

    const target = {
      name: 'projects/synthetic/sites/synthetic/channels/cal-pilot',
      url: 'https://synthetic--cal-pilot-abc123.web.app'
    };
    const inputs = [
      { channels: [] },
      { channels: [target] },
      { channels: [target, target] }
    ];
    const command = [
      "$ErrorActionPreference = 'Stop'",
      'Set-StrictMode -Version Latest',
      "$env:PATH = ''",
      "$projectId = 'synthetic'",
      "$channel = 'cal-pilot'",
      'function firebase { $script:syntheticPayload }',
      helper,
      '$inputs = ConvertFrom-Json $env:SYNTHETIC_CHANNELS',
      '$results = @(foreach ($testCase in $inputs) {',
      '  $script:syntheticPayload = @{ result = $testCase } | ConvertTo-Json -Depth 10 -Compress',
      '  try {',
      '    $selected = Get-HostingChannel',
      '    [PSCustomObject]@{ accepted = $true; url = [string]$selected.url }',
      '  } catch {',
      "    [PSCustomObject]@{ accepted = $false; url = '' }",
      '  }',
      '})',
      '[Console]::WriteLine((ConvertTo-Json -InputObject $results -Compress))'
    ].join('\n');

    const results = runPwsh(command, {
      SYNTHETIC_CHANNELS: JSON.stringify(inputs)
    });
    expect(results).toEqual([
      { accepted: false, url: '' },
      { accepted: true, url: target.url },
      { accepted: false, url: '' }
    ]);
  });
});

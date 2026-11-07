import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const entryPoints = [
  'cal-pilot-release.ps1',
  'cal-pilot-update.ps1',
  'cal-pilot-runtime-update.ps1'
];
const readScript = (name) =>
  readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
export const oracleCaseCount =
  entryPoints.length * 2 +
  2 +
  8 +
  1 +
  1 +
  2 +
  6 +
  6 +
  (entryPoints.length - 1) * 8;

export function assertPinnedEntryPoints() {
  for (const name of entryPoints) {
    const source = readScript(name);
    assert.equal(
      /:latest\b/u.test(source),
      false,
      `${name} retains a mutable binding`
    );
    assert.equal(
      /\. "\$PSScriptRoot\/pinned-secret-bindings\.ps1"/u.test(source),
      true,
      `${name} omits the pure helper`
    );
    for (const component of ['api', 'worker']) {
      assert.equal(
        new RegExp(
          `\\$${component}SecretBindings = Get-PinnedSecretBindings \\$approvedSecretVersions @\\(`,
          'u'
        ).test(source),
        true,
        `${name} omits the ${component} binding expression`
      );
      assert.equal(
        new RegExp(
          `--(?:set|update)-secrets['"]?,? \\$${component}SecretBindings`,
          'u'
        ).test(source),
        true,
        `${name} does not consume the ${component} bindings`
      );
    }
  }
}

export function runPinnedBindingsOracle() {
  const helper = readScript('pinned-secret-bindings.ps1');
  const fragments = entryPoints.map((name) => {
    const source = readScript(name);
    const matches = [
      ...source.matchAll(
        /^\$(?:api|worker)SecretBindings = Get-PinnedSecretBindings \$approvedSecretVersions @\([\s\S]*?^\)/gmu
      )
    ];
    assert.equal(
      matches.length,
      2,
      `${name} must expose both actual binding expressions`
    );
    return { name, source: matches.map(([match]) => match).join('\n') };
  });
  const validators = entryPoints.slice(1).map((name) => {
    const source = readScript(name).match(
      /^function Assert-SecretVersions \{[\s\S]*?^\}/mu
    )?.[0];
    assert.notEqual(source, undefined, `${name} omits version admission`);
    return { name, source };
  });
  // Only pure value helpers, selected binding expressions and the admission
  // functions run. Get-Content and gcloud are in-process fakes; no operational
  // entrypoint, native SDK, credential file or provider is invoked.
  const command = `
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$env:PATH = ''
${helper}
$rows = [Collections.Generic.List[object]]::new()
function Add-Row([string]$Id, [bool]$Passed) {
  $rows.Add([pscustomobject]@{ id = $Id; passed = $Passed })
}
$approvedSecretVersions = @{
  'cal-pilot-manager-allowlist' = '11'
  'cal-pilot-firebase-web-api-key' = '13'
  'cal-pilot-reader-service-account' = '17'
  'cal-pilot-writer-service-account' = '19'
  'cal-pilot-source-map' = '23'
  'cal-pilot-pseudonym-key' = '29'
}
${fragments
  .map(
    ({ name, source }) => `
${source}
Add-Row '${name}-api' ($apiSecretBindings -ceq 'CALENDAR_PILOT_MANAGER_EMAILS=cal-pilot-manager-allowlist:11,CALENDAR_PILOT_FIREBASE_WEB_API_KEY=cal-pilot-firebase-web-api-key:13')
Add-Row '${name}-worker' ($workerSecretBindings -ceq 'CALENDAR_PILOT_READER_SERVICE_ACCOUNT_JSON=cal-pilot-reader-service-account:17,CALENDAR_PILOT_WRITER_SERVICE_ACCOUNT_JSON=cal-pilot-writer-service-account:19,CALENDAR_PILOT_SOURCE_MAP_JSON=cal-pilot-source-map:23,CALENDAR_PILOT_PSEUDONYM_KEY=cal-pilot-pseudonym-key:29')
`
  )
  .join('\n')}
$versions = @{ 'synthetic-container' = '17' }
$binding = Get-PinnedSecretBindings $versions @('SYNTHETIC_VALUE=synthetic-container')
$versions['synthetic-container'] = '31'
Add-Row 'immutable-binding-snapshot' ($binding -ceq 'SYNTHETIC_VALUE=synthetic-container:17')
Add-Row 'integer-version' ((Assert-PinnedSecretVersion 17) -ceq '17')
foreach ($value in @('latest', '0', '-1', '01', '1.0', '1/2', '', "17\n")) {
  $denied = $false
  try { $null = Assert-PinnedSecretVersion $value } catch { $denied = $true }
  Add-Row "denied-version-$($rows.Count)" $denied
}
$denied = $false
try { $null = Get-PinnedSecretBindings @{} @('SYNTHETIC_VALUE=synthetic-container') } catch { $denied = $true }
Add-Row 'missing-version-denied' $denied
$denied = $false
try { $null = Get-PinnedSecretBindings $versions @('SYNTHETIC_VALUE=synthetic-container', 'SYNTHETIC_VALUE=synthetic-container') } catch { $denied = $true }
Add-Row 'duplicate-environment-denied' $denied
$resource = 'projects/synthetic-project/secrets/synthetic-container/versions/29'
Add-Row 'owned-version-metadata' ((ConvertTo-PinnedSecretVersion $resource 'synthetic-container' 'synthetic-project') -ceq '29')
Add-Row 'owned-project-number' ((ConvertTo-PinnedSecretVersion 'projects/123456/secrets/synthetic-container/versions/29' 'synthetic-container' @('synthetic-project', '123456')) -ceq '29')
foreach ($invalid in @(
  'projects/synthetic-project/secrets/synthetic-container/versions/latest',
  'projects/654321/secrets/synthetic-container/versions/29',
  'projects/other-project/secrets/synthetic-container/versions/29',
  'projects/synthetic-project/secrets/other-container/versions/29',
  'projects/synthetic-project/secrets/synthetic-container/versions/0',
  ''
)) {
  $denied = $false
  try { $null = ConvertTo-PinnedSecretVersion $invalid 'synthetic-container' 'synthetic-project' } catch { $denied = $true }
  Add-Row "denied-metadata-$($rows.Count)" $denied
}
Add-Row 'absent-container-version' ($null -eq (Get-ApprovedExistingSecretVersion @() '' 'synthetic-container' 'synthetic-project'))
Add-Row 'approved-existing-version' ((Get-ApprovedExistingSecretVersion @($resource) '29' 'synthetic-container' 'synthetic-project') -ceq '29')
foreach ($scenario in @('missing-existing', 'missing-approval', 'existing-drift', 'multiple-existing')) {
  $resources = @($resource)
  $expected = '29'
  if ($scenario -eq 'missing-existing') { $resources = @() }
  if ($scenario -eq 'missing-approval') { $expected = '' }
  if ($scenario -eq 'existing-drift') { $expected = '17' }
  if ($scenario -eq 'multiple-existing') { $resources = @($resource, $resource) }
  $denied = $false
  try { $null = Get-ApprovedExistingSecretVersion $resources $expected 'synthetic-container' 'synthetic-project' } catch { $denied = $true }
  Add-Row $scenario $denied
}
$projectId = 'synthetic-project'
$ExpectedSecretVersionManifest = 'synthetic-version-manifest'
$approvedSecrets = @($approvedSecretVersions.Keys)
function Get-Content([string]$LiteralPath, [switch]$Raw) {
  if ($LiteralPath -cne 'synthetic-version-manifest' -or -not $Raw) { throw 'Unexpected file access in synthetic oracle.' }
  return ConvertTo-Json -InputObject $script:manifest -Compress
}
function gcloud {
  if ($args[0] -cne 'secrets' -or $args[1] -cne 'versions' -or $args[2] -cne 'list' -or $args[4] -cne '--project' -or $args[5] -cne 'synthetic-project') {
    throw 'Unexpected SDK operation in synthetic oracle.'
  }
  return $script:enabled[$args[3]]
}
function Reset-SyntheticVersions {
  $script:manifest = $approvedSecretVersions.Clone()
  $script:enabled = @{}
  foreach ($name in $approvedSecrets) {
    $script:enabled[$name] = @("projects/synthetic-project/secrets/$name/versions/$($script:manifest[$name])")
  }
}
${validators
  .map(
    ({ name, source }) => `
${source}
Reset-SyntheticVersions
$snapshot = Assert-SecretVersions
Add-Row '${name}-approved-snapshot' ($snapshot -is [hashtable] -and $snapshot.Count -eq 6)
foreach ($scenario in @('missing', 'unknown', 'alias', 'zero', 'drift', 'disabled', 'ambiguous')) {
  Reset-SyntheticVersions
  $first = $approvedSecrets[0]
  if ($scenario -eq 'missing') { $script:manifest.Remove($first) }
  if ($scenario -eq 'unknown') { $script:manifest.Remove($first); $script:manifest['synthetic-unapproved'] = '17' }
  if ($scenario -eq 'alias') { $script:manifest[$first] = 'latest'; $script:enabled[$first] = @('latest') }
  if ($scenario -eq 'zero') { $script:manifest[$first] = '0'; $script:enabled[$first] = @('0') }
  if ($scenario -eq 'drift') { $script:enabled[$first] = @('83') }
  if ($scenario -eq 'disabled') { $script:enabled[$first] = @() }
  if ($scenario -eq 'ambiguous') { $script:enabled[$first] = @($script:manifest[$first], '83') }
  $denied = $false
  try { $null = Assert-SecretVersions } catch { $denied = $true }
  Add-Row ('${name}-' + $scenario) $denied
}
`
  )
  .join('\n')}
ConvertTo-Json -InputObject @($rows.ToArray()) -Compress
`;
  const result = spawnSync(
    'pwsh',
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command],
    {
      encoding: 'utf8',
      timeout: 10_000,
      windowsHide: true
    }
  );
  if (result.error !== undefined) {
    throw new Error(
      `Pure PowerShell oracle unavailable: ${result.error.code ?? 'unknown'}`
    );
  }
  assert.equal(
    result.status,
    0,
    result.stderr || 'Pure PowerShell oracle failed'
  );
  const rows = JSON.parse(result.stdout.replace(/^\uFEFF/u, '').trim());
  assert.equal(rows.length, oracleCaseCount);
  assert.equal(new Set(rows.map(({ id }) => id)).size, rows.length);
  return rows;
}

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  assertPinnedEntryPoints();
  const rows = runPinnedBindingsOracle();
  for (const row of rows) assert.equal(row.passed, true, row.id);
  console.log(
    JSON.stringify({
      status: 'PASS',
      assertions: rows.length,
      cloudCommands: 0,
      credentialsRead: 0
    })
  );
}

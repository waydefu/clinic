[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$ApprovedCommit,
  [Parameter(Mandatory = $true)][string]$ExpectedApiRevision,
  [Parameter(Mandatory = $true)][string]$ExpectedWorkerRevision,
  [Parameter(Mandatory = $true)][string]$ExpectedApiImage,
  [Parameter(Mandatory = $true)][string]$ExpectedWorkerImage,
  [Parameter(Mandatory = $true)][string]$ExpectedHostingVersion,
  [Parameter(Mandatory = $true)][string]$ExpectedSecretVersionManifest,
  [Parameter(Mandatory = $true)][ValidateRange(1, [int]::MaxValue)][int]$ExpectedSourceGeneration,
  [Parameter(Mandatory = $true)][string]$ExpectedCurrentExpiry,
  [Parameter(Mandatory = $true)][string]$ExtendedExpiry,
  [switch]$ConfirmApply
)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
$projectId = 'beauessence-clinic-staging'
$region = 'asia-east1'
$channel = 'cal-pilot'
$approvedCurrentExpiry = '2026-09-29T04:51:37Z'
$approvedExtendedExpiry = '2026-11-28T04:51:37Z'
$approvedSecrets = @(
  'cal-pilot-manager-allowlist',
  'cal-pilot-firebase-web-api-key',
  'cal-pilot-reader-service-account',
  'cal-pilot-writer-service-account',
  'cal-pilot-source-map',
  'cal-pilot-pseudonym-key'
)

if ($ApprovedCommit -notmatch '^[a-f0-9]{40}$' -or (git rev-parse HEAD).Trim() -ne $ApprovedCommit) {
  throw 'The working tree is not on the approved exact commit.'
}
if ((git status --porcelain).Length -ne 0) { throw 'Extension requires a clean exact commit.' }
if ($ExpectedCurrentExpiry -ne $approvedCurrentExpiry -or $ExtendedExpiry -ne $approvedExtendedExpiry) {
  throw 'The expiry transition does not match the approved 60-day extension.'
}
if ($ExpectedApiRevision -notmatch '^cal-pilot-api-[a-z0-9-]+$' -or $ExpectedWorkerRevision -notmatch '^cal-pilot-worker-[a-z0-9-]+$') {
  throw 'Expected Cloud Run revisions are invalid.'
}
if ($ExpectedApiImage -notmatch '@sha256:[a-f0-9]{64}$' -or $ExpectedWorkerImage -notmatch '@sha256:[a-f0-9]{64}$') {
  throw 'Expected Cloud Run images must be immutable digests.'
}
if ($ExpectedHostingVersion -notmatch '^projects/beauessence-clinic-staging/sites/beauessence-clinic-staging/versions/[a-z0-9]+$') {
  throw 'Expected Hosting version is invalid.'
}
if (-not (Test-Path -LiteralPath $ExpectedSecretVersionManifest -PathType Leaf)) {
  throw 'Expected Secret version manifest was not found.'
}

function Assert-RunService([string]$Name, [string]$Revision, [string]$Image) {
  $service = gcloud run services describe $Name --project $projectId --region $region --format json | ConvertFrom-Json
  $traffic = @($service.status.traffic | Where-Object { $_.revisionName -eq $Revision -and $_.percent -eq 100 })
  if ($traffic.Count -ne 1) { throw "$Name is not serving the expected revision at 100 percent." }
  $deployedImage = [string]$service.spec.template.spec.containers[0].image
  if ($deployedImage -ne $Image) { throw "$Name image drifted from the approved digest." }
}

function Get-HostingVersion {
  $channels = firebase hosting:channel:list --project $projectId --json | ConvertFrom-Json
  $current = @($channels.result.channels | Where-Object { $_.name -eq "projects/$projectId/sites/$projectId/channels/$channel" })
  if ($current.Count -ne 1) { throw 'CAL-PILOT Hosting channel was not found.' }
  return [string]$current[0].release.version.name
}

function Assert-SecretVersions {
  $manifest = Get-Content -LiteralPath $ExpectedSecretVersionManifest -Raw | ConvertFrom-Json -AsHashtable
  if ($manifest.Keys.Count -ne $approvedSecrets.Count) {
    throw 'Secret version manifest must contain exactly the six approved containers.'
  }
  foreach ($secretName in $approvedSecrets) {
    if (-not $manifest.ContainsKey($secretName) -or [string]$manifest[$secretName] -notmatch '^\d+$') {
      throw "Secret version manifest is invalid for $secretName."
    }
    $enabledVersions = @(gcloud secrets versions list $secretName --project $projectId --filter 'state=ENABLED' --format 'value(name)' | ForEach-Object { ($_ -split '/')[-1] })
    if ($enabledVersions.Count -ne 1 -or [string]$enabledVersions[0] -ne [string]$manifest[$secretName]) {
      throw "$secretName enabled version drifted from the approved manifest."
    }
  }
}

Assert-RunService 'cal-pilot-api' $ExpectedApiRevision $ExpectedApiImage
Assert-RunService 'cal-pilot-worker' $ExpectedWorkerRevision $ExpectedWorkerImage
if ((Get-HostingVersion) -ne $ExpectedHostingVersion) { throw 'Hosting version drifted from the approved baseline.' }
Assert-SecretVersions
$scheduler = gcloud scheduler jobs describe cal-pilot-five-minute-sync --project $projectId --location $region --format json | ConvertFrom-Json
if ($scheduler.state -ne 'ENABLED' -or $scheduler.schedule -ne '*/5 * * * *') {
  throw 'The five-minute Scheduler boundary is not intact.'
}
if (-not $ConfirmApply) {
  throw 'Preflight passed; review-only mode made no changes. Re-run with -ConfirmApply after the exact extension candidate is approved.'
}

$env:GOOGLE_CLOUD_PROJECT = $projectId
$env:CALENDAR_PILOT_EXPECTED_CURRENT_EXPIRY = $ExpectedCurrentExpiry
$env:CALENDAR_PILOT_EXTENDED_EXPIRY = $ExtendedExpiry
$env:CALENDAR_PILOT_EXPECTED_SOURCE_GENERATION = [string]$ExpectedSourceGeneration
$env:CALENDAR_PILOT_CONFIRM_EXTENSION = 'YES'
try { node scripts/extend-cal-pilot.mjs }
finally {
  Remove-Item Env:CALENDAR_PILOT_CONFIRM_EXTENSION -ErrorAction SilentlyContinue
  Remove-Item Env:CALENDAR_PILOT_EXPECTED_CURRENT_EXPIRY -ErrorAction SilentlyContinue
  Remove-Item Env:CALENDAR_PILOT_EXTENDED_EXPIRY -ErrorAction SilentlyContinue
  Remove-Item Env:CALENDAR_PILOT_EXPECTED_SOURCE_GENERATION -ErrorAction SilentlyContinue
}

Assert-RunService 'cal-pilot-api' $ExpectedApiRevision $ExpectedApiImage
Assert-RunService 'cal-pilot-worker' $ExpectedWorkerRevision $ExpectedWorkerImage
if ((Get-HostingVersion) -ne $ExpectedHostingVersion) { throw 'Hosting changed during expiry extension.' }
Assert-SecretVersions
Write-Host "CAL-PILOT application expiry extended to $ExtendedExpiry; Cloud Run and Hosting content are unchanged."

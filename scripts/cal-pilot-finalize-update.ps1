[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$ApprovedCommit,
  [Parameter(Mandatory = $true)][string]$ExpectedApiRevision,
  [Parameter(Mandatory = $true)][string]$ExpectedApiImage,
  [Parameter(Mandatory = $true)][string]$ExpectedWorkerRevision,
  [Parameter(Mandatory = $true)][string]$ExpectedWorkerImage,
  [Parameter(Mandatory = $true)][string]$ExpectedHostingVersion,
  [Parameter(Mandatory = $true)][string]$ExpectedHostingExpiry,
  [Parameter(Mandatory = $true)][string]$ExpectedPreviewUrl,
  [Parameter(Mandatory = $true)][string]$ExpectedSecretVersionManifest,
  [Parameter(Mandatory = $true)][ValidateRange(1, [int]::MaxValue)][int]$ExpectedSourceGeneration,
  [Parameter(Mandatory = $true)][ValidateRange(1, 100)][int]$ExpectedRegeneratedCandidateCount,
  [switch]$ConfirmApply
)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
$projectId = 'beauessence-clinic-staging'
$region = 'asia-east1'
$channel = 'cal-pilot'
$expectedApplicationExpiry = '2026-11-28T04:51:37Z'
$expectedSchedulerMember = "serviceAccount:cal-pilot-scheduler@$projectId.iam.gserviceaccount.com"
$approvedSecrets = @(
  'cal-pilot-manager-allowlist',
  'cal-pilot-firebase-web-api-key',
  'cal-pilot-reader-service-account',
  'cal-pilot-writer-service-account',
  'cal-pilot-source-map',
  'cal-pilot-pseudonym-key'
)

function Assert-ImmutableImage([string]$Image, [string]$Component, [string]$Label) {
  if ($Image -notmatch "^$region-docker\.pkg\.dev/$projectId/cal-pilot/$Component@sha256:[a-f0-9]{64}$") {
    throw "$Label must be an approved immutable CAL-PILOT image digest."
  }
}

function Get-ActiveRunState([string]$Name) {
  $service = gcloud run services describe $Name --project $projectId --region $region --format json | ConvertFrom-Json
  $traffic = @($service.status.traffic | Where-Object { $_.percent -eq 100 })
  if ($traffic.Count -ne 1) { throw "$Name does not have exactly one 100 percent revision." }
  $revisionName = [string]$traffic[0].revisionName
  $revision = gcloud run revisions describe $revisionName --project $projectId --region $region --format json | ConvertFrom-Json
  $image = [string]$revision.status.imageDigest
  if ([string]::IsNullOrWhiteSpace($image)) { $image = [string]$revision.spec.containers[0].image }
  return [pscustomobject]@{
    revision = $revisionName
    image = $image
  }
}

function Get-HostingChannel {
  $channels = firebase hosting:channel:list --project $projectId --json | ConvertFrom-Json
  $current = @($channels.result.channels | Where-Object { $_.name -eq "projects/$projectId/sites/$projectId/channels/$channel" })
  if ($current.Count -ne 1) { throw 'CAL-PILOT Hosting channel was not found.' }
  return $current[0]
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

function Assert-WorkerInvokerBoundary {
  $policy = gcloud run services get-iam-policy cal-pilot-worker --project $projectId --region $region --format json | ConvertFrom-Json
  $members = @(
    $policy.bindings |
      Where-Object { $_.role -eq 'roles/run.invoker' } |
      ForEach-Object { @($_.members) }
  ) | Sort-Object -Unique
  if ($members.Count -ne 1 -or [string]$members[0] -ne $expectedSchedulerMember) {
    throw 'Private Worker invoker boundary is not Scheduler-only.'
  }
}

function Get-PilotState {
  $env:GOOGLE_CLOUD_PROJECT = $projectId
  return node scripts/report-cal-pilot-state.mjs | ConvertFrom-Json
}

function Assert-SafeStoppedState {
  $scheduler = gcloud scheduler jobs describe cal-pilot-five-minute-sync --project $projectId --location $region --format json | ConvertFrom-Json
  if ($scheduler.state -ne 'PAUSED' -or $scheduler.schedule -ne '*/5 * * * *' -or $scheduler.attemptDeadline -ne '240s') {
    throw 'The five-minute Scheduler is not in the approved paused state.'
  }
  $state = Get-PilotState
  if (
    $state.expiresAt -ne $expectedApplicationExpiry -or
    $state.generation -ne $ExpectedSourceGeneration -or
    $state.health -ne 'degraded' -or
    $state.inboundEnabled -ne $false -or
    $state.outboundEnabled -ne $false -or
    $state.enabledSourceCount -ne 2 -or
    $state.activeSourceIsEnabled -ne $true -or
    $state.legacyCandidateCount -ne 0 -or
    $state.candidateStatus.pending -ne 30 -or
    @($state.jobStatus.PSObject.Properties).Count -ne 0
  ) {
    throw 'CAL-PILOT post-migration safe-stop state drifted.'
  }
}

if ($ApprovedCommit -notmatch '^[a-f0-9]{40}$' -or (git rev-parse HEAD).Trim() -ne $ApprovedCommit) {
  throw 'The working tree is not on the approved exact commit.'
}
if ((git status --porcelain).Length -ne 0) { throw 'Finalization requires a clean exact commit.' }
Assert-ImmutableImage $ExpectedApiImage 'api' 'API image'
Assert-ImmutableImage $ExpectedWorkerImage 'worker' 'Worker image'
if ($ExpectedApiRevision -notmatch '^cal-pilot-api-[a-z0-9-]+$' -or $ExpectedWorkerRevision -notmatch '^cal-pilot-worker-[a-z0-9-]+$') {
  throw 'Expected Cloud Run revisions are invalid.'
}
if ($ExpectedHostingVersion -notmatch '^projects/beauessence-clinic-staging/sites/beauessence-clinic-staging/versions/[a-z0-9]+$') {
  throw 'Expected Hosting version is invalid.'
}
if ($ExpectedPreviewUrl -notmatch '^https://beauessence-clinic-staging--cal-pilot-[a-z0-9]+\.web\.app/?$') {
  throw 'Expected CAL-PILOT preview URL is invalid.'
}
if (-not (Test-Path -LiteralPath $ExpectedSecretVersionManifest -PathType Leaf)) {
  throw 'Expected Secret version manifest was not found.'
}

Assert-SafeStoppedState
$api = Get-ActiveRunState 'cal-pilot-api'
$worker = Get-ActiveRunState 'cal-pilot-worker'
if ($api.revision -ne $ExpectedApiRevision -or $api.image -ne $ExpectedApiImage) {
  throw 'Active API revision drifted from the reviewed post-migration target.'
}
if ($worker.revision -ne $ExpectedWorkerRevision -or $worker.image -ne $ExpectedWorkerImage) {
  throw 'Active Worker revision drifted from the reviewed post-migration target.'
}
$hosting = Get-HostingChannel
if (
  [string]$hosting.release.version.name -ne $ExpectedHostingVersion -or
  [string]$hosting.expireTime -ne $ExpectedHostingExpiry -or
  [string]$hosting.url -ne $ExpectedPreviewUrl
) {
  throw 'Hosting post-migration release drifted.'
}
Assert-SecretVersions
Assert-WorkerInvokerBoundary
if ((Invoke-WebRequest -UseBasicParsing -Uri "$ExpectedPreviewUrl/v1/health").StatusCode -ne 200) {
  throw 'Hosting-to-API health smoke failed.'
}
$env:CALENDAR_PILOT_EXPECTED_LEGACY_CANDIDATES = [string]$ExpectedRegeneratedCandidateCount
$env:CALENDAR_PILOT_EXPECTED_SOURCE_GENERATION = [string]$ExpectedSourceGeneration
$env:CALENDAR_PILOT_LEGACY_MIGRATION_MODE = 'verify'
try { node scripts/migrate-cal-pilot-legacy-candidates.mjs }
finally {
  Remove-Item Env:CALENDAR_PILOT_EXPECTED_LEGACY_CANDIDATES -ErrorAction SilentlyContinue
  Remove-Item Env:CALENDAR_PILOT_EXPECTED_SOURCE_GENERATION -ErrorAction SilentlyContinue
  Remove-Item Env:CALENDAR_PILOT_LEGACY_MIGRATION_MODE -ErrorAction SilentlyContinue
}

if (-not $ConfirmApply) {
  throw 'Post-migration finalization preflight passed; no changes made. Re-run with -ConfirmApply for this exact state.'
}

$safeStopRequired = $true
try {
  $env:GOOGLE_CLOUD_PROJECT = $projectId
  node scripts/activate-cal-pilot.mjs
  gcloud scheduler jobs resume cal-pilot-five-minute-sync --project $projectId --location $region --quiet | Out-Null
  $postState = Get-PilotState
  $postScheduler = gcloud scheduler jobs describe cal-pilot-five-minute-sync --project $projectId --location $region --format json | ConvertFrom-Json
  if (
    $postState.inboundEnabled -ne $true -or
    $postState.outboundEnabled -ne $true -or
    $postState.health -notin @('idle', 'syncing', 'healthy') -or
    $postScheduler.state -ne 'ENABLED' -or
    $postScheduler.schedule -ne '*/5 * * * *'
  ) {
    throw 'CAL-PILOT did not reach the approved active state.'
  }
  $safeStopRequired = $false
  Write-Host "CAL-PILOT finalization ready: API_REVISION=$ExpectedApiRevision WORKER_REVISION=$ExpectedWorkerRevision HOSTING_VERSION=$ExpectedHostingVersion PREVIEW_URL=$ExpectedPreviewUrl"
} catch {
  if ($safeStopRequired) {
    try { gcloud scheduler jobs pause cal-pilot-five-minute-sync --project $projectId --location $region --quiet | Out-Null } catch {}
    try { $env:GOOGLE_CLOUD_PROJECT = $projectId; node scripts/disable-cal-pilot.mjs } catch {}
  }
  throw
}

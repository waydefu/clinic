[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$PreviousApiRevision,
  [Parameter(Mandatory = $true)][string]$PreviousWorkerRevision,
  [Parameter(Mandatory = $true)][string]$PreviousHostingVersion,
  [switch]$ConfirmRollback
)

$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -lt 7) {
  throw 'PowerShell 7+ (pwsh) is required.'
}
$PSNativeCommandUseErrorActionPreference = $true
$projectId = 'beauessence-clinic-staging'
$region = 'asia-east1'
$channel = 'cal-pilot'

function Assert-LastExitCode([string]$Step) {
  if ($LASTEXITCODE -ne 0) {
    throw "$Step failed with exit code $LASTEXITCODE."
  }
}

if (-not $ConfirmRollback) { throw 'Rollback is review-only unless -ConfirmRollback is supplied.' }
if ($PreviousApiRevision -notmatch '^cal-pilot-api-[a-z0-9-]+$') { throw 'Invalid API revision.' }
if ($PreviousWorkerRevision -notmatch '^cal-pilot-worker-[a-z0-9-]+$') { throw 'Invalid worker revision.' }
if ($PreviousHostingVersion -notmatch '^sites/beauessence-clinic-staging/versions/[a-z0-9]+$') { throw 'Invalid Hosting version resource.' }

$global:LASTEXITCODE = 0
gcloud scheduler jobs pause cal-pilot-five-minute-sync --project $projectId --location $region
Assert-LastExitCode 'Pause scheduler job'

$env:GOOGLE_CLOUD_PROJECT = $projectId
$global:LASTEXITCODE = 0
node scripts/disable-cal-pilot.mjs
Assert-LastExitCode 'Disable CAL-PILOT flags'

$global:LASTEXITCODE = 0
gcloud run services update-traffic cal-pilot-api --project $projectId --region $region --to-revisions "$PreviousApiRevision=100"
Assert-LastExitCode 'Rollback API traffic'

$global:LASTEXITCODE = 0
gcloud run services update-traffic cal-pilot-worker --project $projectId --region $region --to-revisions "$PreviousWorkerRevision=100"
Assert-LastExitCode 'Rollback worker traffic'

$rawAccessToken = $null
$accessToken = $null
try {
  $global:LASTEXITCODE = 0
  $rawAccessToken = gcloud auth print-access-token
  Assert-LastExitCode 'Print gcloud access token'
  $accessToken = ([string]$rawAccessToken).Trim()
  if ([string]::IsNullOrWhiteSpace($accessToken)) {
    throw 'gcloud auth print-access-token returned an empty token.'
  }
  $encodedVersion = [Uri]::EscapeDataString($PreviousHostingVersion)
  $releaseUri = "https://firebasehosting.googleapis.com/v1beta1/sites/$projectId/channels/$channel/releases?versionName=$encodedVersion"
  Invoke-RestMethod -Method Post -Uri $releaseUri -Headers @{ Authorization = "Bearer $accessToken" } | Out-Null
} finally {
  $rawAccessToken = $null
  $accessToken = $null
}
Write-Host 'Rollback complete. Scheduler paused; inbound/outbound disabled; prior API, worker and Hosting versions restored. Firestore appointments and anonymous audit were retained.'

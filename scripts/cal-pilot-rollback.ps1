[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$PreviousApiRevision,
  [Parameter(Mandatory = $true)][string]$PreviousWorkerRevision,
  [Parameter(Mandatory = $true)][string]$PreviousHostingVersion,
  [switch]$ConfirmRollback
)

$ErrorActionPreference = 'Stop'
$projectId = 'beauessence-clinic-staging'
$region = 'asia-east1'
$channel = 'cal-pilot'
if (-not $ConfirmRollback) { throw 'Rollback is review-only unless -ConfirmRollback is supplied.' }
if ($PreviousApiRevision -notmatch '^cal-pilot-api-[a-z0-9-]+$') { throw 'Invalid API revision.' }
if ($PreviousWorkerRevision -notmatch '^cal-pilot-worker-[a-z0-9-]+$') { throw 'Invalid worker revision.' }
if ($PreviousHostingVersion -notmatch '^sites/beauessence-clinic-staging/versions/[a-z0-9]+$') { throw 'Invalid Hosting version resource.' }

gcloud scheduler jobs pause cal-pilot-five-minute-sync --project $projectId --location $region
$env:GOOGLE_CLOUD_PROJECT = $projectId
node scripts/disable-cal-pilot.mjs
gcloud run services update-traffic cal-pilot-api --project $projectId --region $region --to-revisions "$PreviousApiRevision=100"
gcloud run services update-traffic cal-pilot-worker --project $projectId --region $region --to-revisions "$PreviousWorkerRevision=100"

$accessToken = (gcloud auth print-access-token).Trim()
$encodedVersion = [Uri]::EscapeDataString($PreviousHostingVersion)
$releaseUri = "https://firebasehosting.googleapis.com/v1beta1/sites/$projectId/channels/$channel/releases?versionName=$encodedVersion"
Invoke-RestMethod -Method Post -Uri $releaseUri -Headers @{ Authorization = "Bearer $accessToken" } | Out-Null
$accessToken = $null
Write-Host 'Rollback complete. Scheduler paused; inbound/outbound disabled; prior API, worker and Hosting versions restored. Firestore appointments and anonymous audit were retained.'

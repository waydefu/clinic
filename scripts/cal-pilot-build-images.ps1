[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Commit,
  [switch]$ConfirmBuild
)

$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -lt 7) {
  throw 'PowerShell 7+ (pwsh) is required.'
}
$PSNativeCommandUseErrorActionPreference = $true
$projectId = 'beauessence-clinic-staging'
$region = 'asia-east1'
$repository = "$region-docker.pkg.dev/$projectId/cal-pilot"

function Assert-LastExitCode([string]$Step) {
  if ($LASTEXITCODE -ne 0) {
    throw "$Step failed with exit code $LASTEXITCODE."
  }
}

if (-not $ConfirmBuild) {
  throw 'Review-only by default. Re-run with -ConfirmBuild after the exact clean commit is approved.'
}
if ($Commit -notmatch '^[a-f0-9]{40}$') { throw 'Commit must be a full 40-character SHA.' }
$global:LASTEXITCODE = 0
$headSha = git rev-parse HEAD
Assert-LastExitCode 'Read git HEAD'
if (([string]$headSha).Trim() -ne $Commit) { throw 'HEAD does not match the requested image commit.' }

$global:LASTEXITCODE = 0
$statusOutput = @(git status --porcelain)
Assert-LastExitCode 'Check git working tree status'
if ($statusOutput.Count -ne 0) { throw 'Image build requires a clean working tree.' }

$global:LASTEXITCODE = 0
gcloud builds submit . `
  --project $projectId `
  --region $region `
  --config containers/cal-pilot.cloudbuild.yaml `
  --substitutions "_TAG=$Commit" `
  --service-account "projects/$projectId/serviceAccounts/cal-pilot-builder@$projectId.iam.gserviceaccount.com"
Assert-LastExitCode 'Cloud Build submit'

$global:LASTEXITCODE = 0
$rawApiDigest = gcloud artifacts docker images describe "$repository/api:$Commit" --project $projectId --format 'value(image_summary.digest)'
Assert-LastExitCode 'Describe API image digest'
$apiDigest = ([string]$rawApiDigest).Trim()

$global:LASTEXITCODE = 0
$rawWorkerDigest = gcloud artifacts docker images describe "$repository/worker:$Commit" --project $projectId --format 'value(image_summary.digest)'
Assert-LastExitCode 'Describe worker image digest'
$workerDigest = ([string]$rawWorkerDigest).Trim()

if ($apiDigest -notmatch '^sha256:[a-f0-9]{64}$' -or $workerDigest -notmatch '^sha256:[a-f0-9]{64}$') {
  throw 'Artifact Registry did not return both immutable digests.'
}

Write-Host "API_IMAGE=$repository/api@$apiDigest"
Write-Host "WORKER_IMAGE=$repository/worker@$workerDigest"

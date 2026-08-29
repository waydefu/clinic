[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Commit,
  [switch]$ConfirmBuild
)

$ErrorActionPreference = 'Stop'
$projectId = 'beauessence-clinic-staging'
$region = 'asia-east1'
$repository = "$region-docker.pkg.dev/$projectId/cal-pilot"

if (-not $ConfirmBuild) {
  throw 'Review-only by default. Re-run with -ConfirmBuild after the exact clean commit is approved.'
}
if ($Commit -notmatch '^[a-f0-9]{40}$') { throw 'Commit must be a full 40-character SHA.' }
if ((git rev-parse HEAD).Trim() -ne $Commit) { throw 'HEAD does not match the requested image commit.' }
if ((git status --porcelain).Length -ne 0) { throw 'Image build requires a clean working tree.' }

gcloud builds submit . `
  --project $projectId `
  --region $region `
  --config containers/cal-pilot.cloudbuild.yaml `
  --substitutions "_TAG=$Commit" `
  --service-account "projects/$projectId/serviceAccounts/cal-pilot-builder@$projectId.iam.gserviceaccount.com"

$apiDigest = (gcloud artifacts docker images describe "$repository/api:$Commit" --project $projectId --format 'value(image_summary.digest)').Trim()
$workerDigest = (gcloud artifacts docker images describe "$repository/worker:$Commit" --project $projectId --format 'value(image_summary.digest)').Trim()
if ($apiDigest -notmatch '^sha256:[a-f0-9]{64}$' -or $workerDigest -notmatch '^sha256:[a-f0-9]{64}$') {
  throw 'Artifact Registry did not return both immutable digests.'
}

Write-Host "API_IMAGE=$repository/api@$apiDigest"
Write-Host "WORKER_IMAGE=$repository/worker@$workerDigest"

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$ApiImage,
  [Parameter(Mandatory = $true)][string]$WorkerImage,
  [Parameter(Mandatory = $true)][string]$ExpiresAt,
  [Parameter(Mandatory = $true)][string]$ReaderKeyPath,
  [Parameter(Mandatory = $true)][string]$WriterKeyPath,
  [Parameter(Mandatory = $true)][string]$SourceMapPath,
  [Parameter(Mandatory = $true)][string]$ManagerAllowlistPath,
  [Parameter(Mandatory = $true)][string]$FirebaseWebApiKeyPath,
  [switch]$ConfirmApply
)

$ErrorActionPreference = 'Stop'
$projectId = 'beauessence-clinic-staging'
$region = 'asia-east1'
$channel = 'cal-pilot'

if (-not $ConfirmApply) {
  throw 'Review-only by default. Re-run with -ConfirmApply only after the exact commit, image digests, resource diff and rollback list are approved.'
}
if ($ApiImage -notmatch '@sha256:[a-f0-9]{64}$' -or $WorkerImage -notmatch '@sha256:[a-f0-9]{64}$') {
  throw 'Both Cloud Run images must be immutable @sha256 digests.'
}
$expiry = [DateTimeOffset]::Parse($ExpiresAt)
$days = ($expiry - [DateTimeOffset]::UtcNow).TotalDays
if ($days -lt 29.8 -or $days -gt 30.2) { throw 'ExpiresAt must be approximately 30 days from this release.' }

foreach ($path in @($ReaderKeyPath, $WriterKeyPath, $SourceMapPath, $ManagerAllowlistPath, $FirebaseWebApiKeyPath)) {
  $resolved = (Resolve-Path -LiteralPath $path).Path
  if (-not (Test-Path -LiteralPath $resolved -PathType Leaf)) { throw "Required input file is missing: $path" }
}

$ReaderKeyPath = (Resolve-Path -LiteralPath $ReaderKeyPath).Path
$WriterKeyPath = (Resolve-Path -LiteralPath $WriterKeyPath).Path
$SourceMapPath = (Resolve-Path -LiteralPath $SourceMapPath).Path
$ManagerAllowlistPath = (Resolve-Path -LiteralPath $ManagerAllowlistPath).Path
$FirebaseWebApiKeyPath = (Resolve-Path -LiteralPath $FirebaseWebApiKeyPath).Path

function Read-ServiceAccountKey([string]$Path) {
  try { $key = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json }
  catch { throw "Service-account input is not valid JSON: $Path" }
  if ($key.type -ne 'service_account' -or
      [string]::IsNullOrWhiteSpace([string]$key.client_email) -or
      [string]::IsNullOrWhiteSpace([string]$key.private_key)) {
    throw "Service-account input is missing required fields: $Path"
  }
  return $key
}

$readerKey = Read-ServiceAccountKey $ReaderKeyPath
$writerKey = Read-ServiceAccountKey $WriterKeyPath
if ($readerKey.client_email -eq $writerKey.client_email) {
  throw 'Reader and writer service accounts must be different identities.'
}
try { $sourceMap = Get-Content -LiteralPath $SourceMapPath -Raw | ConvertFrom-Json }
catch { throw 'Source map is not valid JSON.' }
$requiredSourceIds = @('calendar_source_primary', 'calendar_source_secondary')
$actualSourceIds = @($sourceMap.PSObject.Properties.Name | Sort-Object)
if ((Compare-Object ($requiredSourceIds | Sort-Object) $actualSourceIds).Length -ne 0) {
  throw 'Source map must contain exactly the two approved CAL-PILOT source IDs.'
}
foreach ($sourceId in $requiredSourceIds) {
  if ([string]::IsNullOrWhiteSpace([string]$sourceMap.$sourceId.calendarId)) {
    throw "Source map is missing a Calendar ID for $sourceId."
  }
}
$managerEmails = @(Get-Content -LiteralPath $ManagerAllowlistPath | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
if ($managerEmails.Count -ne 1 -or $managerEmails[0] -notmatch '^[^\s@]+@[^\s@]+\.[^\s@]+$') {
  throw 'Initial manager allowlist must contain exactly one valid Google account email.'
}
if ([string]::IsNullOrWhiteSpace((Get-Content -LiteralPath $FirebaseWebApiKeyPath -Raw))) {
  throw 'Firebase Web API key input is empty.'
}
$readerKey = $null
$writerKey = $null
$sourceMap = $null

$head = (git rev-parse HEAD).Trim()
if ((git status --porcelain).Length -ne 0) { throw 'Release requires a clean exact commit.' }
Write-Host "Approved release candidate commit: $head"
Write-Host "Project: $projectId | Region: $region | Expiry: $ExpiresAt"

gcloud secrets versions add cal-pilot-reader-service-account --project $projectId --data-file $ReaderKeyPath | Out-Null
gcloud secrets versions add cal-pilot-writer-service-account --project $projectId --data-file $WriterKeyPath | Out-Null
gcloud secrets versions add cal-pilot-source-map --project $projectId --data-file $SourceMapPath | Out-Null
gcloud secrets versions add cal-pilot-manager-allowlist --project $projectId --data-file $ManagerAllowlistPath | Out-Null
gcloud secrets versions add cal-pilot-firebase-web-api-key --project $projectId --data-file $FirebaseWebApiKeyPath | Out-Null
$existingPseudonymVersion = @(gcloud secrets versions list cal-pilot-pseudonym-key --project $projectId --filter 'state=ENABLED' --format 'value(name)' --limit 1)
if ($existingPseudonymVersion.Count -eq 0) {
  $pseudonymKey = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
  $pseudonymKey | gcloud secrets versions add cal-pilot-pseudonym-key --project $projectId --data-file=- | Out-Null
  $pseudonymKey = $null
}

gcloud run deploy cal-pilot-api --project $projectId --region $region --image $ApiImage --service-account "cal-pilot-api@$projectId.iam.gserviceaccount.com" --no-traffic --tag cal-pilot-smoke --allow-unauthenticated --min-instances 0 --max-instances 1 --cpu 1 --memory 512Mi --timeout 60 --concurrency 20 --set-env-vars "GOOGLE_CLOUD_PROJECT=$projectId,CALENDAR_PILOT_FIREBASE_AUTH_DOMAIN=$projectId.firebaseapp.com" --set-secrets "CALENDAR_PILOT_MANAGER_EMAILS=cal-pilot-manager-allowlist:latest,CALENDAR_PILOT_FIREBASE_WEB_API_KEY=cal-pilot-firebase-web-api-key:latest"
gcloud run deploy cal-pilot-worker --project $projectId --region $region --image $WorkerImage --service-account "cal-pilot-worker@$projectId.iam.gserviceaccount.com" --no-traffic --tag cal-pilot-smoke --no-allow-unauthenticated --min-instances 0 --max-instances 1 --cpu 1 --memory 512Mi --timeout 240 --concurrency 1 --set-env-vars "GOOGLE_CLOUD_PROJECT=$projectId" --set-secrets "CALENDAR_PILOT_READER_SERVICE_ACCOUNT_JSON=cal-pilot-reader-service-account:latest,CALENDAR_PILOT_WRITER_SERVICE_ACCOUNT_JSON=cal-pilot-writer-service-account:latest,CALENDAR_PILOT_SOURCE_MAP_JSON=cal-pilot-source-map:latest,CALENDAR_PILOT_PSEUDONYM_KEY=cal-pilot-pseudonym-key:latest"

$apiService = gcloud run services describe cal-pilot-api --project $projectId --region $region --format json | ConvertFrom-Json
$workerService = gcloud run services describe cal-pilot-worker --project $projectId --region $region --format json | ConvertFrom-Json
$apiSmokeTraffic = @($apiService.status.traffic | Where-Object { $_.tag -eq 'cal-pilot-smoke' })
$workerSmokeTraffic = @($workerService.status.traffic | Where-Object { $_.tag -eq 'cal-pilot-smoke' })
if ($apiSmokeTraffic.Count -ne 1 -or $workerSmokeTraffic.Count -ne 1) { throw 'Tagged smoke revision URL was not returned.' }
$apiSmokeUrl = [string]$apiSmokeTraffic[0].url
$workerSmokeUrl = [string]$workerSmokeTraffic[0].url
$apiRevision = [string]$apiSmokeTraffic[0].revisionName
$workerRevision = [string]$workerSmokeTraffic[0].revisionName
$workerServiceUrl = [string]$workerService.status.url
if ((Invoke-WebRequest -UseBasicParsing -Uri "$apiSmokeUrl/v1/health").StatusCode -ne 200) { throw 'API smoke failed.' }
$identityToken = (gcloud auth print-identity-token --audiences $workerSmokeUrl).Trim()
if ((Invoke-WebRequest -UseBasicParsing -Uri "$workerSmokeUrl/health" -Headers @{ Authorization = "Bearer $identityToken" }).StatusCode -ne 200) { throw 'Worker smoke failed.' }

gcloud run services add-iam-policy-binding cal-pilot-worker --project $projectId --region $region --member "serviceAccount:cal-pilot-scheduler@$projectId.iam.gserviceaccount.com" --role roles/run.invoker
gcloud run services update-traffic cal-pilot-api --project $projectId --region $region --to-revisions "$apiRevision=100"
gcloud run services update-traffic cal-pilot-worker --project $projectId --region $region --to-revisions "$workerRevision=100"
gcloud scheduler jobs update http cal-pilot-five-minute-sync --project $projectId --location $region --uri "$workerServiceUrl/tasks/calendar-sync" --http-method POST --oidc-service-account-email "cal-pilot-scheduler@$projectId.iam.gserviceaccount.com" --oidc-token-audience $workerServiceUrl --attempt-deadline 240s

$env:GOOGLE_CLOUD_PROJECT = $projectId
$env:CALENDAR_PILOT_EXPIRES_AT = $ExpiresAt
node scripts/seed-cal-pilot.mjs

$deployJson = firebase hosting:channel:deploy $channel --expires 30d --project $projectId --json | ConvertFrom-Json
function Find-PreviewUrl($Value) {
  if ($null -eq $Value) { return $null }
  if ($Value -is [string] -and $Value -match '^https://[^/]+\.web\.app/?$') { return [string]$Value }
  if ($Value -is [System.Collections.IDictionary]) {
    foreach ($item in $Value.Values) { $found = Find-PreviewUrl $item; if ($null -ne $found) { return $found } }
  } elseif ($Value -is [System.Collections.IEnumerable] -and $Value -isnot [string]) {
    foreach ($item in $Value) { $found = Find-PreviewUrl $item; if ($null -ne $found) { return $found } }
  } else {
    foreach ($property in $Value.PSObject.Properties) { $found = Find-PreviewUrl $property.Value; if ($null -ne $found) { return $found } }
  }
  return $null
}
$previewUrl = Find-PreviewUrl $deployJson
if ([string]::IsNullOrWhiteSpace($previewUrl)) { throw 'Hosting preview URL was not returned.' }
$previewDomain = ([Uri]$previewUrl).Host
$env:CALENDAR_PILOT_PREVIEW_DOMAIN = $previewDomain
node scripts/configure-cal-pilot-identity.mjs
node scripts/activate-cal-pilot.mjs
gcloud scheduler jobs resume cal-pilot-five-minute-sync --project $projectId --location $region
Write-Host "CAL-PILOT release ready: $previewUrl"

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$ApprovedCommit,
  [Parameter(Mandatory = $true)][string]$ApiImage,
  [Parameter(Mandatory = $true)][string]$WorkerImage,
  [Parameter(Mandatory = $true)][string]$ExpectedPreviousApiRevision,
  [Parameter(Mandatory = $true)][string]$ExpectedPreviousApiImage,
  [Parameter(Mandatory = $true)][string]$ExpectedPreviousWorkerRevision,
  [Parameter(Mandatory = $true)][string]$ExpectedPreviousWorkerImage,
  [Parameter(Mandatory = $true)][string]$ExpectedPreviousHostingVersion,
  [Parameter(Mandatory = $true)][string]$ExpectedSecretVersionManifest,
  [Parameter(Mandatory = $true)][ValidateRange(1, [int]::MaxValue)][int]$ExpectedSourceGeneration,
  [Parameter(Mandatory = $true)][ValidateRange(1, 100)][int]$ExpectedLegacyCandidateCount,
  [Parameter(Mandatory = $true)][string]$WriterKeyPath,
  [switch]$ConfirmApply
)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
$projectId = 'beauessence-clinic-staging'
$region = 'asia-east1'
$channel = 'cal-pilot'
$expectedExpiry = '2026-11-28T04:51:37Z'
$approvedSecrets = @(
  'cal-pilot-manager-allowlist',
  'cal-pilot-firebase-web-api-key',
  'cal-pilot-reader-service-account',
  'cal-pilot-writer-service-account',
  'cal-pilot-source-map',
  'cal-pilot-pseudonym-key'
)

function Assert-ImmutableImage([string]$Image, [string]$Label) {
  if ($Image -notmatch "^$region-docker\.pkg\.dev/$projectId/cal-pilot/(api|worker)@sha256:[a-f0-9]{64}$") {
    throw "$Label must be an approved immutable CAL-PILOT image digest."
  }
}

function Get-ActiveRunState([string]$Name) {
  $service = gcloud run services describe $Name --project $projectId --region $region --format json | ConvertFrom-Json
  $traffic = @($service.status.traffic | Where-Object { $_.percent -eq 100 })
  if ($traffic.Count -ne 1) { throw "$Name does not have exactly one 100 percent revision." }
  return [pscustomobject]@{
    revision = [string]$traffic[0].revisionName
    image = [string]$service.spec.template.spec.containers[0].image
    url = [string]$service.status.url
  }
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

function Test-RunInvokerBinding([string]$Service, [string]$Member) {
  $policy = gcloud run services get-iam-policy $Service --project $projectId --region $region --format json | ConvertFrom-Json
  return @($policy.bindings | Where-Object {
      $_.role -eq 'roles/run.invoker' -and @($_.members) -contains $Member
    }).Count -gt 0
}

function Find-PreviewUrl($Value) {
  if ($null -eq $Value) { return $null }
  if ($Value -is [string] -and $Value -match '^https://[^/]+\.web\.app/?$') { return [string]$Value }
  if ($Value -is [System.Collections.IDictionary]) {
    foreach ($item in $Value.Values) {
      $found = Find-PreviewUrl $item
      if ($null -ne $found) { return $found }
    }
  } elseif ($Value -is [System.Collections.IEnumerable] -and $Value -isnot [string]) {
    foreach ($item in $Value) {
      $found = Find-PreviewUrl $item
      if ($null -ne $found) { return $found }
    }
  } else {
    foreach ($property in $Value.PSObject.Properties) {
      $found = Find-PreviewUrl $property.Value
      if ($null -ne $found) { return $found }
    }
  }
  return $null
}

function Assert-PreviousState {
  $api = Get-ActiveRunState 'cal-pilot-api'
  $worker = Get-ActiveRunState 'cal-pilot-worker'
  if ($api.revision -ne $ExpectedPreviousApiRevision -or $api.image -ne $ExpectedPreviousApiImage) {
    throw 'API baseline drifted from the approved rollback target.'
  }
  if ($worker.revision -ne $ExpectedPreviousWorkerRevision -or $worker.image -ne $ExpectedPreviousWorkerImage) {
    throw 'Worker baseline drifted from the approved rollback target.'
  }
  if ((Get-HostingVersion) -ne $ExpectedPreviousHostingVersion) {
    throw 'Hosting baseline drifted from the approved rollback target.'
  }
  $scheduler = gcloud scheduler jobs describe cal-pilot-five-minute-sync --project $projectId --location $region --format json | ConvertFrom-Json
  if ($scheduler.state -ne 'ENABLED' -or $scheduler.schedule -ne '*/5 * * * *' -or $scheduler.attemptDeadline -ne '240s') {
    throw 'The five-minute Scheduler boundary drifted.'
  }
  Assert-SecretVersions
}

function Set-MigrationEnvironment([string]$Mode) {
  $env:GOOGLE_CLOUD_PROJECT = $projectId
  $env:CALENDAR_PILOT_EXPECTED_LEGACY_CANDIDATES = [string]$ExpectedLegacyCandidateCount
  $env:CALENDAR_PILOT_EXPECTED_SOURCE_GENERATION = [string]$ExpectedSourceGeneration
  $env:CALENDAR_PILOT_LEGACY_MIGRATION_MODE = $Mode
}

if ($ApprovedCommit -notmatch '^[a-f0-9]{40}$' -or (git rev-parse HEAD).Trim() -ne $ApprovedCommit) {
  throw 'The working tree is not on the approved exact commit.'
}
if ((git status --porcelain).Length -ne 0) { throw 'Deployment requires a clean exact commit.' }
Assert-ImmutableImage $ApiImage 'API image'
Assert-ImmutableImage $WorkerImage 'Worker image'
Assert-ImmutableImage $ExpectedPreviousApiImage 'Previous API image'
Assert-ImmutableImage $ExpectedPreviousWorkerImage 'Previous Worker image'
if ($ExpectedPreviousApiRevision -notmatch '^cal-pilot-api-[a-z0-9-]+$' -or $ExpectedPreviousWorkerRevision -notmatch '^cal-pilot-worker-[a-z0-9-]+$') {
  throw 'Previous Cloud Run revisions are invalid.'
}
if ($ExpectedPreviousHostingVersion -notmatch '^projects/beauessence-clinic-staging/sites/beauessence-clinic-staging/versions/[a-z0-9]+$') {
  throw 'Previous Hosting version is invalid.'
}
if (-not (Test-Path -LiteralPath $ExpectedSecretVersionManifest -PathType Leaf)) {
  throw 'Expected Secret version manifest was not found.'
}
if (-not (Test-Path -LiteralPath $WriterKeyPath -PathType Leaf)) {
  throw 'Writer smoke key was not found.'
}

Assert-PreviousState
Set-MigrationEnvironment 'plan'
try { node scripts/migrate-cal-pilot-legacy-candidates.mjs }
finally {
  Remove-Item Env:CALENDAR_PILOT_LEGACY_MIGRATION_MODE -ErrorAction SilentlyContinue
}
if (-not $ConfirmApply) {
  throw 'Preflight passed; review-only mode made no changes. Re-run with -ConfirmApply for this exact candidate.'
}

$writerKey = Get-Content -LiteralPath $WriterKeyPath -Raw | ConvertFrom-Json
$smokeIdentityEmail = [string]$writerKey.client_email
if ($smokeIdentityEmail -notmatch "^[^@]+@$projectId\.iam\.gserviceaccount\.com$") {
  throw 'Writer smoke key does not belong to the approved staging project.'
}
$smokeMember = "serviceAccount:$smokeIdentityEmail"
$smokeConfiguration = "cal-pilot-update-$([Guid]::NewGuid().ToString('N').Substring(0, 12))"
$smokeConfigurationCreated = $false
$apiSmokeBindingAdded = $false
$workerSmokeBindingAdded = $false
$safeStopRequired = $false
$apiRevision = $null
$workerRevision = $null
$newHostingVersion = $null

try {
  $safeStopRequired = $true
  gcloud scheduler jobs pause cal-pilot-five-minute-sync --project $projectId --location $region --quiet | Out-Null
  $env:GOOGLE_CLOUD_PROJECT = $projectId
  node scripts/disable-cal-pilot.mjs

  firebase deploy --only 'firestore:rules,firestore:indexes' --project $projectId --quiet
  $indexDeadline = (Get-Date).AddMinutes(10)
  while ($true) {
    try {
      node scripts/check-cal-pilot-worker-lease-index.mjs
      break
    } catch {
      if ((Get-Date) -ge $indexDeadline) { throw 'Timed out waiting for the worker lease recovery index.' }
      Start-Sleep -Seconds 10
    }
  }

  gcloud run deploy cal-pilot-api --project $projectId --region $region --image $ApiImage --service-account "cal-pilot-api@$projectId.iam.gserviceaccount.com" --tag cal-pilot-smoke --no-traffic --min-instances 0 --max-instances 3 --cpu 1 --memory 512Mi --timeout 60 --concurrency 40 --set-env-vars "GOOGLE_CLOUD_PROJECT=$projectId,CALENDAR_PILOT_FIREBASE_AUTH_DOMAIN=$projectId.firebaseapp.com" --set-secrets 'CALENDAR_PILOT_MANAGER_EMAILS=cal-pilot-manager-allowlist:latest,CALENDAR_PILOT_FIREBASE_WEB_API_KEY=cal-pilot-firebase-web-api-key:latest' --quiet
  gcloud run deploy cal-pilot-worker --project $projectId --region $region --image $WorkerImage --service-account "cal-pilot-worker@$projectId.iam.gserviceaccount.com" --tag cal-pilot-smoke --no-traffic --no-allow-unauthenticated --min-instances 0 --max-instances 1 --cpu 1 --memory 512Mi --timeout 240 --concurrency 1 --set-env-vars "GOOGLE_CLOUD_PROJECT=$projectId" --set-secrets 'CALENDAR_PILOT_READER_SERVICE_ACCOUNT_JSON=cal-pilot-reader-service-account:latest,CALENDAR_PILOT_WRITER_SERVICE_ACCOUNT_JSON=cal-pilot-writer-service-account:latest,CALENDAR_PILOT_SOURCE_MAP_JSON=cal-pilot-source-map:latest,CALENDAR_PILOT_PSEUDONYM_KEY=cal-pilot-pseudonym-key:latest' --quiet

  $apiService = gcloud run services describe cal-pilot-api --project $projectId --region $region --format json | ConvertFrom-Json
  $workerService = gcloud run services describe cal-pilot-worker --project $projectId --region $region --format json | ConvertFrom-Json
  $apiSmoke = @($apiService.status.traffic | Where-Object { $_.tag -eq 'cal-pilot-smoke' })
  $workerSmoke = @($workerService.status.traffic | Where-Object { $_.tag -eq 'cal-pilot-smoke' })
  if ($apiSmoke.Count -ne 1 -or $workerSmoke.Count -ne 1) { throw 'Tagged zero-traffic smoke revisions were not returned.' }
  $apiRevision = [string]$apiSmoke[0].revisionName
  $workerRevision = [string]$workerSmoke[0].revisionName
  $apiSmokeUrl = [string]$apiSmoke[0].url
  $workerSmokeUrl = [string]$workerSmoke[0].url
  $workerServiceUrl = [string]$workerService.status.url

  if (-not (Test-RunInvokerBinding 'cal-pilot-api' $smokeMember)) {
    gcloud run services add-iam-policy-binding cal-pilot-api --project $projectId --region $region --member $smokeMember --role roles/run.invoker --quiet | Out-Null
    $apiSmokeBindingAdded = $true
  }
  if (-not (Test-RunInvokerBinding 'cal-pilot-worker' $smokeMember)) {
    gcloud run services add-iam-policy-binding cal-pilot-worker --project $projectId --region $region --member $smokeMember --role roles/run.invoker --quiet | Out-Null
    $workerSmokeBindingAdded = $true
  }
  gcloud config configurations create $smokeConfiguration --no-activate --quiet | Out-Null
  $smokeConfigurationCreated = $true
  gcloud auth activate-service-account --key-file $WriterKeyPath --configuration $smokeConfiguration --quiet | Out-Null
  $apiIdentityToken = (gcloud auth print-identity-token --audiences $apiSmokeUrl --configuration $smokeConfiguration).Trim()
  $workerIdentityToken = (gcloud auth print-identity-token --audiences $workerSmokeUrl --configuration $smokeConfiguration).Trim()
  if ((Invoke-WebRequest -UseBasicParsing -Uri "$apiSmokeUrl/v1/health" -Headers @{ Authorization = "Bearer $apiIdentityToken" }).StatusCode -ne 200) { throw 'API zero-traffic smoke failed.' }
  if ((Invoke-WebRequest -UseBasicParsing -Uri "$workerSmokeUrl/health" -Headers @{ Authorization = "Bearer $workerIdentityToken" }).StatusCode -ne 200) { throw 'Worker zero-traffic smoke failed.' }
  $apiIdentityToken = $null
  $workerIdentityToken = $null

  gcloud run services update-traffic cal-pilot-api --project $projectId --region $region --to-revisions "$apiRevision=100" --quiet | Out-Null
  gcloud run services update-traffic cal-pilot-worker --project $projectId --region $region --to-revisions "$workerRevision=100" --quiet | Out-Null
  gcloud run services update-traffic cal-pilot-api --project $projectId --region $region --remove-tags cal-pilot-smoke --quiet | Out-Null
  gcloud run services update-traffic cal-pilot-worker --project $projectId --region $region --remove-tags cal-pilot-smoke --quiet | Out-Null

  Set-MigrationEnvironment 'apply'
  $env:CALENDAR_PILOT_CONFIRM_LEGACY_MIGRATION = 'YES'
  try { node scripts/migrate-cal-pilot-legacy-candidates.mjs }
  finally {
    Remove-Item Env:CALENDAR_PILOT_CONFIRM_LEGACY_MIGRATION -ErrorAction SilentlyContinue
  }
  node scripts/activate-cal-pilot.mjs

  $workerIdentityToken = (gcloud auth print-identity-token --audiences $workerServiceUrl --configuration $smokeConfiguration).Trim()
  if ((Invoke-WebRequest -UseBasicParsing -Method Post -Uri "$workerServiceUrl/tasks/calendar-sync" -Headers @{ Authorization = "Bearer $workerIdentityToken" }).StatusCode -ne 200) { throw 'Controlled full resync failed.' }
  $workerIdentityToken = $null
  Set-MigrationEnvironment 'verify'
  node scripts/migrate-cal-pilot-legacy-candidates.mjs

  corepack pnpm run build:web
  $deployJson = firebase hosting:channel:deploy $channel --expires 30d --project $projectId --json | ConvertFrom-Json
  $newHostingVersion = Get-HostingVersion
  if ($newHostingVersion -eq $ExpectedPreviousHostingVersion) { throw 'Hosting did not create the expected new reviewed version.' }
  $previewUrl = Find-PreviewUrl $deployJson
  if ([string]::IsNullOrWhiteSpace($previewUrl)) { throw 'Hosting preview URL was not returned.' }

  Assert-SecretVersions
  $postApi = Get-ActiveRunState 'cal-pilot-api'
  $postWorker = Get-ActiveRunState 'cal-pilot-worker'
  if ($postApi.revision -ne $apiRevision -or $postApi.image -ne $ApiImage -or $postWorker.revision -ne $workerRevision -or $postWorker.image -ne $WorkerImage) {
    throw 'Post-deployment Cloud Run state does not match the reviewed images.'
  }
  gcloud scheduler jobs resume cal-pilot-five-minute-sync --project $projectId --location $region --quiet | Out-Null
  $safeStopRequired = $false
  Write-Host "CAL-PILOT update ready: API_REVISION=$apiRevision WORKER_REVISION=$workerRevision HOSTING_VERSION=$newHostingVersion PREVIEW_URL=$previewUrl"
} catch {
  if ($safeStopRequired) {
    try { gcloud scheduler jobs pause cal-pilot-five-minute-sync --project $projectId --location $region --quiet | Out-Null } catch {}
    try { $env:GOOGLE_CLOUD_PROJECT = $projectId; node scripts/disable-cal-pilot.mjs } catch {}
  }
  throw
} finally {
  $apiIdentityToken = $null
  $workerIdentityToken = $null
  if ($apiSmokeBindingAdded) {
    gcloud run services remove-iam-policy-binding cal-pilot-api --project $projectId --region $region --member $smokeMember --role roles/run.invoker --quiet | Out-Null
  }
  if ($workerSmokeBindingAdded) {
    gcloud run services remove-iam-policy-binding cal-pilot-worker --project $projectId --region $region --member $smokeMember --role roles/run.invoker --quiet | Out-Null
  }
  if ($smokeConfigurationCreated) {
    gcloud auth revoke $smokeIdentityEmail --configuration $smokeConfiguration --quiet 2>$null
    gcloud config configurations delete $smokeConfiguration --quiet | Out-Null
  }
  Remove-Item Env:CALENDAR_PILOT_EXPECTED_LEGACY_CANDIDATES -ErrorAction SilentlyContinue
  Remove-Item Env:CALENDAR_PILOT_EXPECTED_SOURCE_GENERATION -ErrorAction SilentlyContinue
  Remove-Item Env:CALENDAR_PILOT_LEGACY_MIGRATION_MODE -ErrorAction SilentlyContinue
}

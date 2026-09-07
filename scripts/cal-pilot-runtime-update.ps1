[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$CandidateSha,
  [Parameter(Mandatory = $true)][string]$ExpectedApiRevision,
  [Parameter(Mandatory = $true)][string]$ExpectedApiImage,
  [Parameter(Mandatory = $true)][string]$ExpectedWorkerRevision,
  [Parameter(Mandatory = $true)][string]$ExpectedWorkerImage,
  [Parameter(Mandatory = $true)][string]$ExpectedHostingVersion,
  [Parameter(Mandatory = $true)][string]$ExpectedSecretVersionManifest,
  [string]$AuthDomain = '',
  [switch]$IncludeWorker,
  [switch]$ConfirmApply
)

# Runtime-only CAL-PILOT update. This is not cal-pilot-update.ps1: it must never
# migrate legacy candidates, run a controlled full resync, or deploy schema.

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
$projectId = 'beauessence-clinic-staging'
$region = 'asia-east1'
$channel = 'cal-pilot'
$repository = "$region-docker.pkg.dev/$projectId/cal-pilot"
$defaultAuthDomain = "$projectId.firebaseapp.com"
if ([string]::IsNullOrWhiteSpace($AuthDomain)) {
  $AuthDomain = $defaultAuthDomain
}
$approvedSecrets = @(
  'cal-pilot-manager-allowlist',
  'cal-pilot-firebase-web-api-key',
  'cal-pilot-reader-service-account',
  'cal-pilot-writer-service-account',
  'cal-pilot-source-map',
  'cal-pilot-pseudonym-key'
)

function Assert-PowerShell7 {
  if ($PSVersionTable.PSVersion.Major -lt 7) {
    throw 'PowerShell 7+ (pwsh) is required.'
  }
}

function Assert-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "$Name is required on PATH."
  }
}

function Assert-PreflightTools {
  Assert-PowerShell7
  foreach ($name in @('git', 'gcloud', 'firebase', 'gh', 'node', 'corepack')) {
    Assert-Command $name
  }
  $gcloudVersion = (gcloud version --format='value(core)' 2>$null)
  if ([string]::IsNullOrWhiteSpace([string]$gcloudVersion)) {
    throw 'gcloud CLI is not authenticated or not usable.'
  }
  $account = (gcloud auth list --filter='status:ACTIVE' --format='value(account)').Trim()
  if ([string]::IsNullOrWhiteSpace($account)) {
    throw 'No active gcloud account. Runtime update requires an authenticated operator.'
  }
  $configProject = (gcloud config get-value project 2>$null).Trim()
  if ($configProject -notin @($projectId, '', '(unset)')) {
    Write-Host "gcloud default project is $configProject; commands pin --project $projectId."
  }
  $buildsEnabled = (gcloud services list --project $projectId --enabled --filter='config.name=cloudbuild.googleapis.com' --format='value(config.name)').Trim()
  if ($buildsEnabled -ne 'cloudbuild.googleapis.com') {
    throw 'Cloud Build is not enabled on beauessence-clinic-staging.'
  }
}

function Assert-CandidateSha {
  if ($CandidateSha -notmatch '^[a-f0-9]{40}$') {
    throw 'Candidate SHA must be a full 40-character SHA.'
  }
  git cat-file -e "$CandidateSha^{commit}" 2>$null
  if ($LASTEXITCODE -ne 0) {
    git fetch origin $CandidateSha
    git cat-file -e "$CandidateSha^{commit}"
  }
}

function Assert-AuthDomain {
  if (
    $AuthDomain -ne $defaultAuthDomain -and
    $AuthDomain -notmatch '^[A-Za-z0-9.-]+\.(firebaseapp\.com|web\.app)$'
  ) {
    throw 'Unsupported authDomain. Use the default firebaseapp.com host or an explicit authorized preview host.'
  }
}

function Assert-ImmutableImage([string]$Image, [string]$Component, [string]$Label) {
  if ($Component -notin @('api', 'worker')) { throw 'Unknown CAL-PILOT image component.' }
  if ($Image -notmatch "^$region-docker\.pkg\.dev/$projectId/cal-pilot/$Component@sha256:[a-f0-9]{64}$") {
    throw "$Label must be an approved immutable CAL-PILOT image digest."
  }
}

function Get-ActiveRunState([string]$Name) {
  $service = gcloud run services describe $Name --project $projectId --region $region --format json | ConvertFrom-Json
  $traffic = @($service.status.traffic | Where-Object { $_.percent -eq 100 })
  if ($traffic.Count -ne 1) { throw "$Name does not have exactly one 100 percent revision." }
  $activeRevisionName = [string]$traffic[0].revisionName
  $activeRevision = gcloud run revisions describe $activeRevisionName --project $projectId --region $region --format json | ConvertFrom-Json
  $activeImage = [string]$activeRevision.status.imageDigest
  if ([string]::IsNullOrWhiteSpace($activeImage)) {
    $activeImage = [string]$activeRevision.spec.containers[0].image
  }
  return [pscustomobject]@{
    revision = $activeRevisionName
    image = $activeImage
    url = [string]$service.status.url
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

function Assert-Baseline {
  $api = Get-ActiveRunState 'cal-pilot-api'
  $worker = Get-ActiveRunState 'cal-pilot-worker'
  if ($api.revision -ne $ExpectedApiRevision -or $api.image -ne $ExpectedApiImage) {
    throw 'API baseline drifted from the authorized expected state.'
  }
  if ($worker.revision -ne $ExpectedWorkerRevision -or $worker.image -ne $ExpectedWorkerImage) {
    throw 'Worker baseline drifted from the authorized expected state.'
  }
  $hostingVersion = [string](Get-HostingChannel).release.version.name
  if ($hostingVersion -ne $ExpectedHostingVersion) {
    throw 'Hosting baseline drifted from the authorized expected state.'
  }
  Assert-SecretVersions
  return [pscustomobject]@{
    api = $api
    worker = $worker
    hostingVersion = $hostingVersion
  }
}

function Assert-CiVerified {
  $runs = gh run list --repo waydefu/clinic --commit $CandidateSha --workflow verify.yml --limit 20 --json conclusion,headSha,status | ConvertFrom-Json
  $successful = @($runs | Where-Object {
      $_.headSha -eq $CandidateSha -and $_.conclusion -eq 'success' -and $_.status -eq 'completed'
    })
  if ($successful.Count -lt 1) {
    throw 'Candidate SHA has no successful verify workflow run. Aborting before mutation.'
  }
}

function New-IsolatedCandidateSource {
  $repoRoot = (git rev-parse --show-toplevel).Trim()
  $dir = Join-Path $repoRoot ".claude/worktrees/cal-pilot-runtime-$CandidateSha"
  if (Test-Path -LiteralPath $dir) {
    git worktree remove --force $dir
  }
  git worktree add --detach $dir $CandidateSha
  $head = (git -C $dir rev-parse HEAD).Trim()
  if ($head -ne $CandidateSha) {
    throw 'Isolated Hosting/Cloud Build source HEAD does not match the candidate SHA.'
  }
  if ((git -C $dir status --porcelain).Length -ne 0) {
    throw 'Isolated candidate source is not clean.'
  }
  return $dir
}

function Remove-IsolatedCandidateSource([string]$Dir) {
  if ([string]::IsNullOrWhiteSpace($Dir)) { return }
  if (Test-Path -LiteralPath $Dir) {
    git worktree remove --force $Dir
  }
}

function Get-TaggedImage([string]$Component) {
  $digest = (gcloud artifacts docker images describe "$repository/${Component}:$CandidateSha" --project $projectId --format 'value(image_summary.digest)').Trim()
  if ($digest -notmatch '^sha256:[a-f0-9]{64}$') {
    throw "Artifact Registry did not return an immutable $Component digest for $CandidateSha."
  }
  return "$repository/${Component}@$digest"
}

function Invoke-ZeroTrafficHealthProbe([string]$Url, [string]$Token) {
  $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -Headers @{ Authorization = "Bearer $Token" }
  if ($response.StatusCode -ne 200) {
    throw "Zero-traffic health probe failed for $Url."
  }
}

Assert-PreflightTools
Assert-CandidateSha
Assert-AuthDomain
Assert-ImmutableImage $ExpectedApiImage 'api' 'Expected API image'
Assert-ImmutableImage $ExpectedWorkerImage 'worker' 'Expected Worker image'
if ($ExpectedApiRevision -notmatch '^cal-pilot-api-[a-z0-9-]+$' -or $ExpectedWorkerRevision -notmatch '^cal-pilot-worker-[a-z0-9-]+$') {
  throw 'Expected Cloud Run revisions are invalid.'
}
if ($ExpectedHostingVersion -notmatch '^projects/beauessence-clinic-staging/sites/beauessence-clinic-staging/versions/[a-z0-9]+$') {
  throw 'Expected Hosting version is invalid.'
}
if (-not (Test-Path -LiteralPath $ExpectedSecretVersionManifest -PathType Leaf)) {
  throw 'Expected Secret version manifest was not found.'
}

$baseline = Assert-Baseline
Assert-CiVerified

Write-Host "ROLLBACK_BEFORE_API_REVISION=$($baseline.api.revision)"
Write-Host "ROLLBACK_BEFORE_API_IMAGE=$($baseline.api.image)"
Write-Host "ROLLBACK_BEFORE_WORKER_REVISION=$($baseline.worker.revision)"
Write-Host "ROLLBACK_BEFORE_WORKER_IMAGE=$($baseline.worker.image)"
Write-Host "ROLLBACK_BEFORE_HOSTING_VERSION=$($baseline.hostingVersion)"
Write-Host "CANDIDATE_SHA=$CandidateSha"
Write-Host "AUTH_DOMAIN=$AuthDomain"
Write-Host "INCLUDE_WORKER=$IncludeWorker"

if (-not $ConfirmApply) {
  throw 'Preflight passed; review-only mode made no changes. Re-run with -ConfirmApply for this exact candidate.'
}

$isolatedSourceRoot = $null
$apiRevision = $null
$workerRevision = $null
$newHostingVersion = $null
$operatorIdentityToken = $null
try {
  $isolatedSourceRoot = New-IsolatedCandidateSource
  $buildScript = Join-Path $isolatedSourceRoot 'scripts/cal-pilot-build-images.ps1'
  if (-not (Test-Path -LiteralPath $buildScript -PathType Leaf)) {
    throw 'Isolated candidate is missing scripts/cal-pilot-build-images.ps1.'
  }

  Push-Location $isolatedSourceRoot
  try {
    & $buildScript -Commit $CandidateSha -ConfirmBuild
  } finally {
    Pop-Location
  }

  $apiImage = Get-TaggedImage 'api'
  $workerImage = Get-TaggedImage 'worker'
  Write-Host "API_IMAGE=$apiImage"
  Write-Host "WORKER_IMAGE=$workerImage"

  gcloud run deploy cal-pilot-api `
    --project $projectId `
    --region $region `
    --image $apiImage `
    --service-account "cal-pilot-api@$projectId.iam.gserviceaccount.com" `
    --tag cal-pilot-smoke `
    --no-traffic `
    --min-instances 0 `
    --max-instances 3 `
    --cpu 1 `
    --memory 512Mi `
    --timeout 60 `
    --concurrency 40 `
    --set-env-vars "GOOGLE_CLOUD_PROJECT=$projectId,CALENDAR_PILOT_FIREBASE_AUTH_DOMAIN=$AuthDomain" `
    --set-secrets 'CALENDAR_PILOT_MANAGER_EMAILS=cal-pilot-manager-allowlist:latest,CALENDAR_PILOT_FIREBASE_WEB_API_KEY=cal-pilot-firebase-web-api-key:latest' `
    --quiet

  $apiService = gcloud run services describe cal-pilot-api --project $projectId --region $region --format json | ConvertFrom-Json
  $apiSmoke = @($apiService.status.traffic | Where-Object { $_.tag -eq 'cal-pilot-smoke' })
  if ($apiSmoke.Count -ne 1) { throw 'Tagged zero-traffic API smoke revision was not returned.' }
  $apiRevision = [string]$apiSmoke[0].revisionName
  $apiSmokeUrl = [string]$apiSmoke[0].url

  $operatorIdentityToken = (gcloud auth print-identity-token).Trim()
  if ([string]::IsNullOrWhiteSpace($operatorIdentityToken)) {
    throw 'Deployment operator identity token was not returned.'
  }
  Invoke-ZeroTrafficHealthProbe "$apiSmokeUrl/v1/health" $operatorIdentityToken

  if ($IncludeWorker) {
    gcloud run deploy cal-pilot-worker `
      --project $projectId `
      --region $region `
      --image $workerImage `
      --service-account "cal-pilot-worker@$projectId.iam.gserviceaccount.com" `
      --tag cal-pilot-smoke `
      --no-traffic `
      --no-allow-unauthenticated `
      --min-instances 0 `
      --max-instances 1 `
      --cpu 1 `
      --memory 512Mi `
      --timeout 240 `
      --concurrency 1 `
      --set-env-vars "GOOGLE_CLOUD_PROJECT=$projectId" `
      --set-secrets 'CALENDAR_PILOT_READER_SERVICE_ACCOUNT_JSON=cal-pilot-reader-service-account:latest,CALENDAR_PILOT_WRITER_SERVICE_ACCOUNT_JSON=cal-pilot-writer-service-account:latest,CALENDAR_PILOT_SOURCE_MAP_JSON=cal-pilot-source-map:latest,CALENDAR_PILOT_PSEUDONYM_KEY=cal-pilot-pseudonym-key:latest' `
      --quiet
    $workerService = gcloud run services describe cal-pilot-worker --project $projectId --region $region --format json | ConvertFrom-Json
    $workerSmoke = @($workerService.status.traffic | Where-Object { $_.tag -eq 'cal-pilot-smoke' })
    if ($workerSmoke.Count -ne 1) { throw 'Tagged zero-traffic Worker smoke revision was not returned.' }
    $workerRevision = [string]$workerSmoke[0].revisionName
    $workerSmokeUrl = [string]$workerSmoke[0].url
    Invoke-ZeroTrafficHealthProbe "$workerSmokeUrl/health" $operatorIdentityToken
  }

  gcloud run services update-traffic cal-pilot-api --project $projectId --region $region --to-revisions "$apiRevision=100" --quiet | Out-Null
  gcloud run services update-traffic cal-pilot-api --project $projectId --region $region --remove-tags cal-pilot-smoke --quiet | Out-Null
  if ($IncludeWorker) {
    gcloud run services update-traffic cal-pilot-worker --project $projectId --region $region --to-revisions "$workerRevision=100" --quiet | Out-Null
    gcloud run services update-traffic cal-pilot-worker --project $projectId --region $region --remove-tags cal-pilot-smoke --quiet | Out-Null
  }

  Push-Location $isolatedSourceRoot
  try {
    corepack pnpm install --frozen-lockfile
    firebase hosting:channel:deploy $channel --expires 30d --project $projectId
  } finally {
    Pop-Location
  }
  $hostingChannel = Get-HostingChannel
  $newHostingVersion = [string]$hostingChannel.release.version.name
  if ($newHostingVersion -eq $ExpectedHostingVersion) {
    throw 'Hosting did not create the expected new reviewed version.'
  }

  Assert-SecretVersions
  $postApi = Get-ActiveRunState 'cal-pilot-api'
  if ($postApi.revision -ne $apiRevision -or $postApi.image -ne $apiImage) {
    throw 'Post-deployment API state does not match the candidate image.'
  }
  if ($IncludeWorker) {
    $postWorker = Get-ActiveRunState 'cal-pilot-worker'
    if ($postWorker.revision -ne $workerRevision -or $postWorker.image -ne $workerImage) {
      throw 'Post-deployment Worker state does not match the candidate image.'
    }
  } else {
    $postWorker = Get-ActiveRunState 'cal-pilot-worker'
    if ($postWorker.revision -ne $ExpectedWorkerRevision -or $postWorker.image -ne $ExpectedWorkerImage) {
      throw 'Worker was mutated even though IncludeWorker was not set.'
    }
  }

  Write-Host "CAL-PILOT runtime update ready: CANDIDATE_SHA=$CandidateSha API_REVISION=$apiRevision HOSTING_VERSION=$newHostingVersion INCLUDE_WORKER=$IncludeWorker"
  if ($IncludeWorker) {
    Write-Host "WORKER_REVISION=$workerRevision"
  }
} finally {
  $operatorIdentityToken = $null
  Remove-IsolatedCandidateSource $isolatedSourceRoot
}

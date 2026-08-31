[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$ExpectedHostingVersion,
  [Parameter(Mandatory = $true)][string]$TargetExpiry,
  [switch]$ConfirmApply
)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
$projectId = 'beauessence-clinic-staging'
$channel = 'cal-pilot'
$approvedTarget = '2026-11-28T04:51:37Z'
$renewalWindow = [TimeSpan]::FromDays(7)
$maximumLifetime = [TimeSpan]::FromDays(30)

if ($TargetExpiry -ne $approvedTarget) { throw 'Target expiry is not the approved extension.' }
if ($ExpectedHostingVersion -notmatch '^projects/beauessence-clinic-staging/sites/beauessence-clinic-staging/versions/[a-z0-9]+$') {
  throw 'Expected Hosting version is invalid.'
}

function Get-Channel {
  $channels = firebase hosting:channel:list --project $projectId --json | ConvertFrom-Json
  $matches = @($channels.result.channels | Where-Object { $_.name -eq "projects/$projectId/sites/$projectId/channels/$channel" })
  if ($matches.Count -ne 1) { throw 'CAL-PILOT Hosting channel was not found.' }
  return $matches[0]
}

$current = Get-Channel
if ([string]$current.release.version.name -ne $ExpectedHostingVersion) {
  throw 'Hosting content drifted from the approved frozen version.'
}
$now = [DateTimeOffset]::UtcNow
$currentExpiry = [DateTimeOffset]::Parse([string]$current.expireTime)
$target = [DateTimeOffset]::Parse($TargetExpiry)
if ($currentExpiry -le $now) { throw 'The Hosting preview is already expired.' }
if (($currentExpiry - $now) -gt $renewalWindow) { throw 'Hosting renewal is allowed only in the final seven days.' }
$nextExpiry = $now.Add($maximumLifetime)
if ($nextExpiry -gt $target) { $nextExpiry = $target }
if ($nextExpiry -le $currentExpiry) { throw 'The Hosting preview already reaches the next safe expiry.' }
Write-Host "Current Hosting expiry: $($currentExpiry.UtcDateTime.ToString('o'))"
Write-Host "Next Hosting expiry: $($nextExpiry.UtcDateTime.ToString('o'))"
if (-not $ConfirmApply) {
  throw 'Review-only by default. Re-run with -ConfirmApply after the metadata-only renewal is approved.'
}

$accessToken = (gcloud auth print-access-token).Trim()
try {
  $uri = "https://firebasehosting.googleapis.com/v1beta1/sites/$projectId/channels/$channel`?updateMask=expireTime"
  $body = @{ expireTime = $nextExpiry.UtcDateTime.ToString('o') } | ConvertTo-Json -Compress
  Invoke-RestMethod -Method Patch -Uri $uri -Headers @{ Authorization = "Bearer $accessToken" } -ContentType 'application/json' -Body $body | Out-Null
} finally { $accessToken = $null }

$verified = Get-Channel
if ([string]$verified.release.version.name -ne $ExpectedHostingVersion) {
  throw 'Hosting content changed during metadata renewal.'
}
if ([DateTimeOffset]::Parse([string]$verified.expireTime) -lt $nextExpiry.AddSeconds(-1)) {
  throw 'Hosting expiry renewal verification failed.'
}
Write-Host 'CAL-PILOT Hosting expiry renewed without creating a release or changing content.'

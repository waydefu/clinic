# Pure reference conversion only: no file, credential, SDK or provider access.
function Assert-PinnedSecretVersion([object]$Version) {
  if ($null -eq $Version -or [string]$Version -cnotmatch '^[1-9][0-9]*\z') {
    throw 'Secret references require an explicit positive numeric version.'
  }
  return [string]$Version
}

function ConvertTo-PinnedSecretVersion([string]$Resource, [string]$SecretName, [string[]]$Projects) {
  $secret = [regex]::Escape($SecretName)
  if ($Resource -cnotmatch "^projects/([^/]+)/secrets/$secret/versions/([^/]+)\z") {
    throw 'Created Secret version metadata does not match the expected container.'
  }
  if ($Matches[1] -cnotin $Projects) {
    throw 'Created Secret version metadata does not match the expected project.'
  }
  return (Assert-PinnedSecretVersion $Matches[2])
}

function Get-ApprovedExistingSecretVersion([string[]]$Resources, [string]$ExpectedVersion, [string]$SecretName, [string[]]$Projects) {
  if ($null -eq $Resources -or $Resources.Count -eq 0) {
    if (-not [string]::IsNullOrWhiteSpace($ExpectedVersion)) {
      throw 'The approved existing Secret version was not found.'
    }
    return $null
  }
  if ($Resources.Count -ne 1) {
    throw 'An existing Secret requires exactly one enabled version.'
  }
  $approved = Assert-PinnedSecretVersion $ExpectedVersion
  $actual = ConvertTo-PinnedSecretVersion $Resources[0] $SecretName $Projects
  if ($actual -cne $approved) {
    throw 'The existing Secret version drifted from the approved version.'
  }
  return $approved
}

function Get-PinnedSecretBindings([hashtable]$Versions, [string[]]$Bindings) {
  if ($null -eq $Versions -or $null -eq $Bindings -or $Bindings.Count -eq 0) {
    throw 'Secret bindings require a version snapshot and explicit environment mappings.'
  }
  $names = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
  $result = [Collections.Generic.List[string]]::new()
  foreach ($binding in $Bindings) {
    if ($binding -cnotmatch '^([A-Z][A-Z0-9_]*)=([a-z][a-z0-9-]*)\z') {
      throw 'Secret binding mappings must contain only an environment name and container.'
    }
    $environmentName = $Matches[1]
    $secretName = $Matches[2]
    if (-not $names.Add($environmentName) -or $Versions.Keys -cnotcontains $secretName) {
      throw 'Secret binding mappings contain a duplicate environment or missing version.'
    }
    $version = Assert-PinnedSecretVersion $Versions[$secretName]
    $result.Add("${environmentName}=${secretName}:$version")
  }
  return $result -join ','
}

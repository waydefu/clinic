[CmdletBinding()]
param()

$projectId = 'beauessence-appointment-local'
$emulators = Get-CimInstance Win32_Process | Where-Object {
  $_.Name -eq 'java.exe' -and
  $_.CommandLine -like '*cloud-firestore-emulator*' -and
  $_.CommandLine -like "*--project_id $projectId*"
}

foreach ($emulator in $emulators) {
  Stop-Process -Id $emulator.ProcessId -Force -ErrorAction Stop
  Write-Output "Stopped local Firestore Emulator process $($emulator.ProcessId)."
}

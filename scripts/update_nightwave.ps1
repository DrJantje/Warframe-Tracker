$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$file = Join-Path $repo 'data\availability.json'
$git = Get-Command git -ErrorAction SilentlyContinue

if (-not $git) { throw 'Git is required. Install Git for Windows, then run this updater again.' }

$raw = Read-Host 'Paste the current Cred Offering item names, separated by commas'
if ([string]::IsNullOrWhiteSpace($raw)) {
  $confirm = Read-Host 'The shop list is empty. Type VERIFY EMPTY to mark every tracked Nightwave item unavailable'
  if ($confirm -ne 'VERIFY EMPTY') { throw 'Nightwave update cancelled.' }
  $items = @()
} else {
  $items = @($raw.Split(',') | ForEach-Object { $_.Trim() } | Where-Object { $_ } | Sort-Object -Unique)
}

$rotationEnd = Read-Host 'Optional rotation end in ISO format (press Enter if unknown)'
if ([string]::IsNullOrWhiteSpace($rotationEnd)) { $rotationEnd = $null }
else { $rotationEnd = ([DateTimeOffset]::Parse($rotationEnd)).ToString('o') }

$payload = [ordered]@{
  checkedAt = [DateTimeOffset]::Now.ToString('o')
  rotationEndsAt = $rotationEnd
  source = 'manual-in-game'
  status = 'verified'
  activeNightwaveItems = $items
}
$json = $payload | ConvertTo-Json -Depth 4
[IO.File]::WriteAllText($file, $json + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))

Push-Location $repo
try {
  & $git.Source add data/availability.json
  & $git.Source diff --cached --quiet
  if ($LASTEXITCODE -eq 0) {
    Write-Host 'No Nightwave changes detected. Nothing was uploaded.'
    exit 0
  }
  $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm'
  & $git.Source commit -m "Update Nightwave stock $stamp"
  if ($LASTEXITCODE -ne 0) { throw 'Git commit failed.' }
  & $git.Source push origin main
  if ($LASTEXITCODE -ne 0) { throw 'GitHub upload failed. Check your Git sign-in.' }
} finally {
  Pop-Location
}

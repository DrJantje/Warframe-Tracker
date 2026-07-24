$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$export = Join-Path ([Environment]::GetFolderPath('Desktop')) 'AlecaFrame_Export'
$python = Get-Command python -ErrorAction SilentlyContinue
$git = Get-Command git -ErrorAction SilentlyContinue

if (-not $python) { throw 'Python is required. Install Python 3, then run this updater again.' }
if (-not $git) { throw 'Git is required. Install Git for Windows, then run this updater again.' }
if (-not (Test-Path -LiteralPath $export)) { throw "AlecaFrame export folder not found: $export" }

& $python.Source (Join-Path $repo 'scripts\import_export.py') $export
if ($LASTEXITCODE -ne 0) { throw 'AlecaFrame import failed.' }

Push-Location $repo
try {
  & $git.Source add data/warframe.json data/availability.json data/overrides.json
  & $git.Source diff --cached --quiet
  if ($LASTEXITCODE -eq 0) {
    Write-Host 'No tracker changes detected. Nothing was uploaded.'
    exit 0
  }
  $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm'
  & $git.Source commit -m "Update AlecaFrame snapshot $stamp"
  if ($LASTEXITCODE -ne 0) { throw 'Git commit failed.' }
  & $git.Source push origin main
  if ($LASTEXITCODE -ne 0) { throw 'GitHub upload failed. Check your Git sign-in.' }
} finally {
  Pop-Location
}

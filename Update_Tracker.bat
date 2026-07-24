@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\update_tracker.ps1"
if errorlevel 1 (
  echo.
  echo Update failed. Read the message above.
  pause
  exit /b 1
)
echo.
echo Tracker updated and sent to GitHub Pages.
pause

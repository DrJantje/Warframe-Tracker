# Warframe Acquisition Tracker

Public static tracker generated from Jantje's AlecaFrame export.

## Routine update

1. Export from AlecaFrame to `Desktop\AlecaFrame_Export`.
2. Double-click `Update_Tracker.bat` in the local repository clone.
3. The updater validates the eight JSON files, refreshes changed ownership/mastery records, preserves manual rank-40 overrides, commits the new snapshot, and pushes it to GitHub Pages.

Raw AlecaFrame exports are read locally and are not uploaded. The published repository contains only the normalized tracker snapshot and game-related acquisition data.

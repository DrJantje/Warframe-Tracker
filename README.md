# Warframe Acquisition Tracker

Public static tracker generated from Jantje's AlecaFrame data.

## Live account sync

The current ownership/mastery overlay comes from the private `DrJantje/Warframe-Account-Data` repository:

1. AlecaFrame updates its active `lastData.dat` cache.
2. The private account-data process publishes sanitized equipment data.
3. `scripts/build_tracker_sync.py` compares that data with this public tracker.
4. Only positive acquisition differences are emitted: newly owned items, newly mastered items, and explicit preservation overrides.
5. The private workflow copies the compact feed to `data/account-sync.json` when `TRACKER_PUBLISH_TOKEN` is configured. A local fallback publisher is also available in the private repository.
6. `app.js` merges the feed before rendering cards.

Safety rules:

- The live feed may promote ownership or mastery but never erase previously recorded mastery.
- Rank-40 completion is never inferred from ordinary Rank-30 affinity. It requires the existing explicit Rank-40 confirmation system.
- Full builds, installed mods, loadouts, currencies, resources, account identifiers, and the raw cache are not published here.

## Full acquisition refresh

The original eight-file AlecaFrame export remains useful for data that `lastData.dat` does not yet normalize completely, including exact Foundry state, blueprints/components, relic inventory, and constructible sets.

1. Export from AlecaFrame to `Desktop\AlecaFrame_Export`.
2. Double-click `Update_Tracker.bat` in the local repository clone.
3. The updater validates the eight JSON files, refreshes the normalized tracker snapshot, preserves manual Rank-40 overrides, commits the result, and pushes it to GitHub Pages.

Raw AlecaFrame exports are read locally and are not uploaded. The published repository contains only the normalized tracker snapshot, the compact positive account-sync feed, and game-related acquisition data.

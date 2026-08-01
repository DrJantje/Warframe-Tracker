# First-PC Test Card

## Before Warframe

- Install `Warframe-Session-Intelligence-v0.2.0.streamDeckPlugin`.
- Add the four actions in order: Matchmaking, Focus Remaining, Equipment Rank, Live Event.
- Turn Demo mode on and verify all four keys change every six seconds; then turn it off.
- Leave username and `EE.log` blank unless automatic discovery fails.
- If Focus displays `?/cap`, browse to AlecaFrame's `lastData.dat` in settings.

## Warframe test

| Step | Expected result |
|---|---|
| Switch Public → Solo → Public in the Orbiter | Exact mode if logged; otherwise the mission establishes Solo versus Online |
| Start a Public mission | Matchmaking shows Public or Online plus `x/4` |
| Earn visible Focus | Remaining decreases when the baseline is known; otherwise session gain increases |
| Rank one unmaxed item | Rank key shows `↑N` and the item name |
| Pick up Steel Essence, Argon, a blueprint, or another notable reward | Live Event shows the item temporarily |
| Wait | Live Event returns to mission progress or timer |
| Press Rank | Cycles detected equipment |
| Press Live Event | Cycles recent events |

## Afterward

Open any plugin action's settings and click **Save sanitized diagnostics to Desktop**. Keep `Warframe-StreamDeck-Diagnostics.json`; it contains only matched, sanitized telemetry needed to tune current log phrases, not the complete `EE.log`.
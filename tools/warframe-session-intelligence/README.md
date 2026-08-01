# Warframe Session Intelligence v0.2

Four-key Stream Deck prototype:

1. **Matchmaking** — Solo, exact privacy mode when logged, or honest Online; includes squad occupancy.
2. **Focus Remaining** — active school and remaining daily Lens-Focus cap when detectable.
3. **Equipment Rank** — latest frame, weapon, or companion rank-up; press to cycle detected equipment.
4. **Live Event** — notable loot/event pulse, then mission progress or timer; press to cycle recent events.

The packaged prototype is prepared outside this public tracker repository because it may inspect local `EE.log` and an optional AlecaFrame `lastData.dat`. Neither local file is uploaded. The first real-PC calibration should test Public/Solo switching, Focus gain, one equipment rank-up, and one notable reward, then export the plugin's sanitized diagnostic report.

See `TEST_PLAN.md` for the exact calibration sequence.
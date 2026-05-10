Build the DCS reference data JSON (units, weapons, airdromes) used to replace hand-crafted backend CSVs.

## Steps

1. Run `node dev/tools/buildReferenceData.js generate` from the repo root. This scans `D:\DCS World`, generates the mission script, and deploys both hook files to Saved Games automatically.

2. Tell the user the files have been deployed and they need to:
   - Fully close and restart DCS (hooks only load at DCS startup)
   - Load any mission (needed for airdrome data — theater doesn't matter for units/weapons)
   - Wait for the mission to finish loading

3. Ask the user to confirm when the mission has loaded and they are in-game.

4. Once confirmed, run `node dev/tools/buildReferenceData.js process` to read the DCS output and write `dev/tools/dcs-reference-data.json`.

5. Show the user the summary (units, weapons, airdromes, theater counts).

6. Clean up: delete the two deployed DCS files so normal operation is restored:
   - `C:\Users\burnz\Saved Games\DCS\Scripts\Hooks\DCS-CheckrideEnricher.lua`
   - `C:\Users\burnz\Saved Games\DCS\checkride-enricher-mission.lua`
   Tell the user to restart DCS to restore normal Checkride hook behaviour.

## Notes

- Weapons are derived entirely from static Lua file scanning — no DCS API call needed for them. If `Weapon.getDescByName` fails silently (as it does in the MSE at mission load), this is expected and handled.
- Units come from `Unit.getDescByName` via the MSE. Airdromes come from `world.getAirbases()` and vary by theater — load missions from different theaters to accumulate more airdromes (re-run process after each).
- The `checkride-enrichment.json` in Saved Games accumulates across sessions within the same DCS launch. Restarting DCS resets it.
- After a DCS World update, check for new `.lua` files in the weapon pack directories and update `FILE_WEAPON_META` in `dev/tools/scanCandidates.js` if any new files appeared.

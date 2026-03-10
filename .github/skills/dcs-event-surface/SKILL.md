---
name: dcs-event-surface
description: Reference for where DCS event data originates and how to discover available fields for achievements/state.
---

# DCS Event Surface Reference

Use this when you need to answer: "What data do we get from DCS for achievements/stats?"

## Source of truth layers
1. Lua emitters (DCS side)
- `Scripts/Hooks/DCS-Checkride-hook.lua`
- `DCS-Checkride/Scripts/DCS-CheckrideGameGUI.lua`
- `DCS-Checkride/Scripts/DCS-CheckrideMission.lua`

2. Client ingress
- `app/services/udpServer.js` receives UDP JSON payloads.
- `app/appInit.js` attaches event pipeline and evaluates achievements.

3. Event classes / payload shaping
- `app/factories/eventFactory.js`
- `app/events/*.js` (prepare payloads for API)

4. State + unlock logic
- `app/services/pilotState.js`
- `app/services/achievementEngine.js`

## Practical way to discover available fields
1. Inspect emitted Lua payloads in the files above.
2. Check which fields are consumed in:
- `pilotState.apply*` methods
- achievement `evaluate()` methods
- event classes in `app/events/*.js`
3. Verify backend storage/usage in `checkride` `events_controller` and metrics schemas.

## Discovering DCS internals you can leverage
Use this playbook when you need to find new data for achievements/stats.

1. Start from `onGameEvent` arguments
- In `DCS-CheckrideGameGUI.lua`, inspect `Checkride.onGameEvent(eventName, arg1, ... arg7)`.
- For a target event type (`kill`, `takeoff`, `landing`, etc.), trace its specific handler and what each arg maps to.

2. Probe object APIs defensively
- In Lua handlers, gate every access with nil/type checks before reading object data.
- Useful patterns to probe:
	- object identity (`id_`, `getID`, player/unit names)
	- category/domain/family attributes
	- position/altitude/speed values
	- weapon/missile descriptors

3. Inspect unit/weapon descriptors and attributes
- Use existing helper patterns like `DCS.getUnitTypeAttribute(..., "attribute")`.
- Log full attribute sets for unknown units/weapons, then normalize into stable fields (family/domain/category) before sending to client.

4. Use Mission bridge for data only available in mission env
- If GameGUI cannot access needed data directly, add extraction in `DCS-CheckrideMission.lua` and forward via the mission bridge queue consumed by `DCS-Checkride-hook.lua`.

5. Add temporary debug payloads, then remove
- Add narrowly-scoped debug logs in Lua (`Checkride.log`) and client (`electron-log`) to verify field availability.
- Keep debug fields out of permanent API payloads unless they are intentionally supported.

6. Normalize early, keep IDs stable
- Convert fragile/raw labels into normalized enums/strings in Lua or client enrichment layer.
- Prefer stable keys for achievements (e.g., `weapon_family`, `victim_unit_domain`) over display labels.

## Validation loop for new DCS-derived fields
1. Confirm field appears in UDP payload (`udpServer` log path).
2. Confirm field survives `EventFactory`/`app/events/*.js` preparation.
3. Confirm field is visible where used (`pilotState` or `evaluate()`).
4. If needed in UI stats, confirm it is ingested and counted in backend schemas.

## Safety rules while exploring DCS internals
- Never assume fields exist across all modules/servers/AI/player contexts.
- Guard all Lua object dereferences.
- Prefer additive changes to payloads; avoid breaking existing keys.
- Keep fallback behavior explicit (`unknown`, `null`) rather than dropping events silently.

## Local DCS install access (read-only)
If running on a machine that has DCS installed, you can request read-only access to DCS script files under the installation path for deeper discovery.

Recommended targets:
- `<DCS_INSTALL>\\Scripts\\` (core Lua APIs and helpers)
- `<DCS_INSTALL>\\MissionEditor\\` (if mission-related internals are needed)
- `Saved Games\\DCS*\\Scripts\\` (user/server hook scripts)

Rules for access:
- Request read-only access only.
- Do not modify files under the DCS install directory.
- Copy snippets or findings into notes/tests inside this repo instead of patching installed game files.

## Important constraint
Not every field from DCS is persisted to Rails counters by default.
- Achievement logic can use in-memory event/state fields in client.
- UI aggregate stats depend on backend-ingested event fields + metric schemas.

## Adding a new DCS-derived field (high-level)
1. Emit field from Lua event source.
2. Preserve it through client event path (`udpServer` -> `EventFactory`/event class -> API payload).
3. Add/consume in `PilotState` or achievement evaluate logic if needed.
4. If backend stats/UI need it, map it in `checkride` ingest + metric schema/counter logic.

# Gauges — Problem Statement, Evidence & Timeline

## What the gauge system is supposed to do

Each pilot's personal-best values (highest speed, longest missile hit, most kills in a sortie, etc.) are tracked as **pilot gauges**. The flow:

1. DCS Lua mission script emits `flight_sample_enrichment` / `hit_enrichment` / `kill_enrichment` events (all with `persist: false`) at high frequency.
2. `AchievementEngine.evaluate()` applies these to `PilotState`, which maintains running high-water marks (`highestSpeedKts`, `longestMissileHit`, etc.).
3. After each event, `AchievementEngine.buildSnapshot()` + `GaugeSync.syncSnapshot()` serialise the state and submit any improving gauge values to `PATCH /pilot_gauges/:id` on the Rails API.
4. `GaugeSync` debounces high-frequency telemetry writes with a 6-second settling window, but flushes immediately on `landing`, `disconnect`, `crash`, and similar terminal events.
5. The UI reads gauges from `GET /pilot_gauges?player_ucid=…` and displays them in the Stats page (High Scores section) and Dashboard leaderboards.

## Timeline of attempts

| Commit / date | What was tried | Result |
|---|---|---|
| `fc0afb8` PR #81 | Initial gauge implementation merged | Gauges exist, first session |
| `12f85b8` | Fix gauges and weapon type detection | Some gauges start recording |
| `3258d00` | Attempt to map UCIDs to resolve missing gauges | UCID race on `flight_sample_enrichment` events partially mitigated |
| `63956be` | Another UCID mapping attempt | Branch, never merged |
| `7eb3a06` (Copilot, Apr 2026) | Fix inflight-collision silent drop + Math.max cache update | **Branch `copilot/fix-ensure-loaded-gauge-updates` — never merged** |
| `82513f0` (Copilot, Apr 2026) | Fix `ensureLoaded` failure silently dropping all gauge updates | **Same branch — never merged** |
| `82e4532`, `2ecf95a`, `273377c` | Add more gauge types (armor, SEAD, distance) | Added to registry and client |
| v1.4.2 (current) | Still no gauges | 🐋 |

## Root causes found

### Bug 1 — `fetchPilotGauges` failure silently drops all gauge updates

**Where:** `GaugeSync.ensureLoaded()` / `GaugeSync.syncSnapshot()`

**What happens:** `ensureLoaded` issues `GET /pilot_gauges?player_ucid=…`. If that request fails (network error, 5xx, anything non-200), the returned promise rejects. The rejection propagates out through `syncSnapshot`'s `.catch`, which only logs a warning and returns. No gauge updates are submitted for that snapshot.

Because the pilot is never added to `gaugesByPilot`, every subsequent `syncSnapshot` call re-attempts `fetchPilotGauges` — creating a tight retry loop with zero backoff — while continuing to drop every gauge update until a load finally succeeds.

**Fix (now applied):** Add a `.catch` inside `ensureLoaded` that catches the failure, sets `gaugesByPilot[pilot] = {}`, and returns `{}`. The empty baseline is safe because the server enforces `max` comparison on `PATCH /pilot_gauges/:id`, so re-submitting a value the server already has is idempotent.

### Bug 2 — In-flight PATCH silently drops the next gauge update

**Where:** `GaugeSync.submitGaugeUpdate()`

**What happens:** If a PATCH for `pilot:gauge` is already in-flight and the settling timer fires again for the same key (because a higher value arrived), `submitGaugeUpdate` sees `inflightByGauge.has(key)` and returns immediately. The pending entry was already deleted by `flushPendingGauge`, so there's nothing left to retry. The new, higher value is lost.

**Fix (now applied):** When inflight, call `handleSettlingGauge` with the new value before returning, so the value is re-queued with a fresh settling timer.

### Bug 3 — Cache update ignored the server's authoritative max (minor)

**Where:** `submitGaugeUpdate` response handler

**What happens:** After a successful PATCH, the local cache was updated to `response.value ?? value`. If a concurrent session on another machine had already pushed a higher value, `response.value` would reflect that higher number — but the old code didn't take the max, so the local cache could end up stale-low, causing unnecessary future submissions.

**Fix (now applied):** Cache is now updated to `Math.max(serverValue, localValue)`.

### Bug 4 — `coalition.getPlayers()` returns empty roster; no `flight_sample_enrichment` events ever emitted

**Where:** `DCS-Checkride/Scripts/DCS-CheckrideMission.lua` — `buildTelemetryRoster()` / `appendSidePlayers()`

**What happens:** The mission script builds its telemetry roster by calling `coalition.getPlayers(side)` for red, blue, and neutral coalitions. If this function does not exist or returns a non-table in the DCS environment running on the production server (older DCS version, dedicated server mode, or API not available in mission scripting sandbox), `appendSidePlayers` silently returns an empty list. The roster is always `{}`. `rosterSize = 0` in `sampleTelemetryTick`, the emit block is never entered, and **zero `flight_sample_enrichment` events are ever produced**. `applyFlightSampleEnrichment` is never called in Electron; `currentSpeedKts`, `highestSpeedKts`, `highestAltitudeFt`, `sortieDistanceKm` etc. remain null/0 for every pilot, every session.

**Evidence:** Screenshot of pilot state mid-flight shows Status=Airborne, Takeoff location set (from GameGUI `takeoff` event which always works), but Speed/Altitude/Fuel/Sortie distance all "—". This is only possible if `applyFlightSampleEnrichment` has never been called for this pilot.

**Why same-box works:** The user's own server may run a DCS version or configuration where `coalition.getPlayers()` returns the expected unit list, so the roster is non-empty and telemetry flows.

**Fix (TODO):** Replace `coalition.getPlayers()` as the unit-discovery mechanism. The hook already maintains a reliable complete player list via `net.get_player_list()` + `net.get_player_info()`. Extend `syncAllPlayers` in the hook to also inject a `CheckridePlayerUnits` table mapping `playerName → unitName`. The mission script can then resolve units via `Unit.getByName()` for each entry in `CheckridePlayers`, bypassing `coalition.getPlayers()` entirely.

**Verification:** Add `CheckrideMission.log("telemetry roster size: " .. tostring(#entries))` at the end of `buildTelemetryRoster`. If this logs `0` every second on the production server while pilots are flying, the bug is confirmed.

### Bug 5 — Scheduler crash permanently kills telemetry (now fixed)

**Where:** `DCS-Checkride/Scripts/DCS-CheckrideMission.lua` — `sampleTelemetryTick` / `sampleActiveWeaponsTick`

**What happens:** Both scheduler tick functions had no pcall protection. A single Lua error inside any DCS API call (`coalition.getPlayers`, `unit:getPlayerName`, `table.sort`, `unit:getVelocity`, `unit:getAmmo`, etc.) would propagate uncaught. DCS does not reschedule a timer function that errors — the scheduler dies permanently for the rest of the session. All subsequent `flight_sample_enrichment` events stop. Additionally, `cfg.nextPilotIndex` or `cfg.roster` being nil (e.g., after a table replacement or mission hot-reload) could throw a comparison error on the very next tick, killing the sampler before a single event is emitted.

**Fix (now applied):** Both tick functions are now wrapped in `pcall`. On error: logs the message via `CheckrideMission.log`, returns `timer.getTime() + 1` to reschedule in 1 second, and recovers automatically. Also hardened: `cfg.roster or {}` prevents nil-length error; `not cfg.nextPilotIndex` guard prevents nil comparison; `if entry then` guard before emit.

## What the fixes do NOT cover

- **UCID race on mission script events**: `flight_sample_enrichment` events arrive from the DCS mission script before or after the `connect` event. If the event arrives before `ucidByName` is populated, `playerUcid` is null and the snapshot is skipped entirely. The `9dcf22d` periodic UCID sync partially addresses this but doesn't eliminate it.
- **Mission scripting disabled**: If `mission_scripting_enabled = false` in settings, no enrichment events are emitted. Gauges that depend on `flight_sample_enrichment` (speed, altitude, distance) will never record. Kill-based gauges (from `kill_enrichment`) are also gated by mission scripting.
- **Gauge values of zero**: Kill-count gauges (ground, air, SEAD, armor) report zero at sortie start. Zero values are submitted on first connect and stored, which is correct — they'll update as kills accumulate. The UI filters out `NaN`/non-finite, but does show zero.

## Files involved

| File | Role |
|---|---|
| `app/services/gaugeSync.js` | Debounce, compare, and POST gauge updates |
| `app/services/achievementEngine.js` — `serializeState()` | Builds the gauges snapshot from PilotState |
| `app/services/pilotState.js` — `applyFlightSampleEnrichment()`, `applyHitEnrichment()` | Maintains high-water marks |
| `app/clients/apiClient.js` — `fetchPilotGauges()`, `updatePilotGauge()` | HTTP calls |
| `../checkride/app/controllers/pilot_gauges_controller.rb` | Server endpoint (GET index, PATCH update with max/min comparison) |
| `../checkride/app/models/gauge.rb` — `REGISTRY` | Leaderboard gauge definitions (source: `:pilot_gauges` or `:events`) |
| `../checkride-ui/src/pages/StatsPage.tsx` — `GAUGE_LABELS` | Which gauges show in personal stats |
| `../checkride-ui/src/pages/DashboardPage.tsx` — `HIGH_SCORE_GAUGES` | Which gauges show in the leaderboard |

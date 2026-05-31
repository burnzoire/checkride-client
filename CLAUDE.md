# checkride-client

Electron desktop app (v1.x) that bridges DCS World → Checkride API. Runs in the system tray on the DCS server Windows PC. Listens on UDP 41234 for Lua events, processes them, posts to the Rails API, and sends Discord notifications.

## Stack

- Electron 40.x, Node.js, JavaScript (CommonJS — no TypeScript)
- Jest 30 (80% coverage threshold enforced)
- electron-builder for packaging (NSIS installer for Windows, also macOS/Linux)
- DCS Lua mod files in `DCS-Checkride/Scripts/` and `Scripts/Hooks/`

## Commands

Run all commands from `app/` using **PowerShell** (Bash does not produce output reliably on windows).

```powershell
npm test                # Jest unit tests — always keep green
npm run test:coverage   # with 80% coverage threshold
npm run lua:test        # Busted Lua specs
npm start               # launch Electron (dev mode)
npm run prepare:lua     # stamps __CHECKRIDE_CLIENT_VERSION__ into Lua files → build/lua-versioned/
npm run deploy:lua      # deploys stamped Lua files to DCS Saved Games folder
npm run dist            # package installer (runs prepare:lua first)
npm run release         # electron-builder --publish=always (GitHub releases)
```

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full system diagram including DCS Lua script interactions, external services, and event pipeline detail.

### Event pipeline (`app/appInit.js`)

UDP event → `EventProcessor` (stamps `event_uid`, applies `AirborneTracker` enrichment) → normalize pilot identity (UCID fallback by name map) → lifecycle check (ready/connect/change_slot) → `AchievementEngine.evaluate()` → decide `persist: false` vs persist → `ApiClient.saveEvent()` → dispatch Discord + DCS chat from API response.

### Key services

- `app/services/udpServer.js` — UDP listener on port 41234
- `app/services/eventProcessor.js` — stamps a deterministic `event_uid` (UUIDv5) on each event and applies `AirborneTracker` enrichment before the event enters the pipeline
- `app/services/airborneTracker.js` — tracks per-pilot takeoff time; attaches `duration_seconds` to landing events
- `app/services/achievementEngine.js` — in-memory achievement evaluation. Loads existing lifetime achievements from API on pilot connect/change_slot to avoid re-awarding.
- `app/services/pilotState.js` — per-pilot state machine
- `app/services/gaugeSync.js` — debounced max-comparison writes to API; flushes immediately on landing/disconnect/crash.
- `app/services/sortieLogger.js` — writes per-pilot per-sortie JSONL flight logs to disk (7-day retention). Logs `flight_sample_enrichment` snapshots during the sortie and a start/end record.
- `app/services/heartbeatService.js` — pings the API every 60s with connected player count; sets the New Relic server name on first response.
- `app/services/healthChecker.js` — polls `/up` every 5s, updates tray icon colour.
- `app/clients/newRelicClient.js` — fire-and-forget structured log shipping to New Relic Log API. No-op when no license key is configured (`NEW_RELIC_LICENSE_KEY` env var or baked at build time).

### Achievements (`app/achievements/`)

~35 named achievement classes (each has a `.test.js`). Lifetime per pilot — awarded once ever, persisted to the API. On pilot connect/change_slot, existing achievements are loaded from the API so they're never re-awarded. Each achievement extends a base class with `.evaluate(event, state)`.

### Gauges

`onsimulationframe` events arrive at ~60fps and carry telemetry (speed, altitude, etc.). `GaugeSync` compares against current API max and writes if beaten, debounced 6s. Be cautious about changes here — gauge logic is difficult to test without a live DCS session.

### Lua integration

Three Lua files:
- `Scripts/Hooks/` — hook script (runs at DCS startup)
- `DCS-Checkride/Scripts/GameGUI/` — GUI script
- `DCS-Checkride/Scripts/Mission/` — mission script

All carry `__CHECKRIDE_CLIENT_VERSION__` stamped at build time. On each `ready` event, the Lua version is compared to `package.json` version; mismatch triggers a native dialog warning. **Always run `npm run prepare:lua` before testing Lua changes locally** (`npm run deploy:lua` copies to the DCS Saved Games folder).

DCS World install is at `D:\DCS World` — review Lua scripts there if needed.

### Settings persistence (`app/config.js`)

`electron-store` with JSON schema. Settings update live — saving triggers immediate re-wiring of API client and event pipeline.

### Installer

NSIS installer (Windows) copies three Lua files from `extraResources/dcs/` into the user's DCS Saved Games folder at install time. This makes deployment easy for DCS server admins.

## DCS domain knowledge

- **UCID** — stable unique client ID per player. Primary identity.
- **onsimulationframe** — DCS Lua callback at ~60fps. Used for telemetry gauges. High frequency — be careful about what processing happens here.
- **change_slot** — pilot switches aircraft. Resets achievement session state if `flyable: true`.
- **ready** — DCS has loaded and is ready. Triggers Lua version check.
- Lua scripts run inside the DCS process; changes require DCS restart to take effect.

## Known outstanding work

- **Multiple DCS instances on a single machine** — not yet solved. The current architecture assumes one DCS instance per machine (single UDP port 41234). Tracking multiple instances would require per-instance port assignment or a discovery mechanism.
- **`buildTelemetryRoster` in mission Lua** — uses `coalition.getPlayers(side)` which may not be available in all DCS server configurations. Fix: inject player→unit mappings from the hook (which has `net.*` access) via `CheckridePlayerUnits`.

## Key files

- `app/appInit.js` — full service wiring and event pipeline
- `app/services/achievementEngine.js` — achievement evaluation
- `app/achievements/` — individual achievement definitions (~35)
- `app/clients/apiClient.js` — all API calls
- `app/services/gaugeSync.js` — gauge high-water-mark sync
- `app/services/sortieLogger.js` — per-sortie JSONL flight logs
- `app/clients/newRelicClient.js` — production observability
- `app/config.js` — electron-store settings schema

## Adding a new gauge

Gauges track per-pilot high-water-mark values (max speed, max altitude, etc.) and are synced to the API via `GaugeSync`. No changes to `GaugeSync` itself are needed.

1. **Track the value in `app/services/pilotState.js`** — add the state field to `_resetSortieState()` and update it in the appropriate `apply*Enrichment()` method. Use `applyFlightSampleEnrichment` for telemetry values from `onsimulationframe` events, or `applyHitEnrichment` for weapon-hit-derived values.

2. **Expose it in `app/services/achievementEngine.js`** — in `serializeState()`, add the gauge ID and its value to the `gauges` object. Ensure units match what the server expects (e.g. convert km → nm by dividing by 1.852, or use the `METERS_TO_NM` constant for meters → nm conversions).

3. **Register on the server** — add a `Definition` entry to `REGISTRY` in `../checkride/app/models/gauge.rb` with `source: :pilot_gauges` and the appropriate aggregation (`:max` for highest-ever, `:min` for lowest-ever).

4. **Display in the UI** — add the gauge ID to `HIGH_SCORE_GAUGES` in `../checkride-ui/src/pages/DashboardPage.tsx`, add a label to `GAUGE_LABELS` in `StatsPage.tsx`, and add a format case in `formatGaugeValue()` in `StatsPage.tsx`.

## Testing

- Run `npm test` from `app/` (that's where `package.json` lives — not the repo root).
- Each achievement has its own `.test.js` — keep these up to date when adding or changing achievements.
- Gauge logic (onsimulationframe) is difficult to test without a live DCS session.

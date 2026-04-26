# checkride-client

Electron desktop app (v1.x) that bridges DCS World → Checkride API. Runs in the system tray on the DCS server Windows PC. Listens on UDP 41234 for Lua events, processes them, posts to the Rails API, sends Discord notifications, and streams live pilot telemetry via ActionCable WebSocket.

## Stack

- Electron 40.x, Node.js, JavaScript (CommonJS — no TypeScript)
- Jest 30 (80% coverage threshold enforced)
- electron-builder for packaging (NSIS installer for Windows, also macOS/Linux)
- DCS Lua mod files in `DCS-Checkride/Scripts/` and `Scripts/Hooks/`

## Commands

```bash
npm test                # Jest unit tests — always keep green
npm run test:coverage   # with 80% coverage threshold
npm start               # launch Electron (dev mode)
npm run prepare:lua     # stamps __CHECKRIDE_CLIENT_VERSION__ into Lua files → build/lua-versioned/
npm run deploy:lua      # deploys stamped Lua files to DCS Saved Games folder
npm run dist            # package installer (runs prepare:lua first)
npm run release         # electron-builder --publish=always (GitHub releases)
```

## Architecture

### Event pipeline (`app/appInit.js`)

UDP event → normalize pilot identity (UCID fallback by name map) → lifecycle check (ready/connect/change_slot) → `AchievementEngine.evaluate()` → decide `persist: false` vs persist → `ApiClient.saveEvent()` → dispatch Discord + DCS chat from API response.

### Key services

- `app/services/udpServer.js` — UDP listener on port 41234
- `app/services/achievementEngine.js` — in-memory achievement evaluation. Loads existing lifetime achievements from API on pilot connect/change_slot to avoid re-awarding.
- `app/services/pilotState.js` — per-pilot state machine
- `app/services/pilotStatePublisher.js` — ActionCable WebSocket publisher. **Currently disabled** — the implementation spammed the server too hard. Needs a rethink before re-enabling.
- `app/services/gaugeSync.js` — debounced max-comparison writes to API; flushes immediately on landing/disconnect/crash.
- `app/services/healthChecker.js` — polls `/up` every 5s, updates tray icon colour.

### Achievements (`app/achievements/`)

~15 named achievement classes (each has a `.test.js`). Lifetime per pilot — awarded once ever, persisted to the API. On pilot connect/change_slot, existing achievements are loaded from the API so they're never re-awarded. Each achievement extends a base class with `.evaluate(event, state)`.

### Gauges

`onsimulationframe` events arrive at ~60fps and carry telemetry (speed, altitude, etc.). `GaugeSync` compares against current API max and writes if beaten, debounced 6s. Testing gauge logic requires a live DCS session or the demo mode — be cautious about changes here.

### Lua integration

Three Lua files:
- `Scripts/Hooks/` — hook script (runs at DCS startup)
- `DCS-Checkride/Scripts/GameGUI/` — GUI script
- `DCS-Checkride/Scripts/Mission/` — mission script

All carry `__CHECKRIDE_CLIENT_VERSION__` stamped at build time. On each `ready` event, the Lua version is compared to `package.json` version; mismatch triggers a native dialog warning. **Always run `npm run prepare:lua` before testing Lua changes locally** (`npm run deploy:lua` copies to the DCS Saved Games folder).

DCS World install is at `D:\DCS World` — review Lua scripts there if needed.

### Demo mode (`app/demo/demoController.js`)

Generates seeded pseudo-random DCS events (Top Gun roster, carrier traps, kill sequences) and fires them into UDP 41234. Use for full end-to-end testing without a live server.

### Settings persistence (`app/config.js`)

`electron-store` with JSON schema. Settings update live — saving triggers immediate re-wiring of API client, pilot state publisher start/stop, and event pipeline.

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

## Key files

- `app/appInit.js` — full service wiring and event pipeline
- `app/services/achievementEngine.js` — achievement evaluation
- `app/achievements/` — individual achievement definitions
- `app/clients/apiClient.js` — all API calls
- `app/services/gaugeSync.js` — gauge high-water-mark sync
- `app/services/pilotStatePublisher.js` — ActionCable WebSocket
- `app/config.js` — electron-store settings schema

## Testing

- Run `npm test` before pushing.
- Each achievement has its own `.test.js` — keep these up to date when adding or changing achievements.
- Gauge logic (onsimulationframe) is difficult to test without a live DCS session. Use demo mode for smoke testing but be aware it doesn't replicate real frame rates.

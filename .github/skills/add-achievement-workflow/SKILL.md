---
name: add-achievement-workflow
description: End-to-end checklist for adding a new achievement across checkride-client, checkride API, and checkride-ui.
---

# Add Achievement Workflow (all repos)

Use this skill when adding or changing achievements.

## Scope map
- `checkride-client`: unlock logic, pilot state reads/updates, API persistence calls.
- `checkride`: achievement definitions returned to UI and persisted records.
- `checkride-ui`: achievement display names/icons and pilot/global views.

## 1. Understand the event source from DCS
DCS events originate in Lua and are sent to the desktop client over UDP JSON.

Key files:
- `Scripts/Hooks/DCS-Checkride-hook.lua`
- `DCS-Checkride/Scripts/DCS-CheckrideGameGUI.lua`
- `DCS-Checkride/Scripts/DCS-CheckrideMission.lua`
- `app/services/udpServer.js` (client UDP receive)

Notes:
- GameGUI/hook emits base events (`kill`, `landing`, `grading`, etc.).
- Mission/game GUI can emit enrichment events (`kill_enrichment`, `hit_enrichment`, `flight_sample_enrichment`, `refuel_enrichment`, etc.).

## 2. Add unlock logic in checkride-client
### 2.1 Choose trigger type and required state
- Trigger dispatch lives in `app/services/achievementEngine.js`.
- Pilot session state lives in `app/services/pilotState.js`.
- If needed data is not in state yet, add/extend an `apply*` method in `PilotState`.

### 2.2 Create achievement class
1. Add file: `app/achievements/<newAchievement>.js`
2. Extend `app/achievements/achievement.js`
3. Set:
- `id` (snake_case, stable)
- `name`
- `description`
- `triggerType`
4. Implement `evaluate(event, state)` with deterministic checks.

### 2.3 Register achievement
- Add import and append to `ALL_ACHIEVEMENTS` in `app/achievements/index.js`.

### 2.4 Add tests
- Create `app/achievements/<newAchievement>.test.js`.
- Verify metadata (`id`, `triggerType`) and threshold/edge behavior.
- If state behavior changed, add tests in:
  - `app/services/pilotState*.test.js` or
  - `app/services/achievementEngine.test.js`

## 3. Ensure persistence/API path is intact
Achievement persistence path in client:
- `app/appInit.js` evaluates events and calls `apiClient.saveAchievement(...)`
- API client endpoint: `app/clients/apiClient.js` -> `POST /pilot_achievements`

Gauge path (if using high-score style state):
- `app/services/gaugeSync.js`
- API endpoint: `PATCH /pilot_gauges/:id`

## 4. Update checkride backend definitions
UI list is driven by backend `DEFINITIONS`.

Required update:
- Add entry in `checkride/app/controllers/achievements_controller.rb`
  - Must match client `id`
  - Include `name` and `description`

Persistence endpoints/models:
- `checkride/app/controllers/pilot_achievements_controller.rb`
- `checkride/app/models/pilot_achievement.rb`

## 5. Update checkride-ui presentation
Update icon maps so the new achievement renders consistently:
- `checkride-ui/src/pages/AchievementsPage.tsx`
- `checkride-ui/src/pages/PilotPage.tsx`

Data hooks/services:
- `checkride-ui/src/services/achievementsService.ts`
- `checkride-ui/src/hooks/useAchievements.ts`
- `checkride-ui/src/hooks/usePilotAchievements.ts`

## 6. Verify locally
### checkride-client (native Windows preferred)
From `app/`:
- `npm test -- achievements/<newAchievement>.test.js --runInBand`
- Optional broader: `npm test`

### checkride backend (docker compose development)
From `checkride/`:
- `docker compose -f docker-compose.development.yml exec app bash -lc "bundle exec rspec spec/requests/pilot_achievements_spec.rb"`
- `docker compose -f docker-compose.development.yml exec app bash -lc "bundle exec rspec spec/requests/achievements_spec.rb"`

### checkride-ui
From `checkride-ui/`:
- `npm run lint`
- Optional Cypress test(s) for touched screens.

## 7. Metadata/counters troubleshooting
If pilot stats/metadata look stale in local dev, run in order:
1. `docker compose -f docker-compose.development.yml exec app bash -lc "bundle exec rails data:metadata"`
2. `docker compose -f docker-compose.development.yml exec app bash -lc "bundle exec rails metadata:backfill_events"`
3. `docker compose -f docker-compose.development.yml exec app bash -lc "bundle exec rails metrics:rebuild_counters CONFIRM=1"`

## 8. Common pitfalls
- Added client achievement but forgot backend `DEFINITIONS` -> UI missing entry.
- Added backend definition but forgot client registration in `ALL_ACHIEVEMENTS` -> never unlocks.
- Trigger type mismatch vs event type -> achievement never evaluates.
- Using state fields not updated by the trigger path -> always false.

# Design — A2G Achievements & State Enrichment

## Goals

1. Add a set of air-to-ground achievements with meaningful tactical context.
2. Enrich `pilotState` to support burst-window and spatial achievement evaluation.
3. Detect kills at **hit time**, not explosion time, so burst-window achievements work correctly.
4. Retire the server-side metadata CSV / DB lookup tables by pushing enrichment into the Lua mission script, which has direct access to DCS native APIs.

---

## Background: kill timing problem

`S_EVENT_KILL` fires when a unit's death animation completes — the explosion, not the impact. For armoured vehicles that smoke before dying this delay can be 10–30+ seconds. Two Hellfire hits landing 0.5s apart could produce kill events 20s apart, breaking any burst-window achievement.

**Solution:** use `S_EVENT_HIT` as the authoritative timestamp. At hit time `target:getLife()` already reflects post-impact damage. If `getLife() <= 1.0` the unit is effectively dead even if the explosion hasn't fired. The Lua script maintains a `pendingKillsByObjectId` map populated in `onHit` and resolved in `onKill`. The `kill_enrichment` event emitted to the client carries `killedAtMs` from the hit record, not the kill event time. Victim attributes are captured in `onHit` while the object still exists, since it may already be despawned by the time `S_EVENT_KILL` fires.

For non-lethal hits (`life > 1.0`), only a lightweight counter increment is sent — no per-hit records. This keeps memory bounded regardless of weapon rate of fire.

---

## pilotState

Fields marked *kills[]* are additions to entries in the existing `kills` array. Difficulty and priority columns are blank for existing fields.

| Field | Description | Source | Difficulty | Priority |
|---|---|---|---|---|
| **Session state** (survives across sorties) |||||
| `passes[]` | Every grading pass this session: `lsoGrade`, `wire`, `night`, `fuelState`, `carrierName`, `unitType` | `grading` event | — | — |
| `trapCount` | Derived: count of passes with a finite wire | `passes[]` | — | — |
| `nightTrapCount` | Derived: count of night traps | `passes[]` | — | — |
| `consecutiveBolters` | Derived: current bolter streak from end of passes | `passes[]` | — | — |
| `prevPassWasBolter` | Derived: second-to-last pass was a bolter | `passes[]` | — | — |
| `fuelAtTrap` | Derived: fuel state at most recent trap | `passes[]` | — | — |
| **Sortie state** (reset on takeoff / slot change) |||||
| `launchedFromCarrier` | Whether the pilot took off from a carrier this sortie | `takeoff_enrichment` | — | — |
| `takeoffLocation` | Carrier or airbase name at takeoff | `takeoff_enrichment` / `takeoff` | — | — |
| `lastTakeoffAtMs` | Timestamp of last takeoff | `takeoff_enrichment` / `takeoff` | — | — |
| `inAir` | Whether the pilot is currently airborne | `flight_sample_enrichment`, `takeoff`, `landing`, `crash` | — | — |
| `currentSlotId` | Current DCS slot ID | `change_slot` | — | — |
| **kills[]** (existing fields) |||||
| `victimUnitCategory` | `air`, `ground`, `ship`, or `other` | `kill_enrichment` | — | — |
| `carrierDistanceNm` | Distance in nm from pilot's carrier to victim at kill time, or null | `kill_enrichment` | — | — |
| **kills[]** (new fields) |||||
| `killedAtMs` | Hit timestamp for the killing blow — accurate burst-window anchor | `event.time` in `onHit` via `pendingKillsByObjectId` | Medium | P1 |
| `victimRoles[]` | DCS attribute flags at time of hit: `SAM SR`, `SAM TR`, `SAM launcher`, `Armour`, `Tanks`, `IFV`, `APC`, `AAA`, `Artillery`, `MLRS`, `Infantry`, etc. | `target:getDesc().attributes` in `onHit` | Medium | P1 |
| `weaponGuidance` | Guidance type of the killing weapon: `RADAR_PASSIVE` (ARM), `LASER`, `TV`, `IR`, `RADAR_ACTIVE`, etc. | `weapon:getDesc().guidance` in `onHit` | Easy | P1 |
| `victimPositionX/Y` | Victim world position at time of hit — enables spatial clustering | `target:getPoint()` in `onHit` | Medium | P2 |
| `pilotAltitudeFt` | Pilot barometric altitude at time of kill | Snapshot from `state.currentAltitudeFt` — no Lua change | Easy | P2 |
| `night` | Whether the kill occurred during night hours | `isNight(event.time)` in `onHit` | Easy | P3 |
| `killerUnitCategory` | Killer airframe category at kill time: `AIRPLANE` or `HELICOPTER` | `initiator:getDesc().category` in `onKill` | Easy | P3 |
| `victimTypeName` | Raw DCS unit type string, e.g. `"T-80U"` — metadata retirement prep | `target:getTypeName()` in `onHit` | Easy | P3 |
| `pilotSpeedMach` | Pilot speed in Mach at time of kill | Snapshot from `state.currentSpeedMach` — no Lua change | Easy | P3 |
| **Refuel state** |||||
| `lastRefuelDetectedAtMs` | Mission time of most recent completed refuel | `refuel_enrichment` | — | — |
| `lastRefuelFuelGain` | Fuel gained in most recent completed contact | `refuel_enrichment` | — | — |
| `lastRefuelContactDurationSeconds` | Duration of most recent completed contact | `refuel_enrichment` | — | — |
| `longestRefuelContactSeconds` | Session high-water for contact duration | `refuel_enrichment` | — | — |
| **Weapon tracking** |||||
| `weapons[]` | In-flight and recently completed weapon tracks: position, velocity, hit data, TTL 60s after completion | `shot_enrichment`, `weapon_sample_enrichment`, `hit_enrichment` | — | — |
| `missiles[]` | Filtered view of `weapons[]` — A2A missiles only | Derived | — | — |
| `longestWeaponHit` | Session high-water for weapon hit distance (nm) | `hit_enrichment` | — | — |
| `longestMissileHit` | Session high-water for A2A missile hit distance (nm) | `hit_enrichment` | — | — |
| **Flight telemetry** |||||
| `currentSpeedKts` / `currentSpeedMach` | Current speed | `flight_sample_enrichment` | — | — |
| `highestSpeedKts` / `highestSpeedMach` | Sortie high-water for speed | `flight_sample_enrichment` | — | — |
| `currentAltitudeFt` | Current barometric altitude | `flight_sample_enrichment` | — | — |
| `highestAltitudeFt` | Sortie high-water for altitude | `flight_sample_enrichment` | — | — |
| `currentRadarAltitudeFt` | Current radar altitude (AGL) | `flight_sample_enrichment` | — | — |
| `currentPositionX/Y` | Current world position | `flight_sample_enrichment` | — | — |
| `currentFuelState` | Current fuel state (0.0–1.0) | `flight_sample_enrichment` | — | — |
| **New standalone fields** |||||
| `currentUnitCategory` | Current airframe category: `AIRPLANE` or `HELICOPTER` | `unit:getDesc().category` added to `flight_sample_enrichment` | Easy | P1 |
| `hitCounters` | Map of hit counts by `role_coalition`, e.g. `armour_enemy: 5`. Incremented on every `S_EVENT_HIT` where `life > 1.0`. Bounded by role/coalition combinations, not rounds fired. | Lightweight `hit_enrichment` from `onHit` | Medium | P2 |
| `activeThreats[]` | Sliding window of nearby AI weapon launches: `{ role, launchedAtMs }`. Roles: `SAM`, `AAA`, `MLRS`. Pruned after ~30s TTL. | New AI path in `onShot`: checks `initiator:getDesc().attributes`, range-checks all players via `buildTelemetryRoster()`, emits non-persisted `nearby_shot` per player within threshold | Hard | P2 |
| `longestGunBurstSeconds` | Sortie high-water for sustained gun burst duration | `S_EVENT_SHOOTING_START` / `S_EVENT_SHOOTING_END` — new event subscription | Medium | P3 |

---

## Achievements

| Name | Trigger type | Description | State required |
|---|---|---|---|
| **Existing** ||||
| Three Wire | `grading` | Catch the 3-wire on a carrier landing | `event.wire === 3` |
| Textbook Trap | `grading` | Score a perfect `_OK_` 3-wire | `event.lsoGrade === '_OK_'` and `event.wire === 3` |
| Bolter Bolter! | `grading` | Bolter on two consecutive passes | `consecutiveBolters >= 2` |
| Comeback Kid | `grading` | Trap on your very next pass after a bolter | `prevPassWasBolter` + current pass is a trap |
| Carrier Qualified | `grading` | 6 arrested landings on a carrier in a single session | `trapCount >= 6` |
| Night Qualified | `grading` | 2 arrested landings on a carrier at night in a single session | `nightTrapCount >= 2` |
| Barely Recovered | `grading` | Trap with less than 5% fuel remaining | `event.fuelState < 0.05` + trap |
| Fleet Defender | `kill_enrichment` | Shoot down an enemy aircraft within 50nm of your carrier | `launchedFromCarrier` + `kills[]` has air kill with `carrierDistanceNm <= 50` |
| Special Delivery | `hit_enrichment` | Land a missile hit beyond 45nm | `longestMissileHit > 45` |
| I Feel the Need... | `flight_sample_enrichment` | Go supersonic in a sortie | `highestSpeedMach >= 1.0` |
| Speed is Life | `flight_sample_enrichment` | Reach Mach 2.0 in a sortie | `highestSpeedMach >= 2.0` |
| So High Right Now | `flight_sample_enrichment` | Reach 50,000 feet in a sortie | `highestAltitudeFt >= 50000` |
| Transfer Complete | `refuel_enrichment` | Complete a refuel contact gaining at least 10% fuel | `event.fuelGain >= 0.10` |
| Top Up | `refuel_enrichment` | Take on at least 10% fuel within 15 minutes of takeoff | `event.fuelGain >= 0.10` + `event.time - lastTakeoffAtMs <= 900s` |
| Night Tanker | `refuel_enrichment` | Complete a night refuel contact gaining at least 10% fuel | `event.night === true` + `event.fuelGain >= 0.10` |
| **New** ||||
| YGBSM | `kill_enrichment` | Destroy a SAM search radar and tracking radar in one sortie | `kills[]` contains both `SAM SR` and `SAM TR` in `victimRoles` |
| Rifle, Rifle, Rifle | `kill_enrichment` | Destroy 3 armoured targets within 5 seconds, in a helicopter | `kills[]`: 3 entries with `Armour` in `victimRoles`, `killedAtMs` within 1s window; `currentUnitCategory === HELICOPTER` |
| Slapshot | `shot_enrichment` | Fire an ARM within 5s of a SAM launch within 100km | `activeThreats[]` has SAM entry ≤5s ago; `event.weaponGuidance === RADAR_PASSIVE` |
| DEAD | `kill_enrichment` | Destroy a SAM radar component | `kills[].victimRoles` contains `SAM SR` or `SAM TR` |
| Counter-Battery | `kill_enrichment` | Destroy an artillery or MLRS unit | `kills[].victimRoles` contains `Artillery` or `MLRS` |
| Engagement Complete | `kill_enrichment` | Destroy 5+ ground units within 1000m of each other in one sortie | `kills[].victimPositionX/Y` — cluster any 5 within 1000m radius |
| Night Hunter | `kill_enrichment` | Destroy a ground unit at night | `kills[].night === true` + ground `victimUnitCategory` |
| Low Altitude CAS | `kill_enrichment` | Destroy a ground unit while below 500ft | `kills[].pilotAltitudeFt < 500` + ground role in `kills[].victimRoles` |
| Supersonic Kill | `kill_enrichment` | Destroy an air target while supersonic | `currentSpeedMach >= 1.0` at time of kill |
| Brrrt | `gun_burst_end` | Sustained gun burst of 3 seconds or more | `longestGunBurstSeconds >= 3` |
| Tank Killer | `kill_enrichment` | Destroy 10 armor in a single session | `kills[]`: 10 entries with `Armour` |

---

## Architecture: DCS Lua → Node

```
┌─────────────────────────────────────────────────────────────┐
│  DCS World process                                          │
│                                                             │
│  ┌─────────────────────────┐  ┌───────────────────────────┐ │
│  │ Hook / GameGUI sandbox  │  │  Mission / server sandbox │ │
│  │                         │  │                           │ │
│  │  DCS-Checkride-hook.lua │  │  DCS-CheckrideMission.lua │ │
│  │  DCS-CheckrideGameGUI   │  │                           │ │
│  │                         │  │  S_EVENT_HIT  → onHit     │ │
│  │  APIs: net.*, DCS.*     │  │  S_EVENT_KILL → onKill    │ │
│  │  Callbacks:             │  │  S_EVENT_SHOT → onShot    │ │
│  │    onGameEvent          │  │  S_EVENT_SHOOTING_START   │ │
│  │    onPlayerConnect/Disc │  │  S_EVENT_SHOOTING_END     │ │
│  │    onSimulationFrame    │  │                           │ │
│  │    onMissionLoadEnd     │  │  APIs: unit:*, weapon:*,  │ │
│  │                         │  │  coalition.*, atmosphere  │ │
│  │                         │  │  No network access        │ │
│  │                         │  │                           │ │
│  │   ◄─── net.dostring_in ─┼──┼── CheckrideMission        │ │
│  │         polls every     │  │   .EventQueue[]           │ │
│  │         100ms           │  │   (JSON-encoded)          │ │
│  └─────────┬───────────────┘  └───────────────────────────┘ │
│            │ UDP 127.0.0.1:41234                            │
└────────────┼────────────────────────────────────────────────┘
             │
             ▼
┌────────────────────────────────┐
│  Electron / Node process       │
│                                │
│  UDP listener                  │
│    → JSON.parse                │
│    → achievementEngine         │
│        .evaluate(event)        │
│        ↓                       │
│      DISPATCH[event.type]      │
│        → state.apply*()        │
│        → achievement.evaluate  │
│           (event, state)       │
└────────────────────────────────┘
```

### Which sandbox handles what

| Event / data | Sandbox | How it reaches Node |
|---|---|---|
| Player connect, disconnect, slot change | Hook/GameGUI | `onGameEvent` callback → `Checkride.sendEvent()` → UDP |
| Takeoff, landing, crash, eject, kill (raw) | Hook/GameGUI | `onGameEvent` callback → `Checkride.sendEvent()` → UDP |
| `takeoff_enrichment`, `kill_enrichment` | Mission | `S_EVENT_TAKEOFF`, `S_EVENT_KILL` → queue → bridge → UDP |
| `hit_enrichment` (lethal + non-lethal) | Mission | `S_EVENT_HIT` → queue → bridge → UDP |
| `shot_enrichment`, `weapon_sample_enrichment` | Mission | `S_EVENT_SHOT`, timer → queue → bridge → UDP |
| `flight_sample_enrichment` | Mission | Staggered 2s timer → queue → bridge → UDP |
| `refuel_enrichment` | Mission | Contact detection → queue → bridge → UDP |
| `nearby_shot` *(new, non-persisted)* | Mission | `S_EVENT_SHOT` AI path → queue → bridge → UDP |
| `gun_burst_start/end` *(new)* | Mission | `S_EVENT_SHOOTING_START/END` → queue → bridge → UDP |

The bridge is `CheckrideCallbackRouter.pollMissionEventBridge()`, which calls `net.dostring_in('server', 'CheckrideMission.PopEvent()')` every 100ms and forwards each dequeued string via `Checkride.sendEncodedEvent()`.

`nearby_shot` events carry `persist: false` (set by `CheckrideMission.sendEnrichmentEvent`), so the Electron daemon drops them after achievement evaluation and never forwards them to the API.

---

## Implementation: Lua changes

All changes are in `DCS-CheckrideMission.lua` unless noted.

### `pendingKillsByObjectId` map

Add as a module-level field alongside `activeWeaponShots`:

```lua
CheckrideMission.pendingKillsByObjectId = CheckrideMission.pendingKillsByObjectId or {}
```

### `onHit` — life-based branching

Current `onHit` resolves to the player pilot via `activeWeaponShots` and emits a single `hit_enrichment`. The new version forks on whether the hit is lethal:

**If `target:getLife() <= 1.0` (lethal hit):**
- Capture victim data while the object still exists (it may be despawned by `onKill`):
  - `killedAtMs = event.time`
  - `victimRoles` — iterate `target:getDesc().attributes`, collect role strings
  - `weaponGuidance = weapon:getDesc().guidance` (integer enum; map to string constant)
  - `victimPositionX`, `victimPositionY` = `target:getPoint()`
  - `night = isNight(event.time)`
  - `victimTypeName = target:getTypeName()`
- Store this record in `CheckrideMission.pendingKillsByObjectId[objectId]` keyed on victim object ID
- Do **not** emit anything here — `onKill` completes the record and emits `kill_enrichment`

**If `target:getLife() > 1.0` (non-lethal hit):**
- Identify victim role and coalition (`target:getDesc().attributes`, `target:getCoalition()`)
- Build a `role_coalition` key string, e.g. `"armour_enemy"`, `"aaa_enemy"`, `"sam_friendly"`
- Emit a lightweight `hit_enrichment` event:
  ```json
  { "type": "hit_enrichment", "playerUcid": "...", "roleCoalition": "armour_enemy", "persist": false }
  ```
- Client increments `hitCounters[roleCoalition]` on receipt

### `onKill` — pending lookup

```lua
local pending = CheckrideMission.pendingKillsByObjectId[victimObjectId]
CheckrideMission.pendingKillsByObjectId[victimObjectId] = nil
```

If `pending` exists, build `kill_enrichment` with all captured fields plus `killerUnitCategory = initiator:getDesc().category`. `killedAtMs` comes from `pending.killedAtMs`; all other victim fields come from the pending record (object may already be invalid).

If `pending` is nil (unit died from collision, scripted removal, etc.), emit `kill_enrichment` as today with `killedAtMs = event.time` and no victim-role/position fields.

### `onShot` — AI initiator path

Currently `onShot` bails early if the initiator is not a player. Add a second branch for AI initiators:

```lua
-- check if initiator is AI (no player name)
local playerName = nil
local ok, name = pcall(function() return initiator:getPlayerName() end)
if ok and name and name ~= "" then playerName = name end

if not playerName then
    -- AI initiator path
    local attrs = initiator:getDesc().attributes or {}
    local role = nil
    if attrs["SAM SR"] or attrs["SAM TR"] or attrs["SAM launcher"] then role = "SAM"
    elseif attrs["AAA"] then role = "AAA"
    elseif attrs["MLRS"] then role = "MLRS"
    end
    if not role then return end

    local shotPos = weapon:getPoint()
    local rosterEntries = buildTelemetryRoster()
    for _, entry in ipairs(rosterEntries) do
        local pilotPos = entry.unit:getPoint()
        local dx = shotPos.x - pilotPos.x
        local dz = shotPos.z - pilotPos.z
        local distNm = math.sqrt(dx*dx + dz*dz) * METERS_TO_NM
        if distNm <= 100 then
            CheckrideMission.sendEnrichmentEvent({
                type        = "nearby_shot",
                playerUcid  = entry.playerUcid,
                playerName  = entry.playerName,
                role        = role,
                launchedAtMs = event.time,
            })
        end
    end
    return
end
-- existing player path continues below...
```

### `flight_sample_enrichment` — add `unitCategory`

In the per-pilot sampling loop where the event payload is built, add:

```lua
local unitCategory = nil
local okCat, desc = pcall(function() return unit:getDesc() end)
if okCat and desc then unitCategory = desc.category end
```

Include `unitCategory = unitCategory` in the emitted `flight_sample_enrichment` payload.

### `S_EVENT_SHOOTING_START` / `S_EVENT_SHOOTING_END`

Subscribe to both events in the world event handler:

```lua
if eventId == world.event.S_EVENT_SHOOTING_START then
    CheckrideMission.onShootingStart(event)
elseif eventId == world.event.S_EVENT_SHOOTING_END then
    CheckrideMission.onShootingEnd(event)
end
```

```lua
function CheckrideMission.onShootingStart(event)
    local ucid = resolvePlayerUcid(event.initiator)
    if not ucid then return end
    CheckrideMission.sendEnrichmentEvent({
        type       = "gun_burst_start",
        playerUcid = ucid,
        startAtMs  = event.time,
    })
end

function CheckrideMission.onShootingEnd(event)
    local ucid = resolvePlayerUcid(event.initiator)
    if not ucid then return end
    CheckrideMission.sendEnrichmentEvent({
        type      = "gun_burst_end",
        playerUcid = ucid,
        endAtMs   = event.time,
    })
end
```

The duration is computed client-side; Lua only emits start/end timestamps.

### `weaponGuidance` mapping

Replace the `classifyWeaponClass` string-pattern approach for kill records with `weapon:getDesc().guidance`, which is an integer enum. Map it to a string constant at emit time:

```lua
local GUIDANCE_NAMES = {
    [0]  = "NONE",
    [4]  = "RADAR_ACTIVE",
    [5]  = "RADAR_SEMI_ACTIVE",
    [6]  = "RADAR_PASSIVE",   -- ARM
    [7]  = "IR",
    [8]  = "LASER",
    [9]  = "TV",
}
local guidanceInt = weapon:getDesc().guidance
local weaponGuidance = GUIDANCE_NAMES[guidanceInt] or tostring(guidanceInt)
```

---

## Implementation: client changes

All changes are in `checkride-client`.

### `pilotState.js` — `_resetSortieState`

Add to the sortie-reset block:

```js
this.currentUnitCategory = null;     // 'AIRPLANE' | 'HELICOPTER' | null
this.hitCounters = {};               // { [roleCoalition: string]: number }
this.activeThreats = [];             // { role: string, launchedAtMs: number }[]
this.gunBurstStartAtMs = null;
this.longestGunBurstSeconds = 0;
```

### `pilotState.js` — updated and new methods

**`applyKill(event)`** — store new fields on the kill record:

```js
this.kills.push({
  victimUnitCategory: event.victimUnitCategory,
  carrierDistanceNm:  event.carrierDistanceNm ?? null,
  killedAtMs:         event.killedAtMs ?? null,
  victimRoles:        event.victimRoles ?? [],
  weaponGuidance:     event.weaponGuidance ?? null,
  victimPositionX:    event.victimPositionX ?? null,
  victimPositionY:    event.victimPositionY ?? null,
  pilotAltitudeFt:    this.currentAltitudeFt,   // snapshot from state
  pilotSpeedMach:     this.currentSpeedMach,     // snapshot from state
  night:              event.night ?? null,
  killerUnitCategory: event.killerUnitCategory ?? null,
  victimTypeName:     event.victimTypeName ?? null,
});
```

**`applyHitEnrichment(event)`** — existing method, add counter increment branch:

```js
if (event.roleCoalition) {
  this.hitCounters[event.roleCoalition] = (this.hitCounters[event.roleCoalition] ?? 0) + 1;
}
```

**`applyFlightSampleEnrichment(event)`** — add:

```js
if (event.unitCategory != null) this.currentUnitCategory = event.unitCategory;
```

**`applyNearbyShot(event)`** — new method:

```js
applyNearbyShot(event) {
  const now = event.launchedAtMs;
  this.activeThreats.push({ role: event.role, launchedAtMs: now });
  // prune entries older than 30s
  this.activeThreats = this.activeThreats.filter(t => now - t.launchedAtMs <= 30000);
}
```

**`applyGunBurstStart(event)`** — new method:

```js
applyGunBurstStart(event) {
  this.gunBurstStartAtMs = event.startAtMs;
}
```

**`applyGunBurstEnd(event)`** — new method:

```js
applyGunBurstEnd(event) {
  if (this.gunBurstStartAtMs != null) {
    const durationSeconds = (event.endAtMs - this.gunBurstStartAtMs) / 1000;
    if (durationSeconds > this.longestGunBurstSeconds) {
      this.longestGunBurstSeconds = durationSeconds;
    }
    this.gunBurstStartAtMs = null;
  }
}
```

### `achievementEngine.js` — DISPATCH additions

```js
nearby_shot:      { ucidField: 'playerUcid', stateMethod: 'applyNearbyShot' },
gun_burst_start:  { ucidField: 'playerUcid', stateMethod: 'applyGunBurstStart' },
gun_burst_end:    { ucidField: 'playerUcid', stateMethod: 'applyGunBurstEnd' },
```

`gun_burst_end` is the trigger type for the **Brrrt** achievement; add it to the evaluated-types list in the JSDoc comment. `nearby_shot` and `gun_burst_start` are state-update-only (no achievements trigger on them directly).

### `achievementEngine.js` — `serializeState` additions

In the `gauges` block:

```js
longest_gun_burst_seconds: state.longestGunBurstSeconds,
```

In the `state` block:

```js
currentUnitCategory:      state.currentUnitCategory,
hitCounters:              state.hitCounters,
activeThreats:            state.activeThreats,
longestGunBurstSeconds:   state.longestGunBurstSeconds,
```

---

## Metadata retirement

The unit, weapon, and airdrome metadata CSVs (760 rows total) serve two distinct purposes.

### Retirable — DCS provides natively

| Data | Currently | Future |
|---|---|---|
| Unit domain / category / role | CSV lookup + DB | `unit:getDesc().category` + `.attributes` emitted from Lua |
| Weapon guidance / category | CSV lookup + DB | `weapon:getDesc().guidance` enum emitted from Lua |
| Airdrome type (carrier vs airfield) | CSV lookup + DB | `Airbase.Category.SHIP` — already done in `onTakeoff` |

### Out of scope until server enrichment is retired

`unit_family` and `weapon_family` are Checkride-specific groupings with no DCS native equivalent — they exist so proficiency counters aggregate across variants (e.g. F/A-18C + F/A-18D → `"F/A-18"`). The server continues to resolve these from the existing CSVs until the enrichment pipeline is cut over.

When that happens, the mappings move to the client. The server's responsibility is persistence and the proficiency engine — enrichment is a client concern. Events arrive at the API pre-enriched; the server stores what it receives.

The "hard to update" concern for client-side mappings is solvable via self-update — either content-only (fetch updated mapping data at runtime) or a full app update. Not a current constraint.

### Server changes when retirement is complete

- Remove `MetadataCache`, `UnitMetadata`, `WeaponMetadata`, `AirdromeMetadata` models.
- Remove `apply_unit_metadata`, `apply_weapon_metadata`, `apply_airdrome_metadata` from `EventIngestor`.
- `EventIngestor` stores what it receives; no enrichment step.
- Remove CSV files and their seed tasks.
- TagSchema system unchanged — it still keys off field values on the event row, now populated by Lua instead of the server.

---

### Tasks

1. Refactor pilotState without any additions
2. Add Telemetry window to client app, accessible from System Tray menu. Shows list of pilots on the left, and pilot state on the main window.
3. Add New Achievements one by one, including new state fields as needed, starting with priority 1.

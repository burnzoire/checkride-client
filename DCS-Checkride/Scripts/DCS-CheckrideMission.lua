-- ============================================================================
-- DCS-Checkride Mission Script
-- Captures mission-level events not available in the GameGUI environment.
-- Must be loaded via a mission trigger (DO SCRIPT FILE) or autoload.
--
-- Queues encoded events for retrieval via net.dostring_in from GameGUI/hook.
-- ============================================================================
CheckrideMission = {}
CheckrideMission.clientVersion = "__CHECKRIDE_CLIENT_VERSION__"
CheckrideMission.version = CheckrideMission.clientVersion
CheckrideMission.EventQueue = CheckrideMission.EventQueue or {}

CheckrideMission.FlightSample = {
    enabled = true,
    maxTrackedPilots = 64,
    targetSampleIntervalSeconds = 4.0,
    minTickSeconds = 0.25,
    rosterRefreshSeconds = 1.0,
    roster = {},
    nextPilotIndex = 1,
    lastRosterRefreshAt = 0,
}

CheckrideMission.WeaponSample = {
    enabled = true,
    tickSeconds = 1.0,
    staleDataSeconds = 30,
}

CheckrideMission.RefuelDetection = {
    enabled = true,
    minFuelGainStep = 0.0005,
}

-- Maps ucid (or fallback playerName) to the carrier Unit the pilot launched from.
-- Reset each time a takeoff_enrichment is emitted; used to compute distance on kill.
CheckrideMission.pilotCarrierByUcid = {}

CheckrideMission.TakeoffEventId = nil
CheckrideMission.KillEventId = nil
CheckrideMission.ShotEventId = nil
CheckrideMission.HitEventId = nil
CheckrideMission.activeWeaponShots = CheckrideMission.activeWeaponShots or {}
CheckrideMission.activeRefuelByPilot = CheckrideMission.activeRefuelByPilot or {}
CheckrideMission.pendingKillsByObjectId = CheckrideMission.pendingKillsByObjectId or {}
CheckrideMission.activeInboundMissiles = CheckrideMission.activeInboundMissiles or {}

local function checkrideMissionInfo(message)
    if log and log.write then
        log.write('DCS-Checkride-Mission', log.INFO, tostring(message))
    end
end

checkrideMissionInfo("Loading - DCS-Checkride Mission Script v" .. CheckrideMission.version)
checkrideMissionInfo("Checkride client version " .. CheckrideMission.clientVersion)

-- ============================================================================
-- Logging
-- ============================================================================
function CheckrideMission.log(str)
    checkrideMissionInfo("[Checkride Mission] " .. str)
end

local function isArrayTable(value)
    if type(value) ~= "table" then
        return false
    end

    local count = 0
    for key, _ in pairs(value) do
        if type(key) ~= "number" then
            return false
        end
        count = count + 1
    end

    for index = 1, count do
        if value[index] == nil then
            return false
        end
    end

    return true
end

local function jsonEscape(str)
    str = tostring(str)
    str = str:gsub('\\', '\\\\')
    str = str:gsub('"', '\\"')
    str = str:gsub('\n', '\\n')
    str = str:gsub('\r', '\\r')
    str = str:gsub('\t', '\\t')
    return str
end

local function encodeJsonValue(value)
    local valueType = type(value)

    if valueType == "nil" then
        return "null"
    end

    if valueType == "number" then
        return tostring(value)
    end

    if valueType == "boolean" then
        return value and "true" or "false"
    end

    if valueType == "string" then
        return '"' .. jsonEscape(value) .. '"'
    end

    if valueType ~= "table" then
        return '"' .. jsonEscape(value) .. '"'
    end

    if isArrayTable(value) then
        local items = {}
        for index = 1, #value do
            items[#items + 1] = encodeJsonValue(value[index])
        end
        return "[" .. table.concat(items, ",") .. "]"
    end

    local items = {}
    for key, itemValue in pairs(value) do
        items[#items + 1] = '"' .. jsonEscape(key) .. '":' .. encodeJsonValue(itemValue)
    end
    return "{" .. table.concat(items, ",") .. "}"
end

function CheckrideMission.encodeMessage(message)
    local ok, encoded = pcall(function() return encodeJsonValue(message) end)
    if ok and encoded then
        return encoded
    end

    return nil
end

function CheckrideMission.queueEvent(encodedMessage)
    if not encodedMessage or encodedMessage == "" then
        return
    end

    CheckrideMission.EventQueue[#CheckrideMission.EventQueue + 1] = encodedMessage
end

function CheckrideMissionPopEvent()
    if not CheckrideMission or not CheckrideMission.EventQueue then
        return ""
    end

    if #CheckrideMission.EventQueue == 0 then
        return ""
    end

    local encoded = table.remove(CheckrideMission.EventQueue, 1)
    return encoded or ""
end

-- ============================================================================
-- Event Queue Send
-- ============================================================================
function CheckrideMission.sendEvent(message)
    local encoded = CheckrideMission.encodeMessage(message)
    if not encoded then
        CheckrideMission.log("Failed to encode event payload: " .. tostring(message and message.type or "unknown"))
        return
    end

    CheckrideMission.queueEvent(encoded)
    CheckrideMission.log("queued event: " .. tostring(message and message.type or "unknown"))
end

-- State-only events: never saved to the API, only evaluated by the achievement
-- engine. Automatically stamps persist = false so call sites don't have to.
function CheckrideMission.sendEnrichmentEvent(message)
    message.persist = false
    CheckrideMission.sendEvent(message)
end

-- ============================================================================
-- Flight Sample Telemetry (staggered)
-- Emits lightweight state-only events with current speed/alt/in-air.
-- To avoid CPU spikes, this samples at most one pilot per tick, capped to 64.
-- ============================================================================
local MPS_TO_KNOTS = 1.9438444924406
local METERS_TO_FEET = 3.2808398950131
local METERS_TO_NM = 0.00053995680345572

local GUIDANCE_NAMES = {
    [0]  = "NONE",
    [4]  = "RADAR_ACTIVE",
    [5]  = "RADAR_SEMI_ACTIVE",
    [6]  = "RADAR_PASSIVE",
    [7]  = "IR",
    [8]  = "LASER",
    [9]  = "TV",
}

-- Maps Weapon.Category integer → string name.
local WEAPON_CATEGORY_NAMES = {
    [0] = "SHELL",
    [1] = "MISSILE",
    [2] = "ROCKET",
    [3] = "BOMB",
    [4] = "TORPEDO",
}

-- Maps Weapon.MissileCategory integer → string name.
-- Missiles matching a sub-category return that name instead of "MISSILE".
local MISSILE_CATEGORY_NAMES = {
    [1] = "AAM",
    [2] = "SAM",
    [3] = "BM",
    [4] = "ANTI_SHIP",
    [5] = "ARM",
    [6] = "OTHER",
}

local function isFiniteNumber(value)
    return type(value) == "number" and value == value and value > -math.huge and value < math.huge
end

local function speedOfSoundAtPoint(point)
    if atmosphere and atmosphere.getSpeedOfSound then
        local ok, value = pcall(function() return atmosphere.getSpeedOfSound(point) end)
        if ok and isFiniteNumber(value) and value > 0 then
            return value
        end
    end

    if atmosphere and atmosphere.getTemperatureAndPressure then
        local ok, temperature = pcall(function() return atmosphere.getTemperatureAndPressure(point) end)
        if ok and isFiniteNumber(temperature) then
            local tempKelvin = temperature
            if temperature < 100 then
                tempKelvin = temperature + 273.15
            end

            if tempKelvin > 0 then
                return math.sqrt(1.4 * 287.05 * tempKelvin)
            end
        end
    end

    return nil
end

local function appendSidePlayers(target, side)
    if not coalition or not coalition.getPlayers then
        return
    end

    local ok, players = pcall(function() return coalition.getPlayers(side) end)
    if not ok or type(players) ~= "table" then
        return
    end

    for _, unit in ipairs(players) do
        target[#target + 1] = unit
    end
end

local function buildTelemetryRoster()
    local units = {}

    local redSide = coalition and coalition.side and coalition.side.RED or 1
    local blueSide = coalition and coalition.side and coalition.side.BLUE or 2
    local neutralSide = coalition and coalition.side and coalition.side.NEUTRAL or 0

    appendSidePlayers(units, redSide)
    appendSidePlayers(units, blueSide)
    appendSidePlayers(units, neutralSide)

    local entries = {}
    local seen = {}

    for _, unit in ipairs(units) do
        local playerName = nil
        local okName, name = pcall(function() return unit:getPlayerName() end)
        if okName and name and name ~= "" then
            playerName = name
        end

        if playerName then
            local ucid = nil
            if CheckrideLookupUCID then
                ucid = CheckrideLookupUCID(playerName)
            end

            local identity = tostring(ucid or playerName)
            if not seen[identity] then
                seen[identity] = true
                entries[#entries + 1] = {
                    unit = unit,
                    playerName = playerName,
                    playerUcid = ucid,
                }
            end
        end
    end

    table.sort(entries, function(a, b)
        local ak = tostring(a.playerUcid or a.playerName or "")
        local bk = tostring(b.playerUcid or b.playerName or "")
        return ak < bk
    end)

    local maxPilots = CheckrideMission.FlightSample.maxTrackedPilots or 64
    if #entries > maxPilots then
        local trimmed = {}
        for index = 1, maxPilots do
            trimmed[index] = entries[index]
        end
        entries = trimmed
    end

    return entries
end

function CheckrideMission.refreshTelemetryRoster(now)
    local cfg = CheckrideMission.FlightSample
    if not cfg.enabled then
        return
    end

    if (now - (cfg.lastRosterRefreshAt or 0)) < (cfg.rosterRefreshSeconds or 1.0) then
        return
    end

    cfg.lastRosterRefreshAt = now
    cfg.roster = buildTelemetryRoster()

    if cfg.nextPilotIndex > #cfg.roster then
        cfg.nextPilotIndex = 1
    end
end

function CheckrideMission.emitFlightSampleForEntry(entry, now)
    if not entry or not entry.unit then
        return
    end

    local unit = entry.unit
    local okExist, exists = pcall(function() return unit:isExist() end)
    if not okExist or not exists then
        return
    end

    local speedKts = nil
    local speedMach = nil
    local altitudeFt = nil
    local altRadarFt = nil
    local positionX = nil
    local positionY = nil
    local currentFuelState = nil
    local inAir = nil
    local unitType = nil
    local speedMps = nil
    local okVelocity, velocity = pcall(function() return unit:getVelocity() end)
    if okVelocity and velocity then
        local vx = velocity.x
        local vy = velocity.y
        local vz = velocity.z

        if isFiniteNumber(vx) and isFiniteNumber(vy) and isFiniteNumber(vz) then
            speedMps = math.sqrt((vx * vx) + (vy * vy) + (vz * vz))
            if isFiniteNumber(speedMps) then
                speedKts = speedMps * MPS_TO_KNOTS
            end
        end
    end

    local okPoint, point = pcall(function() return unit:getPoint() end)
    if okPoint and point and isFiniteNumber(point.x) and isFiniteNumber(point.y) and isFiniteNumber(point.z) then
        altitudeFt = point.y * METERS_TO_FEET
        positionX = point.x
        positionY = point.z

        if land and land.getHeight then
            local okGround, groundMeters = pcall(function() return land.getHeight({ x = point.x, y = point.z }) end)
            if okGround and isFiniteNumber(groundMeters) then
                altRadarFt = math.max(0, point.y - groundMeters) * METERS_TO_FEET
            end
        end

        if isFiniteNumber(speedMps) and speedMps >= 0 then
            local speedOfSound = speedOfSoundAtPoint(point)
            if isFiniteNumber(speedOfSound) and speedOfSound > 0 then
                speedMach = speedMps / speedOfSound
            end
        end
    end

    local okFuel, fuelState = pcall(function() return unit:getFuel() end)
    if okFuel and isFiniteNumber(fuelState) then
        currentFuelState = fuelState
    end

    local okInAir, unitInAir = pcall(function() return unit:inAir() end)
    if okInAir then
        inAir = unitInAir == true
    end

    local okType, typeName = pcall(function() return unit:getTypeName() end)
    if okType and typeName and typeName ~= "" then
        unitType = typeName
    end

    local unitCategory = nil
    local okCat, catDesc = pcall(function() return unit:getDesc() end)
    if okCat and catDesc then
        if catDesc.category == Unit.Category.AIRPLANE then unitCategory = "AIRPLANE"
        elseif catDesc.category == Unit.Category.HELICOPTER then unitCategory = "HELICOPTER"
        end
    end

    local ammoPayload = nil
    local okAmmo, ammo = pcall(function() return unit:getAmmo() end)
    if okAmmo and ammo then
        local items = {}
        for _, item in ipairs(ammo) do
            if item and item.count and item.count > 0 then
                local typeName = (item.desc and item.desc.typeName) or nil
                local displayName = (item.desc and item.desc.displayName) or nil
                local category = (item.desc and item.desc.category) or nil
                table.insert(items, {
                    count = item.count,
                    typeName = typeName,
                    displayName = displayName,
                    category = category,
                })
            end
        end
        if #items > 0 then
            ammoPayload = items
        end
    end

    local message = {
        type = "flight_sample_enrichment",
        source = "mission",
        playerUcid = entry.playerUcid,
        playerName = entry.playerName,
        unitType = unitType,
        unitCategory = unitCategory,
        speedKts = speedKts,
        speedMach = speedMach,
        altitudeFt = altitudeFt,
        altRadarFt = altRadarFt,
        positionX = positionX,
        positionY = positionY,
        currentFuelState = currentFuelState,
        inAir = inAir,
        ammoPayload = ammoPayload,
        missionTime = now,
    }

    CheckrideMission.trackRefuelFromFuelSample(entry, unitType, currentFuelState, inAir, now)
    CheckrideMission.sendEnrichmentEvent(message)
end

function CheckrideMission.sampleTelemetryTick(_, now)
    local cfg = CheckrideMission.FlightSample
    local minTick = cfg.minTickSeconds or 0.25

    if not cfg.enabled then
        return now + minTick
    end

    CheckrideMission.refreshTelemetryRoster(now)

    local rosterSize = #cfg.roster
    local tickSeconds = math.max(minTick, (cfg.targetSampleIntervalSeconds or 4.0) / math.max(1, rosterSize))

    if rosterSize > 0 then
        if cfg.nextPilotIndex < 1 or cfg.nextPilotIndex > rosterSize then
            cfg.nextPilotIndex = 1
        end

        local entry = cfg.roster[cfg.nextPilotIndex]
        cfg.nextPilotIndex = cfg.nextPilotIndex + 1
        if cfg.nextPilotIndex > rosterSize then
            cfg.nextPilotIndex = 1
        end

        CheckrideMission.emitFlightSampleForEntry(entry, now)
    end

    return now + tickSeconds
end

function CheckrideMission.startTelemetrySampler()
    if not timer or not timer.scheduleFunction or not timer.getTime then
        CheckrideMission.log("telemetry sampler unavailable: timer API missing")
        return
    end

    local cfg = CheckrideMission.FlightSample
    if not cfg.enabled then
        CheckrideMission.log("telemetry sampler disabled")
        return
    end

    local minTick = cfg.minTickSeconds or 0.25
    timer.scheduleFunction(CheckrideMission.sampleTelemetryTick, nil, timer.getTime() + minTick)
    CheckrideMission.log(
        "telemetry sampler started: targetSampleInterval=" .. tostring(cfg.targetSampleIntervalSeconds or 4.0) ..
        "s minTick=" .. tostring(minTick) ..
        "s rosterRefresh=" .. tostring(cfg.rosterRefreshSeconds or 1.0) ..
        "s maxTrackedPilots=" .. tostring(cfg.maxTrackedPilots or 64)
    )
end

local function getObjectPoint(object)
    if not object then
        return nil
    end

    local ok, point = pcall(function() return object:getPoint() end)
    if not ok or not point then
        return nil
    end

    if not isFiniteNumber(point.x) or not isFiniteNumber(point.y) or not isFiniteNumber(point.z) then
        return nil
    end

    return point
end

local function getObjectSpeedMps(object)
    if not object then
        return nil
    end

    local ok, velocity = pcall(function() return object:getVelocity() end)
    if not ok or not velocity then
        return nil
    end

    local vx = velocity.x
    local vy = velocity.y
    local vz = velocity.z

    if not isFiniteNumber(vx) or not isFiniteNumber(vy) or not isFiniteNumber(vz) then
        return nil
    end

    return math.sqrt((vx * vx) + (vy * vy) + (vz * vz))
end

function CheckrideMission.sampleActiveWeaponsTick(_, now)
    local cfg = CheckrideMission.WeaponSample
    if not cfg.enabled then
        return now + (cfg.tickSeconds or 1.0)
    end

    for weaponKey, shotState in pairs(CheckrideMission.activeWeaponShots) do
        if shotState and shotState.inFlight ~= false then
            local firedAt = shotState.firedAt or now
            local ageSeconds = now - firedAt
            local lastDataAt = shotState.lastDataAt or firedAt
            local noDataSeconds = now - lastDataAt

            if noDataSeconds > (cfg.staleDataSeconds or 30) then
                CheckrideMission.sendEnrichmentEvent({
                    type = "weapon_sample_enrichment",
                    source = "mission",
                    playerUcid = shotState.playerUcid,
                    playerName = shotState.playerName,
                    weaponKey = shotState.weaponKey,
                    weaponClass = shotState.weaponClass,
                    weaponName = shotState.weaponName,
                    weaponDisplayName = shotState.weaponDisplayName,
                    weaponObjectId = shotState.weaponObjectId,
                    targetObjectId = shotState.targetObjectId,
                    inFlight = false,
                    status = "expired",
                    ageSeconds = ageSeconds,
                    noDataSeconds = noDataSeconds,
                    missionTime = now,
                })

                CheckrideMission.activeWeaponShots[weaponKey] = nil
            else
                local weaponRef = shotState.weaponRef
                local speedMps = getObjectSpeedMps(weaponRef)
                local speedKts = speedMps and (speedMps * MPS_TO_KNOTS) or nil
                local position = getObjectPoint(weaponRef)
                local speedMach = nil

                if speedMps and position then
                    local speedOfSound = speedOfSoundAtPoint(position)
                    if isFiniteNumber(speedOfSound) and speedOfSound > 0 then
                        speedMach = speedMps / speedOfSound
                    end
                end

                if speedMps or position then
                    shotState.lastDataAt = now
                end

                CheckrideMission.sendEnrichmentEvent({
                    type = "weapon_sample_enrichment",
                    source = "mission",
                    playerUcid = shotState.playerUcid,
                    playerName = shotState.playerName,
                    weaponKey = shotState.weaponKey,
                    weaponClass = shotState.weaponClass,
                    weaponName = shotState.weaponName,
                    weaponDisplayName = shotState.weaponDisplayName,
                    weaponObjectId = shotState.weaponObjectId,
                    targetObjectId = shotState.targetObjectId,
                    inFlight = true,
                    status = "in_flight",
                    ageSeconds = ageSeconds,
                    noDataSeconds = (shotState.lastDataAt and (now - shotState.lastDataAt)) or noDataSeconds,
                    speedKts = speedKts,
                    speedMach = speedMach,
                    positionX = position and position.x or nil,
                    positionY = position and position.z or nil,
                    altitudeFt = position and (position.y * METERS_TO_FEET) or nil,
                    missionTime = now,
                })
            end
        end
    end

    -- Inbound missile expiry: if weapon ref is gone and no hit was recorded, the player evaded.
    for weaponKey, track in pairs(CheckrideMission.activeInboundMissiles) do
        local isValid = false
        if track.weaponRef then
            local okExist, exists = pcall(function() return track.weaponRef:isExist() end)
            isValid = okExist and exists == true
        end

        local noDataSeconds = now - (track.lastDataAt or track.firedAt or now)

        if not isValid or noDataSeconds > (cfg.staleDataSeconds or 30) then
            CheckrideMission.activeInboundMissiles[weaponKey] = nil
        else
            track.lastDataAt = now
        end
    end

    return now + (cfg.tickSeconds or 1.0)
end

function CheckrideMission.startWeaponSampler()
    if not timer or not timer.scheduleFunction or not timer.getTime then
        CheckrideMission.log("weapon sampler unavailable: timer API missing")
        return
    end

    local cfg = CheckrideMission.WeaponSample
    if not cfg.enabled then
        CheckrideMission.log("weapon sampler disabled")
        return
    end

    timer.scheduleFunction(CheckrideMission.sampleActiveWeaponsTick, nil, timer.getTime() + (cfg.tickSeconds or 1.0))
    CheckrideMission.log(
        "weapon sampler started: tick=" .. tostring(cfg.tickSeconds or 1.0) ..
        "s staleDataSeconds=" .. tostring(cfg.staleDataSeconds or 30)
    )
end

-- ============================================================================
-- Grade Parsing
-- Parses the DCS LSO comment string, e.g.:
--   "LSO: GRADE:_OK_ : WIRE# 3"
--   "LSO: GRADE:(OK) :X LUL IM  WIRE# 2"
--   "LSO: GRADE:WO(AFU) "
--   "LSO: GRADE:B "
-- ============================================================================
CheckrideMission.GRADE_NORMALIZATION = {
    ["CUT"]    = "C",
    ["BOLTER"] = "B",
    ["WOP"]    = "WO",
    ["WOFD"]   = "WO",
    ["OWO"]    = "WO",
    ["TWO"]    = "WO",
    ["TLU"]    = "WO",
}

-- ============================================================================
-- Normalized to:
-- _OK_	Perfect pass
-- OK	OK pass
-- (OK)	Fair OK
-- --	No grade
-- B	Bolter (no trap)
-- C 	Cut pass (dangerous)
-- WO 	Waveoff (no trap)
function CheckrideMission.parseComment(comment)
    if not comment or comment == "" then
        return nil, nil, nil
    end

    -- Extract grade token: everything after "GRADE:" up to a space, colon, or end
    local grade = string.match(comment, "GRADE:([^%s:]+)")
    if not grade then
        return nil, nil, comment
    end

    -- Strip surrounding underscores for _OK_ but preserve them in the grade value
    -- The grade token is stored as-is (e.g. "_OK_", "(OK)", "OK", "B", "--", "WO", "C")

    -- Normalize known aliases
    local baseGrade = grade
    -- Strip parenthetical suffixes for normalization lookup, e.g. "WO(AFU)" -> "WO"
    local gradeKey = string.match(grade, "^([A-Z_%(%)%-]+)") or grade
    if CheckrideMission.GRADE_NORMALIZATION[gradeKey] then
        grade = CheckrideMission.GRADE_NORMALIZATION[gradeKey]
    end

    -- Normalize triple-dash to double-dash
    if grade == "---" then
        grade = "--"
    end

    -- Extract wire number
    local wire = tonumber(string.match(comment, "WIRE#%s*(%d)"))

    return grade, wire, comment
end

-- ============================================================================
-- Player Info Resolution
-- Uses the CheckrideLookupUCID function injected by the hook to resolve
-- player UCIDs from the GameGUI environment.
-- ============================================================================
function CheckrideMission.getPlayerInfo(initiator)
    if not initiator then
        return nil, nil
    end

    local playerName = initiator:getPlayerName()
    if not playerName or playerName == "" then
        return nil, nil -- AI unit, skip
    end

    local unitType = initiator:getTypeName()
    local ucid = nil
    if CheckrideLookupUCID then
        ucid = CheckrideLookupUCID(playerName)
    end

    return playerName, unitType, ucid
end

-- ============================================================================
-- Night Detection
-- Uses mission theatre time to determine if it's a night pass.
-- Night = before 0600 or after 2000 local mission time.
-- ============================================================================
local function getMissionTimeOfDay(eventTime)
    if timer and timer.getAbsTime then
        local abs = timer.getAbsTime()
        if abs then
            return abs % 86400
        end
    end

    if env and env.mission and env.mission.start_time and eventTime then
        return (env.mission.start_time + eventTime) % 86400
    end

    if eventTime then
        return eventTime % 86400
    end

    return nil
end

function CheckrideMission.isNight(eventTime)
    local timeOfDay = getMissionTimeOfDay(eventTime)
    if not timeOfDay then
        return false
    end

    return timeOfDay >= 72000 or timeOfDay < 21600 -- 2000h or before 0600h
end

-- ============================================================================
-- Carrier Name Resolution
-- ============================================================================
function CheckrideMission.getCarrierName(place)
    if not place then
        return nil
    end

    local ok, name = pcall(function() return place:getName() end)
    if ok and name and name ~= "" then
        return name
    end

    return nil
end

local function getWeaponKey(weapon)
    if not weapon then
        return nil
    end

    return tostring(weapon)
end

local function getWeaponTypeName(weapon)
    if not weapon then
        return nil
    end

    local ok, typeName = pcall(function() return weapon:getTypeName() end)
    if ok and typeName and typeName ~= "" then
        return typeName
    end

    local okDesc, desc = pcall(function() return weapon:getDesc() end)
    if okDesc and desc then
        if type(desc.typeName) == "string" and desc.typeName ~= "" then
            return desc.typeName
        end
        if type(desc.displayName) == "string" and desc.displayName ~= "" then
            return desc.displayName
        end
        if type(desc.name) == "string" and desc.name ~= "" then
            return desc.name
        end
    end

    return nil
end

local function getWeaponDisplayName(weapon)
    if not weapon then
        return nil
    end

    local okDesc, desc = pcall(function() return weapon:getDesc() end)
    if okDesc and desc then
        if type(desc.displayName) == "string" and desc.displayName ~= "" then
            return desc.displayName
        end
        if type(desc.name) == "string" and desc.name ~= "" then
            return desc.name
        end
    end

    return getWeaponTypeName(weapon)
end

local function getObjectId(object)
    if not object then
        return nil
    end

    local ok, objectId = pcall(function() return object:getID() end)
    if ok and objectId then
        return objectId
    end

    return nil
end

local function normalizeAARSystem(value)
    local system = string.lower(tostring(value or ""))
    if system == "boom" or system == "basket" then
        return system
    end
    return nil
end

local function getRefuelingSystem(unit)
    if not unit then
        return nil
    end

    local okExist, exists = pcall(function() return unit:isExist() end)
    if not okExist or not exists then
        return nil
    end

    local okDesc, desc = pcall(function() return unit:getDesc() end)
    if not okDesc or not desc then
        return nil
    end

    return desc.tankerType
end

local function getRefuelingSystemName(unit)
    local system = getRefuelingSystem(unit)
    if system == nil then
        return nil
    end

    local unitRefueling = Unit and Unit.RefuelingSystem or nil
    if not unitRefueling then
        return nil
    end

    if system == unitRefueling.BOOM_AND_RECEPTACLE then
        return "boom"
    elseif system == unitRefueling.PROBE_AND_DROGUE then
        return "basket"
    end

    return normalizeAARSystem(system)
end

local function logAARRefuelEvent(unit, systemName, fuelGain, durationSeconds)
    if not env or not env.info then
        return
    end

    local unitName = nil
    local unitType = nil
    if unit then
        local okName, name = pcall(function() return unit:getName() end)
        if okName and name and name ~= "" then
            unitName = name
        end

        local okType, typeName = pcall(function() return unit:getTypeName() end)
        if okType and typeName and typeName ~= "" then
            unitType = typeName
        end
    end

    env.info(string.format(
        "[AAR] unit=%s type=%s system=%s fuelGain=%.5f duration=%.2f",
        tostring(unitName or "unknown"),
        tostring(unitType or "unknown"),
        tostring(systemName or "unknown"),
        tonumber(fuelGain) or 0,
        tonumber(durationSeconds) or 0
    ))
end

local function finalizeRefuelSegment(session, playerUcid, playerName, unitType)
    if not session then
        return
    end

    if not isFiniteNumber(session.accumulatedFuelGain) or session.accumulatedFuelGain <= 0 then
        return
    end

    if not isFiniteNumber(session.segmentStartedAt) or not isFiniteNumber(session.lastGainAt) then
        return
    end

    local payload = {
        source = "mission",
        playerUcid = playerUcid,
        playerName = playerName,
        unitType = unitType,
        system = session.system,
        fuelState = session.lastFuelState,
        fuelGain = session.accumulatedFuelGain,
        durationSeconds = math.max(0, session.lastGainAt - session.segmentStartedAt),
        night = session.night,
        missionTime = session.lastGainAt,
    }

    logAARRefuelEvent(session.unitRef, payload.system, payload.fuelGain, payload.durationSeconds)

    CheckrideMission.sendEnrichmentEvent({
        type = "refuel_enrichment",
        source = payload.source,
        playerUcid = payload.playerUcid,
        playerName = payload.playerName,
        unitType = payload.unitType,
        refuelStatus = "completed",
        startedAtMissionTime = session.segmentStartedAt,
        system = payload.system,
        fuelState = payload.fuelState,
        fuelGain = payload.fuelGain,
        durationSeconds = payload.durationSeconds,
        night = payload.night,
        missionTime = payload.missionTime,
    })

    CheckrideMission.sendEvent({
        type = "aar",
        source = payload.source,
        playerUcid = payload.playerUcid,
        playerName = payload.playerName,
        unitType = payload.unitType,
        refuelStatus = "completed",
        startedAtMissionTime = session.segmentStartedAt,
        system = payload.system,
        fuelState = payload.fuelState,
        fuelGain = payload.fuelGain,
        durationSeconds = payload.durationSeconds,
        night = payload.night,
        missionTime = payload.missionTime,
    })
end

function CheckrideMission.trackRefuelFromFuelSample(entry, unitType, currentFuelState, inAir, now)
    if not entry then
        return
    end

    local playerName = entry.playerName
    local playerUcid = entry.playerUcid
    if not playerName then
        return
    end

    local pilotKey = playerUcid or playerName
    local active = CheckrideMission.activeRefuelByPilot[pilotKey]

    if not (inAir == true and isFiniteNumber(currentFuelState)) then
        if active then
            finalizeRefuelSegment(active, playerUcid, playerName, unitType)
            CheckrideMission.activeRefuelByPilot[pilotKey] = nil
        end
        return
    end

    if not active then
        CheckrideMission.activeRefuelByPilot[pilotKey] = {
            lastSampleTime = now,
            lastFuelState = currentFuelState,
            accumulatedFuelGain = 0,
            segmentStartedAt = nil,
            lastGainAt = nil,
            system = getRefuelingSystemName(entry.unit),
            night = nil,
            unitRef = entry.unit,
        }
        return
    end

    local fuelDelta = currentFuelState - (active.lastFuelState or currentFuelState)
    local minFuelGainStep = (CheckrideMission.RefuelDetection and CheckrideMission.RefuelDetection.minFuelGainStep) or 0.0005
    local gainedFuelThisSample = fuelDelta > minFuelGainStep

    if gainedFuelThisSample then
        if not isFiniteNumber(active.segmentStartedAt) then
            active.segmentStartedAt = active.lastSampleTime or now
            active.night = CheckrideMission.isNight(active.segmentStartedAt)

            CheckrideMission.sendEnrichmentEvent({
                type = "refuel_enrichment",
                source = "mission",
                playerUcid = playerUcid,
                playerName = playerName,
                unitType = unitType,
                refuelStatus = "started",
                startedAtMissionTime = active.segmentStartedAt,
                missionTime = active.segmentStartedAt,
                system = active.system,
                fuelState = currentFuelState,
                fuelGain = fuelDelta,
                night = active.night,
            })
        end

        active.accumulatedFuelGain = math.max(0, (active.accumulatedFuelGain or 0) + fuelDelta)
        active.lastGainAt = now
        active.lastSampleTime = now
        active.lastFuelState = currentFuelState
        active.unitRef = entry.unit or active.unitRef

        local currentSystem = getRefuelingSystemName(entry.unit)
        if currentSystem then
            active.system = currentSystem
        end
        return
    end

    if isFiniteNumber(active.accumulatedFuelGain) and active.accumulatedFuelGain > 0 then
        finalizeRefuelSegment(active, playerUcid, playerName, unitType)
        CheckrideMission.activeRefuelByPilot[pilotKey] = {
            lastSampleTime = now,
            lastFuelState = currentFuelState,
            accumulatedFuelGain = 0,
            segmentStartedAt = nil,
            lastGainAt = nil,
            system = getRefuelingSystemName(entry.unit),
            night = nil,
            unitRef = entry.unit,
        }
        return
    end

    active.lastSampleTime = now
    active.lastFuelState = currentFuelState
    active.unitRef = entry.unit or active.unitRef
end

local function getRoleCoalition(target, initiatorCoalition)
    local okDesc, desc = pcall(function() return target:getDesc() end)
    if not okDesc or not desc then return nil end
    local attrs = desc.attributes or {}

    local role = nil
    if attrs["SAM SR"] or attrs["SAM TR"] or attrs["SAM launcher"] then role = "sam"
    elseif attrs["Armour"] or attrs["Tanks"] or attrs["IFV"] or attrs["APC"] then role = "armour"
    elseif attrs["AAA"] then role = "aaa"
    elseif attrs["Artillery"] then role = "artillery"
    elseif attrs["MLRS"] then role = "mlrs"
    elseif attrs["Infantry"] then role = "infantry"
    end
    if not role then return nil end

    local targetCoal = nil
    pcall(function() targetCoal = target:getCoalition() end)

    local neutralSide = coalition and coalition.side and coalition.side.NEUTRAL or 0
    local coalLabel = "neutral"
    if initiatorCoalition and targetCoal then
        if targetCoal ~= initiatorCoalition and targetCoal ~= neutralSide then
            coalLabel = "enemy"
        elseif targetCoal == initiatorCoalition then
            coalLabel = "friendly"
        end
    end

    return role .. "_" .. coalLabel
end

local function classifyWeaponClass(weapon)
    if not weapon then return "UNKNOWN" end

    local okDesc, desc = pcall(function() return weapon:getDesc() end)
    if not okDesc or not desc then return "UNKNOWN" end

    local categoryName = WEAPON_CATEGORY_NAMES[desc.category]
    if not categoryName then return "UNKNOWN" end

    if categoryName == "MISSILE" then
        return MISSILE_CATEGORY_NAMES[desc.missileCategory] or "MISSILE"
    end

    return categoryName
end

local function isAirToAirMissileClass(weaponClass)
    return weaponClass == "AAM"
end

local function findInFlightWeaponCandidates(targetObjectId, weaponKey, weaponObjectId)
    local candidates = {}

    for _, candidate in pairs(CheckrideMission.activeWeaponShots) do
        if candidate.inFlight ~= false then
            local matched = false

            if candidate.weaponClass == "air_to_air_missile" then
                if targetObjectId and candidate.targetObjectId == targetObjectId then
                    matched = true
                elseif weaponKey and candidate.weaponKey == weaponKey then
                    matched = true
                elseif weaponObjectId and candidate.weaponObjectId == weaponObjectId then
                    matched = true
                end
            else
                if targetObjectId and candidate.targetObjectId == targetObjectId then
                    matched = true
                elseif weaponKey and candidate.weaponKey == weaponKey then
                    matched = true
                elseif weaponObjectId and candidate.weaponObjectId == weaponObjectId then
                    matched = true
                end
            end

            if matched then
                candidates[#candidates + 1] = candidate
            end
        end
    end

    return candidates
end

local function pickPreferredWeaponCandidate(candidates, weaponKey, weaponObjectId)
    if #candidates == 0 then
        return nil
    end

    if weaponKey then
        for _, candidate in ipairs(candidates) do
            if candidate.weaponKey == weaponKey then
                return candidate
            end
        end
    end

    if weaponObjectId then
        for _, candidate in ipairs(candidates) do
            if candidate.weaponObjectId == weaponObjectId then
                return candidate
            end
        end
    end

    return candidates[#candidates]
end

-- ============================================================================
-- Event Handler
-- ============================================================================
CheckrideMission.EventHandler = {}
CheckrideMission.WorldHandlerRegistered = false
CheckrideMission.LandingQualityEventId = nil

_G.__CHECKRIDE_WORLD_HANDLER_ACTIVE = _G.__CHECKRIDE_WORLD_HANDLER_ACTIVE or false
_G.__CHECKRIDE_WORLD_HANDLER_WORLD_ID = _G.__CHECKRIDE_WORLD_HANDLER_WORLD_ID or nil

function CheckrideMission.getCapabilityStatus()
    local hasWorld = world ~= nil
    local hasWorldEventTable = hasWorld and world.event ~= nil
    local hasLandingQualityEvent = hasWorldEventTable and world.event.S_EVENT_LANDING_QUALITY_MARK ~= nil
    local hasWorldAddHandler = hasWorld and world.addEventHandler ~= nil

    return {
        hasWorld = hasWorld,
        hasWorldEventTable = hasWorldEventTable,
        hasLandingQualityEvent = hasLandingQualityEvent,
        hasWorldAddHandler = hasWorldAddHandler,
    }
end

function CheckrideMission.ensureWorldHandler()
    local worldIdentity = tostring(world)
    if _G.__CHECKRIDE_WORLD_HANDLER_WORLD_ID ~= worldIdentity then
        _G.__CHECKRIDE_WORLD_HANDLER_ACTIVE = false
        _G.__CHECKRIDE_WORLD_HANDLER_WORLD_ID = worldIdentity
    end

    if CheckrideMission.WorldHandlerRegistered or _G.__CHECKRIDE_WORLD_HANDLER_ACTIVE then
        CheckrideMission.WorldHandlerRegistered = true
        return '__CHECKRIDE_WORLD_READY__'
    end

    local caps = CheckrideMission.getCapabilityStatus()
    if not caps.hasWorld then
        return '__CHECKRIDE_WORLD_WAIT__:missing_world'
    end

    if not caps.hasWorldEventTable then
        return '__CHECKRIDE_WORLD_WAIT__:missing_world_event_table'
    end

    if not caps.hasLandingQualityEvent then
        return '__CHECKRIDE_WORLD_WAIT__:missing_landing_quality_event'
    end

    if not caps.hasWorldAddHandler then
        return '__CHECKRIDE_WORLD_WAIT__:missing_world_addEventHandler'
    end

    CheckrideMission.LandingQualityEventId = world.event.S_EVENT_LANDING_QUALITY_MARK
    CheckrideMission.TakeoffEventId        = world.event.S_EVENT_TAKEOFF
    CheckrideMission.KillEventId           = world.event.S_EVENT_KILL
    CheckrideMission.ShotEventId           = world.event.S_EVENT_SHOT
    CheckrideMission.HitEventId            = world.event.S_EVENT_HIT
    CheckrideMission.ShootingStartEventId  = world.event.S_EVENT_SHOOTING_START
    CheckrideMission.ShootingEndEventId    = world.event.S_EVENT_SHOOTING_END

    -- Remove any previously registered handler before re-registering.
    -- If world identity changed (mission reload), the old handler object may still
    -- be registered and will fire alongside the new one, causing duplicate events.
    if CheckrideMission._registeredHandler then
        pcall(function() world.removeEventHandler(CheckrideMission._registeredHandler) end)
    end

    local ok, err = pcall(function()
        world.addEventHandler(CheckrideMission.EventHandler)
    end)

    if not ok then
        return '__CHECKRIDE_WORLD_FAIL__:' .. tostring(err)
    end

    CheckrideMission._registeredHandler = CheckrideMission.EventHandler

    CheckrideMission.WorldHandlerRegistered = true
    _G.__CHECKRIDE_WORLD_HANDLER_ACTIVE = true
    _G.__CHECKRIDE_WORLD_HANDLER_WORLD_ID = worldIdentity
    CheckrideMission.log('world event handler registered')
    return '__CHECKRIDE_WORLD_READY__'
end

function CheckrideMissionEnsureWorldHandler()
    return CheckrideMission.ensureWorldHandler()
end

function CheckrideMission.EventHandler:onEvent(event)
    if not event then return end

    if CheckrideMission.LandingQualityEventId and event.id == CheckrideMission.LandingQualityEventId then
        CheckrideMission.onLandingQualityMark(event)
    end

    if CheckrideMission.TakeoffEventId and event.id == CheckrideMission.TakeoffEventId then
        CheckrideMission.onTakeoff(event)
    end

    if CheckrideMission.KillEventId and event.id == CheckrideMission.KillEventId then
        CheckrideMission.onKill(event)
    end

    if CheckrideMission.ShotEventId and event.id == CheckrideMission.ShotEventId then
        CheckrideMission.onShot(event)
    end

    if CheckrideMission.HitEventId and event.id == CheckrideMission.HitEventId then
        CheckrideMission.onHit(event)
    end

    if CheckrideMission.ShootingStartEventId and event.id == CheckrideMission.ShootingStartEventId then
        CheckrideMission.onShootingStart(event)
    end

    if CheckrideMission.ShootingEndEventId and event.id == CheckrideMission.ShootingEndEventId then
        CheckrideMission.onShootingEnd(event)
    end
end

function CheckrideMission.onShootingStart(event)
    local initiator = event.initiator
    if not initiator then return end
    local playerName, _, ucid = CheckrideMission.getPlayerInfo(initiator)
    if not playerName then return end
    CheckrideMission.sendEnrichmentEvent({
        type       = "gun_burst_start",
        source     = "mission",
        playerUcid = ucid,
        playerName = playerName,
        startAtMs  = event.time,
        missionTime = event.time,
    })
end

function CheckrideMission.onShootingEnd(event)
    local initiator = event.initiator
    if not initiator then return end
    local playerName, _, ucid = CheckrideMission.getPlayerInfo(initiator)
    if not playerName then return end
    CheckrideMission.sendEnrichmentEvent({
        type       = "gun_burst_end",
        source     = "mission",
        playerUcid = ucid,
        playerName = playerName,
        endAtMs    = event.time,
        missionTime = event.time,
    })
end

function CheckrideMission.onShot(event)
    local initiator = event.initiator
    local weapon = event.weapon
    if not initiator or not weapon then return end

    local playerName, _, ucid = CheckrideMission.getPlayerInfo(initiator)

    if not playerName then
        -- AI initiator: track guided missiles targeting a player
        local target = event.target
        if not target then return end

        local targetPlayerName = nil
        local okTName, tName = pcall(function() return target:getPlayerName() end)
        if okTName and tName and tName ~= "" then targetPlayerName = tName end
        if not targetPlayerName then return end

        local okWDesc, wDesc = pcall(function() return weapon:getDesc() end)
        if not okWDesc or not wDesc then return end
        local guidance = wDesc.guidance
        if not guidance or guidance == 0 then return end  -- unguided, skip

        local role = nil
        local okIDesc, iDesc = pcall(function() return initiator:getDesc() end)
        if okIDesc and iDesc then
            local attrs = iDesc.attributes or {}
            if attrs["SAM SR"] or attrs["SAM TR"] or attrs["SAM launcher"] then role = "SAM"
            elseif attrs["AAA"] then role = "AAA"
            elseif attrs["Fighters"] or attrs["Multirole fighters"] or attrs["Bombers"] then role = "FIGHTER"
            elseif attrs["Helicopters"] then role = "HELICOPTER"
            elseif iDesc.category == Unit.Category.AIRPLANE then role = "FIGHTER"
            elseif iDesc.category == Unit.Category.HELICOPTER then role = "HELICOPTER"
            end
        end
        if not role then return end

        local targetUcid = CheckrideLookupUCID and CheckrideLookupUCID(targetPlayerName) or nil
        local weaponKey = getWeaponKey(weapon)
        local weaponObjectId = getObjectId(weapon)
        local weaponName = getWeaponTypeName(weapon)
        local initiatorObjectId = getObjectId(initiator)
        local weaponGuidance = GUIDANCE_NAMES[guidance] or tostring(guidance)

        if not weaponKey then
            weaponKey = "inbound:" .. tostring(targetUcid or targetPlayerName) .. ":" ..
                        tostring(weaponObjectId or weaponName or "missile") .. ":" .. tostring(event.time or 0)
        end

        CheckrideMission.activeInboundMissiles[weaponKey] = {
            weaponKey         = weaponKey,
            weaponObjectId    = weaponObjectId,
            weaponName        = weaponName,
            weaponGuidance    = weaponGuidance,
            initiatorRole     = role,
            initiatorObjectId = initiatorObjectId,
            playerUcid        = targetUcid,
            playerName        = targetPlayerName,
            firedAt           = event.time,
            lastDataAt        = event.time,
            weaponRef         = weapon,
        }

        CheckrideMission.sendEnrichmentEvent({
            type              = "inbound_missile",
            source            = "mission",
            playerUcid        = targetUcid,
            playerName        = targetPlayerName,
            weaponKey         = weaponKey,
            weaponName        = weaponName,
            weaponGuidance    = weaponGuidance,
            initiatorRole     = role,
            initiatorObjectId = initiatorObjectId,
            launchedAtMs      = event.time,
            missionTime       = event.time,
        })
        return
    end

    local weaponKey = getWeaponKey(weapon)
    local weaponName = getWeaponTypeName(weapon)
    local weaponDisplayName = getWeaponDisplayName(weapon)
    local weaponClass = classifyWeaponClass(weapon)
    local weaponObjectId = getObjectId(weapon)
    local targetObjectId = getObjectId(event.target)
    local startPoint = getObjectPoint(weapon) or getObjectPoint(initiator)
    local speedMps = getObjectSpeedMps(weapon)
    local speedKts = speedMps and (speedMps * MPS_TO_KNOTS) or nil
    local speedMach = nil
    if speedMps and startPoint then
        local speedOfSound = speedOfSoundAtPoint(startPoint)
        if isFiniteNumber(speedOfSound) and speedOfSound > 0 then
            speedMach = speedMps / speedOfSound
        end
    end

    if not weaponKey then
        weaponKey = tostring((ucid or playerName or "unknown") .. ":" .. tostring(weaponObjectId or weaponName or "weapon") .. ":" .. tostring(event.time or 0))
    end

    if not startPoint then
        return
    end

    CheckrideMission.activeWeaponShots[weaponKey] = {
        weaponKey = weaponKey,
        weaponClass = weaponClass,
        startX = startPoint.x,
        startY = startPoint.z,
        startAlt = startPoint.y,
        weaponName = weaponName,
        weaponDisplayName = weaponDisplayName,
        weaponObjectId = weaponObjectId,
        targetObjectId = targetObjectId,
        inFlight = true,
        weaponRef = weapon,
        playerUcid = ucid,
        playerName = playerName,
        firedAt = event.time,
        lastDataAt = event.time,
    }

    local weaponGuidance = nil
    local okWDesc, wDesc = pcall(function() return weapon:getDesc() end)
    if okWDesc and wDesc then
        weaponGuidance = GUIDANCE_NAMES[wDesc.guidance] or (wDesc.guidance and tostring(wDesc.guidance)) or nil
    end

    local message = {
        type = "shot_enrichment",
        source = "mission",
        playerUcid = ucid,
        playerName = playerName,
        weaponKey = weaponKey,
        weaponClass = weaponClass,
        weaponName = weaponName,
        weaponDisplayName = weaponDisplayName,
        weaponGuidance = weaponGuidance,
        weaponObjectId = weaponObjectId,
        targetObjectId = targetObjectId,
        inFlight = true,
        status = "in_flight",
        startX = startPoint.x,
        startY = startPoint.z,
        startAlt = startPoint.y,
        speedKts = speedKts,
        speedMach = speedMach,
        missionTime = event.time,
    }

    CheckrideMission.sendEnrichmentEvent(message)
end

local function isAirTarget(target)
    if not target then
        return false
    end

    local okDesc, desc = pcall(function() return target:getDesc() end)
    if not okDesc or not desc then
        return false
    end

    return desc.category == Unit.Category.AIRPLANE or desc.category == Unit.Category.HELICOPTER
end

function CheckrideMission.onHit(event)
    local initiator = event.initiator
    local weapon    = event.weapon
    local target    = event.target

    -- ── Path A: player is the TARGET (inbound missile hit) ────────────────────
    if target then
        local targetPlayerName = nil
        local okTName, tName = pcall(function() return target:getPlayerName() end)
        if okTName and tName and tName ~= "" then targetPlayerName = tName end

        if targetPlayerName then
            local targetUcid = CheckrideLookupUCID and CheckrideLookupUCID(targetPlayerName) or nil
            local inboundKey = getWeaponKey(weapon)
            local inboundObjectId = getObjectId(weapon)

            if inboundKey and CheckrideMission.activeInboundMissiles[inboundKey] then
                -- found by weaponKey
            elseif inboundObjectId then
                inboundKey = nil
                for k, v in pairs(CheckrideMission.activeInboundMissiles) do
                    if v.weaponObjectId == inboundObjectId then inboundKey = k; break end
                end
            else
                inboundKey = nil
            end

            if inboundKey then
                local track = CheckrideMission.activeInboundMissiles[inboundKey]
                CheckrideMission.sendEnrichmentEvent({
                    type              = "inbound_missile_hit",
                    source            = "mission",
                    playerUcid        = targetUcid or track.playerUcid,
                    playerName        = targetPlayerName,
                    weaponKey         = inboundKey,
                    weaponGuidance    = track.weaponGuidance,
                    initiatorRole     = track.initiatorRole,
                    initiatorObjectId = track.initiatorObjectId,
                    missionTime       = event.time,
                })
                CheckrideMission.activeInboundMissiles[inboundKey] = nil
            end
        end
    end

    -- ── Path B: player is the INITIATOR (outbound weapon tracking) ────────────
    if not initiator then return end

    local playerName, _, ucid = CheckrideMission.getPlayerInfo(initiator)
    if not playerName then return end

    local weaponKey      = getWeaponKey(weapon)
    local weaponObjectId = getObjectId(weapon)
    local targetObjectId = getObjectId(target)

    -- Lethal / non-lethal fork on the target
    if target then
        local life = nil
        local okLife, lifeVal = pcall(function() return target:getLife() end)
        if okLife and type(lifeVal) == "number" then life = lifeVal end

        if life and life <= 1.0 then
            -- ── Lethal hit: capture victim data while the object still exists ─
            local victimRoles = {}
            local okVDesc, vDesc = pcall(function() return target:getDesc() end)
            if okVDesc and vDesc and type(vDesc.attributes) == "table" then
                local wantedRoles = {
                    "SAM SR","SAM TR","SAM launcher",
                    "Armour","Tanks","IFV","APC",
                    "AAA","Artillery","MLRS","Infantry",
                }
                for _, r in ipairs(wantedRoles) do
                    if vDesc.attributes[r] then victimRoles[#victimRoles + 1] = r end
                end
            end

            local weaponGuidance = nil
            if weapon then
                local okWDesc2, wDesc2 = pcall(function() return weapon:getDesc() end)
                if okWDesc2 and wDesc2 then
                    weaponGuidance = GUIDANCE_NAMES[wDesc2.guidance] or
                                     (wDesc2.guidance and tostring(wDesc2.guidance)) or nil
                end
            end

            local victimPoint = getObjectPoint(target)
            local victimTypeName = nil
            local okTType, tType = pcall(function() return target:getTypeName() end)
            if okTType and tType and tType ~= "" then victimTypeName = tType end

            local weaponClass = weapon and classifyWeaponClass(weapon) or nil

            if targetObjectId then
                CheckrideMission.pendingKillsByObjectId[targetObjectId] = {
                    killedAtMs      = event.time,
                    victimRoles     = victimRoles,
                    weaponGuidance  = weaponGuidance,
                    weaponClass     = weaponClass,
                    victimPositionX = victimPoint and victimPoint.x or nil,
                    victimPositionY = victimPoint and victimPoint.z or nil,
                    night           = CheckrideMission.isNight(event.time),
                    victimTypeName  = victimTypeName,
                }
            end
            -- No event emitted here — onKill completes and emits kill_enrichment.

        elseif life and life > 1.0 then
            -- ── Non-lethal hit: emit lightweight hit counter ──────────────────
            local killerCoal = nil
            pcall(function() killerCoal = initiator:getCoalition() end)
            local roleCoalition = getRoleCoalition(target, killerCoal)
            if roleCoalition then
                CheckrideMission.sendEnrichmentEvent({
                    type         = "hit_enrichment",
                    source       = "mission",
                    playerUcid   = ucid,
                    playerName   = playerName,
                    roleCoalition = roleCoalition,
                    missionTime  = event.time,
                })
            end
        end
    end

    -- ── Outbound weapon tracking hit (distanceNm, height delta) ───────────────
    local matchingShots = findInFlightWeaponCandidates(targetObjectId, weaponKey, weaponObjectId)
    if #matchingShots == 0 then return end

    local shotState = pickPreferredWeaponCandidate(matchingShots, weaponKey, weaponObjectId)
    if not shotState then return end

    if isAirToAirMissileClass(shotState.weaponClass) then
        if target and not isAirTarget(target) then return end
    end

    weaponKey = shotState.weaponKey

    local hitPoint = getObjectPoint(target) or getObjectPoint(weapon)
    if not hitPoint then return end

    local distanceNm    = nil
    local heightDeltaFt = nil
    local dx = hitPoint.x - shotState.startX
    local dy = hitPoint.z - shotState.startY
    distanceNm    = math.sqrt((dx * dx) + (dy * dy)) * METERS_TO_NM
    heightDeltaFt = (hitPoint.y - shotState.startAlt) * METERS_TO_FEET

    if weaponKey then
        CheckrideMission.activeWeaponShots[weaponKey] = nil
    end

    CheckrideMission.sendEnrichmentEvent({
        type             = "hit_enrichment",
        source           = "mission",
        playerUcid       = ucid,
        playerName       = playerName,
        weaponKey        = weaponKey,
        weaponClass      = shotState.weaponClass,
        weaponName       = shotState.weaponName or getWeaponTypeName(weapon),
        weaponDisplayName = shotState.weaponDisplayName or getWeaponDisplayName(weapon),
        weaponObjectId   = weaponObjectId,
        targetObjectId   = targetObjectId,
        inFlight         = false,
        status           = "hit",
        hitX             = hitPoint.x,
        hitY             = hitPoint.z,
        hitAlt           = hitPoint.y,
        distanceNm       = distanceNm,
        heightDeltaFt    = heightDeltaFt,
        missionTime      = event.time,
    })
end

function CheckrideMission.onLandingQualityMark(event)
    local initiator = event.initiator
    if not initiator then
        CheckrideMission.log("grading event without initiator, skipping")
        return
    end

    local playerName, unitType, ucid = CheckrideMission.getPlayerInfo(initiator)
    if not playerName then
        CheckrideMission.log("grading event for AI unit, skipping")
        return
    end

    local grade, wire, raw = CheckrideMission.parseComment(event.comment)
    if not grade then
        CheckrideMission.log("could not parse grade from comment: " .. tostring(event.comment))
        return
    end

    local night = CheckrideMission.isNight(event.time)
    local carrierName = CheckrideMission.getCarrierName(event.place)
    local fuelState = initiator:getFuel()

    local message = {
        type = "grading",
        source = "mission",
        playerUcid = ucid,
        playerName = playerName,
        unitType = unitType,
        lsoGrade = grade,
        wire = wire,
        night = night,
        gradingRaw = raw,
        carrierName = carrierName,
        missionTime = event.time,
        fuelState = fuelState,
    }

    CheckrideMission.log(
        playerName .. " graded " .. grade ..
        (wire and (" wire " .. wire) or "") ..
        (night and " (night)" or "") ..
        " on " .. (carrierName or "unknown")
    )

    CheckrideMission.sendEvent(message)
end

-- ============================================================================
-- Takeoff Enrichment
-- Emits a takeoff_enrichment event so the client can track whether the pilot
-- launched from a carrier and store their takeoff position for kill distance.
-- Airbase desc category: AIRDROME=0, HELIPAD=1, SHIP=2
-- ============================================================================
function CheckrideMission.onTakeoff(event)
    local initiator = event.initiator
    if not initiator then return end

    local playerName, unitType, ucid = CheckrideMission.getPlayerInfo(initiator)
    if not playerName then return end -- AI unit, skip

    local place = event.place
    if not place then return end

    -- Determine if the takeoff surface is a ship (carrier)
    local isCarrier = false
    local placeName = CheckrideMission.getCarrierName(place)

    -- Object category for Airbase is BASE (4) so this is mainly diagnostic.
    local okCategory, placeCategory = pcall(function() return place:getCategory() end)

    -- Airbase descriptor category for ship decks.
    local ok, desc = pcall(function() return place:getDesc() end)
    if ok and desc and desc.category == Airbase.Category.SHIP then
        isCarrier = true
    end

    local carrierKey = ucid or playerName
    local carrierName = placeName

    if isCarrier then
        CheckrideMission.pilotCarrierByUcid[carrierKey] = place
    else
        CheckrideMission.pilotCarrierByUcid[carrierKey] = nil
    end

    local message = {
        type             = "takeoff_enrichment",
        source           = "mission",
        playerUcid       = ucid,
        playerName       = playerName,
        launchedFromCarrier = isCarrier,
        takeoffLocation  = carrierName,
        missionTime      = event.time,
    }

    CheckrideMission.log(
        "takeoff enrichment: place=" .. tostring(carrierName or "unknown") ..
        " placeCategory=" .. tostring(placeCategory) ..
        " descCategory=" .. tostring(ok and desc and desc.category or nil) ..
        " launchedFromCarrier=" .. tostring(isCarrier)
    )

    CheckrideMission.log(
        playerName .. " took off from " ..
        (isCarrier and ("carrier " .. (carrierName or "unknown")) or "airbase")
    )

    CheckrideMission.sendEnrichmentEvent(message)
end

-- ============================================================================
-- Kill Enrichment
-- Emits a kill_enrichment event with victim category and distance to carrier.
-- victimUnitCategory: "air" | "ground" | "ship" | "other"
-- carrierDistanceNm: number (nm from killer's carrier) or nil if no carrier ref.
-- ============================================================================
function CheckrideMission.onKill(event)
    local initiator = event.initiator
    if not initiator then return end

    local target = event.target
    if not target then return end

    -- Emit friendly_killed_enrichment whenever a friendly aircraft is destroyed
    -- by an enemy, whether the victim is a human player or an AI aircraft.
    local victimPlayerName = nil
    local okVPN, vpn = pcall(function() return target:getPlayerName() end)
    if okVPN and vpn and vpn ~= "" then victimPlayerName = vpn end

    local victimIsAirUnit = false
    local okVCat, vCat = pcall(function() return target:getDesc() end)
    if okVCat and vCat then
        victimIsAirUnit = (vCat.category == Unit.Category.AIRPLANE or vCat.category == Unit.Category.HELICOPTER)
    end

    local killerCoalForFriendly = nil
    local victimCoalForFriendly = nil
    pcall(function() killerCoalForFriendly = initiator:getCoalition() end)
    pcall(function() victimCoalForFriendly = target:getCoalition() end)
    local victimIsEnemyKilled = killerCoalForFriendly and victimCoalForFriendly and
                                killerCoalForFriendly ~= victimCoalForFriendly and
                                victimCoalForFriendly ~= coalition.side.NEUTRAL

    if victimPlayerName or (victimIsAirUnit and victimIsEnemyKilled) then
        local killerObjectId = getObjectId(initiator)
        local killerTypeName = nil
        local okKType, kType = pcall(function() return initiator:getTypeName() end)
        if okKType and kType and kType ~= "" then killerTypeName = kType end

        local victimPlayerUcid = victimPlayerName and (CheckrideLookupUCID and CheckrideLookupUCID(victimPlayerName) or nil) or nil

        CheckrideMission.sendEnrichmentEvent({
            type             = "friendly_killed_enrichment",
            source           = "mission",
            killerObjectId   = killerObjectId,
            killerTypeName   = killerTypeName,
            victimPlayerName = victimPlayerName,
            victimPlayerUcid = victimPlayerUcid,
            missionTime      = event.time,
        })
    end

    local playerName, unitType, ucid = CheckrideMission.getPlayerInfo(initiator)
    if not playerName then return end -- AI kill, skip rest

    local victimObjectId = getObjectId(target)

    -- Consume pending kill data captured in onHit (before target despawns)
    local pending = nil
    if victimObjectId then
        pending = CheckrideMission.pendingKillsByObjectId[victimObjectId]
        CheckrideMission.pendingKillsByObjectId[victimObjectId] = nil
    end

    -- Victim unit category — try live target first, fall back gracefully
    local victimUnitCategory = "other"
    local victimAirType = nil
    local okDesc, desc = pcall(function() return target:getDesc() end)
    if okDesc and desc then
        if desc.category == Unit.Category.AIRPLANE then
            victimUnitCategory = "air"
            victimAirType = "AIRPLANE"
        elseif desc.category == Unit.Category.HELICOPTER then
            victimUnitCategory = "air"
            victimAirType = "HELICOPTER"
        elseif desc.category == Unit.Category.GROUND_UNIT then
            victimUnitCategory = "ground"
        elseif desc.category == Unit.Category.SHIP then
            victimUnitCategory = "ship"
        end
    end

    -- Killer airframe category
    local killerUnitCategory = nil
    local okKDesc, kDesc = pcall(function() return initiator:getDesc() end)
    if okKDesc and kDesc then
        if kDesc.category == Unit.Category.AIRPLANE then killerUnitCategory = "AIRPLANE"
        elseif kDesc.category == Unit.Category.HELICOPTER then killerUnitCategory = "HELICOPTER"
        end
    end

    -- Coalition check
    local killerCoal = nil
    local victimCoal = nil
    pcall(function() killerCoal = initiator:getCoalition() end)
    pcall(function() victimCoal = target:getCoalition() end)
    local isEnemy = killerCoal and victimCoal and
                    killerCoal ~= victimCoal and victimCoal ~= coalition.side.NEUTRAL

    -- Distance from pilot's carrier — use pending position when target is already gone
    local carrierKey = ucid or playerName
    local carrier = CheckrideMission.pilotCarrierByUcid[carrierKey]
    local carrierDistanceNm = nil

    if carrier then
        local okAlive, alive = pcall(function() return carrier:isExist() end)
        if okAlive and alive then
            local okCP, carrierPos = pcall(function() return carrier:getPoint() end)
            local targetX, targetZ = nil, nil

            if pending and pending.victimPositionX and pending.victimPositionY then
                targetX = pending.victimPositionX
                targetZ = pending.victimPositionY
            else
                local okTP, targetPos = pcall(function() return target:getPoint() end)
                if okTP and targetPos then
                    targetX = targetPos.x
                    targetZ = targetPos.z
                end
            end

            if okCP and carrierPos and targetX and targetZ then
                local dx = carrierPos.x - targetX
                local dz = carrierPos.z - targetZ
                carrierDistanceNm = math.sqrt(dx * dx + dz * dz) / 1852.0
            end
        end
    end

    -- Detect collision kill: event.weapon is a Unit object when the killer rammed the target.
    -- A normal weapon kill has event.weapon as a Weapon object (Object.Category.WEAPON).
    local isCollision = false
    if event.weapon then
        local okCat, weapCat = pcall(function() return event.weapon:getCategory() end)
        isCollision = okCat and weapCat == Object.Category.UNIT
    end

    local message = {
        type               = "kill_enrichment",
        source             = "mission",
        playerUcid         = ucid,
        playerName         = playerName,
        victimObjectId     = victimObjectId,
        victimUnitCategory = victimUnitCategory,
        victimAirType      = victimAirType,
        isEnemy            = isEnemy,
        carrierDistanceNm  = carrierDistanceNm,
        killerUnitCategory = killerUnitCategory,
        killedAtMs         = pending and pending.killedAtMs or event.time,
        victimRoles        = pending and pending.victimRoles or nil,
        weaponGuidance     = pending and pending.weaponGuidance or nil,
        weaponClass        = pending and pending.weaponClass or (isCollision and "COLLISION" or nil),
        victimPositionX    = pending and pending.victimPositionX or nil,
        victimPositionY    = pending and pending.victimPositionY or nil,
        night              = pending and pending.night or nil,
        victimTypeName     = pending and pending.victimTypeName or nil,
        missionTime        = event.time,
    }

    CheckrideMission.log(
        playerName .. " kill: " .. victimUnitCategory ..
        (pending and " (enriched)" or " (no hit record)") ..
        (carrierDistanceNm and (" at " .. string.format("%.1f", carrierDistanceNm) .. "nm from carrier") or "")
    )

    CheckrideMission.sendEnrichmentEvent(message)
end

-- ============================================================================
-- Register
-- ============================================================================
local worldInitStatus = CheckrideMission.ensureWorldHandler()
CheckrideMission.log('world init status: ' .. tostring(worldInitStatus))
CheckrideMission.startTelemetrySampler()
CheckrideMission.startWeaponSampler()
checkrideMissionInfo("Loaded - DCS-Checkride Mission Script v" .. CheckrideMission.version)

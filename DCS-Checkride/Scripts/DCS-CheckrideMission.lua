-- ============================================================================
-- DCS-Checkride Mission Script
-- Captures mission-level events not available in the GameGUI environment.
-- Must be loaded via a mission trigger (DO SCRIPT FILE) or autoload.
--
-- Queues encoded events for retrieval via net.dostring_in from GameGUI/hook.
-- ============================================================================
CheckrideMission = {}
CheckrideMission.version = "0.1.0"
CheckrideMission.EventQueue = CheckrideMission.EventQueue or {}

local function checkrideMissionInfo(message)
    if log and log.write then
        log.write('DCS-Checkride-Mission', log.INFO, tostring(message))
    end
end

checkrideMissionInfo("Loading - DCS-Checkride Mission Script v" .. CheckrideMission.version)

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
-- Register
-- ============================================================================
local worldInitStatus = CheckrideMission.ensureWorldHandler()
CheckrideMission.log('world init status: ' .. tostring(worldInitStatus))
checkrideMissionInfo("Loaded - DCS-Checkride Mission Script v" .. CheckrideMission.version)

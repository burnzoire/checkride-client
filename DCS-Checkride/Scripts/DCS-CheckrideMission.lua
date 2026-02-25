-- ============================================================================
-- DCS-Checkride Mission Script
-- Captures mission-level events not available in the GameGUI environment.
-- Must be loaded via a mission trigger (DO SCRIPT FILE) or autoload.
--
-- Sends JSON over UDP to the Checkride daemon on port 41236.
-- ============================================================================
CheckrideMission = {}
CheckrideMission.version = "0.1.0"

env.info("Loading - DCS-Checkride Mission Script v" .. CheckrideMission.version)

-- ============================================================================
-- UDP Setup
-- ============================================================================
package.path  = package.path .. ";.\\LuaSocket\\?.lua;"
package.cpath = package.cpath .. ";.\\LuaSocket\\?.dll;"

local JSON = loadfile("Scripts\\JSON.lua")()
local socket = require("socket")

CheckrideMission.UDPHost = "127.0.0.1"
CheckrideMission.UDPPort = 41236
CheckrideMission.UDPSocket = socket.udp()
CheckrideMission.UDPSocket:settimeout(0)

-- ============================================================================
-- Logging
-- ============================================================================
function CheckrideMission.log(str)
    env.info("[Checkride Mission] " .. str)
end

-- ============================================================================
-- UDP Send
-- ============================================================================
function CheckrideMission.sendEvent(message)
    local ok, encoded = pcall(function() return JSON:encode(message) end)
    if not ok then
        CheckrideMission.log("Failed to encode event: " .. tostring(encoded))
        return
    end
    CheckrideMission.log("send event: " .. message.type)
    socket.try(CheckrideMission.UDPSocket:sendto(encoded .. " \n", CheckrideMission.UDPHost, CheckrideMission.UDPPort))
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
-- Player UCID Resolution
-- In the mission scripting environment we don't have direct access to
-- net.get_player_info. We use the unit's player name and resolve what we can.
-- The daemon will match by player name if UCID is unavailable.
-- ============================================================================
function CheckrideMission.getPlayerInfo(initiator)
    if not initiator then
        return nil, nil, nil
    end

    local playerName = initiator:getPlayerName()
    if not playerName or playerName == "" then
        return nil, nil, nil -- AI unit, skip
    end

    local unitType = initiator:getTypeName()

    return playerName, unitType
end

-- ============================================================================
-- Night Detection
-- Uses mission theatre time to determine if it's a night pass.
-- Night = before 0600 or after 2000 local mission time.
-- ============================================================================
function CheckrideMission.isNight(missionTime)
    if not missionTime then
        return false
    end

    -- model_time is seconds since midnight in the mission
    local timeOfDay = missionTime % 86400
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

function CheckrideMission.EventHandler:onEvent(event)
    if not event then return end

    if event.id == world.event.S_EVENT_LANDING_QUALITY_MARK then
        CheckrideMission.onLandingQualityMark(event)
    end
end

function CheckrideMission.onLandingQualityMark(event)
    local initiator = event.initiator
    if not initiator then
        CheckrideMission.log("grading event without initiator, skipping")
        return
    end

    local playerName, unitType = CheckrideMission.getPlayerInfo(initiator)
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
world.addEventHandler(CheckrideMission.EventHandler)
env.info("Loaded - DCS-Checkride Mission Script v" .. CheckrideMission.version)

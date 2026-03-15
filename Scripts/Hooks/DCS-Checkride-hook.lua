local log = require('log')

local function checkrideLogInfo(message)
    log.write('DCS-Checkride-Hook', log.INFO, tostring(message))
end

local function checkrideLogError(message)
    log.write('DCS-Checkride-Hook', log.ERROR, tostring(message))
end

local function checkrideLogWarn(message)
    local warningLevel = log.WARNING or log.WARN or log.INFO
    log.write('DCS-Checkride-Hook', warningLevel, tostring(message))
end

local CHECKRIDE_CLIENT_VERSION = '__CHECKRIDE_CLIENT_VERSION__'
checkrideLogInfo('Hook version: ' .. CHECKRIDE_CLIENT_VERSION)

local status, result = pcall(function() local dcsSr=require('lfs');dofile(dcsSr.writedir()..[[Mods\Services\DCS-Checkride\Scripts\DCS-CheckrideGameGUI.lua]]); end,nil)

if not status then
	checkrideLogError('Failed to load GameGUI: ' .. tostring(result))
else
    checkrideLogInfo('Loaded Checkride GameGUI hook entrypoint')
    local loadedVersion = Checkride and Checkride.clientVersion
    if loadedVersion and tostring(loadedVersion) ~= CHECKRIDE_CLIENT_VERSION then
        checkrideLogWarn('Client version mismatch (hook=' .. CHECKRIDE_CLIENT_VERSION .. ', gamegui=' .. tostring(loadedVersion) .. ')')
    end
end

-- Inject mission script on mission load
local CheckrideCallbackRouter = {}
local CHECKRIDE_MISSION_STATE = 'server'

local function forwardToCheckride(callbackName, ...)
    if not Checkride or type(Checkride[callbackName]) ~= 'function' then
        return
    end

    local ok, err = pcall(Checkride[callbackName], ...)
    if not ok then
        checkrideLogError('Checkride callback failed (' .. callbackName .. '): ' .. tostring(err))
    end
end

function CheckrideCallbackRouter.pollMissionEventBridge()
    if not Checkride or not Checkride.sendEncodedEvent then
        return
    end

    if not Checkride.missionScriptingEnabled then
        return
    end

    local maxPerPoll = CheckrideCallbackRouter.MissionBridgeMaxEventsPerPoll or 8
    for _ = 1, maxPerPoll do
        local t0 = DCS.getRealTime()
        local encodedEvent, ok = net.dostring_in(CHECKRIDE_MISSION_STATE, [[
            if CheckrideMissionPopEvent then
                return CheckrideMissionPopEvent()
            end
            return ''
        ]])
        local elapsed = DCS.getRealTime() - t0
        if elapsed > 0.005 then
            checkrideLogError('Mission bridge poll slow: ' .. string.format('%.1fms', elapsed * 1000))
        end

        if not ok then
            checkrideLogError('Mission bridge poll failed: ' .. tostring(encodedEvent))
            return
        end

        if not encodedEvent or encodedEvent == '' then
            return
        end

        local forwardOk, forwardErr = pcall(Checkride.sendEncodedEvent, encodedEvent)
        if not forwardOk then
            checkrideLogError('Mission bridge sendEncodedEvent failed: ' .. tostring(forwardErr))
            return
        end
    end
end

function CheckrideCallbackRouter.onMissionLoadEnd()
    local ok, err = pcall(function()
        local dcsSr = require('lfs')
        local scriptPath = dcsSr.writedir() .. [[Mods\Services\DCS-Checkride\Scripts\DCS-CheckrideMission.lua]]

        local existingMissionStatus, existingMissionOk = net.dostring_in(CHECKRIDE_MISSION_STATE, [[
            if CheckrideMission and CheckrideMission.version then
                return '__CHECKRIDE_MISSION_PRESENT__:' .. tostring(CheckrideMission.version)
            end
            return ''
        ]])

        if existingMissionOk and string.find(tostring(existingMissionStatus), '__CHECKRIDE_MISSION_PRESENT__', 1, true) then
            checkrideLogInfo('Mission script already loaded, skipping reinjection: ' .. tostring(existingMissionStatus))
            return
        end

        if not Checkride.missionScriptingEnabled then
            checkrideLogInfo('Mission script injection skipped: mission scripting disabled')
            return
        end

        checkrideLogInfo('Attempting mission script injection from: ' .. scriptPath)

        local scriptFile = io.open(scriptPath, 'r')
        if not scriptFile then
            checkrideLogError('Mission script injection failed. Could not open file: ' .. scriptPath)
            return
        end

        local scriptSource = scriptFile:read('*a')
        scriptFile:close()

        if not scriptSource or scriptSource == '' then
            checkrideLogError('Mission script injection failed. Script file is empty: ' .. scriptPath)
            return
        end

        checkrideLogInfo('Using sandbox state: ' .. CHECKRIDE_MISSION_STATE)

        -- Export a UCID resolver into the selected env.
        -- Mission scripting cannot access net.*, so we maintain a
        -- name→UCID table synced on player connect/disconnect.
        net.dostring_in(CHECKRIDE_MISSION_STATE, [[
            CheckridePlayers = CheckridePlayers or {}
            function CheckrideLookupUCID(playerName)
                return CheckridePlayers[playerName]
            end
        ]])

        -- Seed with any players already connected
        CheckrideCallbackRouter.syncAllPlayers()

        local code = string.format([[local __checkride_src = %q
local __checkride_loader = loadstring or load
if not __checkride_loader then
    return '__CHECKRIDE_MISSION_ERROR__:no loader function (loadstring/load unavailable)'
end

local __checkride_chunk, __checkride_compile_err = __checkride_loader(__checkride_src, '@DCS-CheckrideMission.lua')
if not __checkride_chunk then
    return '__CHECKRIDE_MISSION_ERROR__:' .. tostring(__checkride_compile_err)
end

local __checkride_ok, __checkride_err = pcall(__checkride_chunk)
if not __checkride_ok then
    return '__CHECKRIDE_MISSION_ERROR__:' .. tostring(__checkride_err)
end

if not CheckrideMission then
    return '__CHECKRIDE_MISSION_ERROR__:CheckrideMission global missing after execution'
end

return '__CHECKRIDE_MISSION_OK__:' .. tostring(CheckrideMission.version or 'unknown') .. ':client=' .. tostring(CheckrideMission.clientVersion or 'unknown')]], scriptSource)

        local result, loadErr = net.dostring_in(CHECKRIDE_MISSION_STATE, code)
        local resultText = tostring(result)
        local loadErrText = tostring(loadErr)

        if string.find(resultText, '__CHECKRIDE_MISSION_OK__', 1, true) then
            checkrideLogInfo('Mission script injected successfully: ' .. resultText)
            local missionClientVersion = string.match(resultText, ':client=(.+)$')
            if missionClientVersion and missionClientVersion ~= CHECKRIDE_CLIENT_VERSION then
                checkrideLogWarn('Client version mismatch (hook=' .. CHECKRIDE_CLIENT_VERSION .. ', mission=' .. tostring(missionClientVersion) .. ')')
            end
        else
            checkrideLogError('Mission script injection failed. result=' .. resultText .. ' loadErr=' .. loadErrText)
        end
    end)
    if not ok then
		checkrideLogError('Mission script injection skipped: ' .. tostring(err))
    end
end

function CheckrideCallbackRouter.syncAllPlayers()
    local players = net.get_player_list()
    if not players then return end

    local statements = {
        'CheckridePlayers = CheckridePlayers or {}',
        'for key, _ in pairs(CheckridePlayers) do CheckridePlayers[key] = nil end'
    }

    local syncedCount = 0
    for _, id in ipairs(players) do
        local name = net.get_player_info(id, 'name')
        local ucid = net.get_player_info(id, 'ucid')
        if name and ucid and name ~= '' and ucid ~= '' then
            table.insert(statements, string.format('CheckridePlayers[%q]=%q', name, ucid))
            syncedCount = syncedCount + 1
        end
    end

    local _, syncOk = net.dostring_in(CHECKRIDE_MISSION_STATE, table.concat(statements, ';'))
    if not syncOk then
        checkrideLogError('syncAllPlayers failed to update mission UCID map')
    else
        checkrideLogInfo('syncAllPlayers refreshed mission UCID map entries=' .. tostring(syncedCount))
    end
end

function CheckrideCallbackRouter.onPlayerConnect(id)
    local name = net.get_player_info(id, 'name')
    local ucid = net.get_player_info(id, 'ucid')
    if name and ucid and name ~= '' and ucid ~= '' then
        net.dostring_in(CHECKRIDE_MISSION_STATE, string.format('CheckridePlayers = CheckridePlayers or {}; CheckridePlayers[%q]=%q', name, ucid))
    end

    forwardToCheckride('onPlayerConnect', id)
end

function CheckrideCallbackRouter.onPlayerDisconnect(id)
    local name = net.get_player_info(id, 'name')
    if name and name ~= '' then
        net.dostring_in(CHECKRIDE_MISSION_STATE, string.format('CheckridePlayers = CheckridePlayers or {}; CheckridePlayers[%q]=nil', name))
    end

    forwardToCheckride('onPlayerDisconnect', id)
end

CheckrideCallbackRouter.MissionBridgePollInterval = 0.1
CheckrideCallbackRouter.MissionBridgeMaxEventsPerPoll = 8
CheckrideCallbackRouter._lastBridgePoll = 0

function CheckrideCallbackRouter.onSimulationFrame()
    local now = DCS.getRealTime()
    if (now - CheckrideCallbackRouter._lastBridgePoll) >= CheckrideCallbackRouter.MissionBridgePollInterval then
        CheckrideCallbackRouter._lastBridgePoll = now
        CheckrideCallbackRouter.pollMissionEventBridge()
    end
    forwardToCheckride('onSimulationFrame')
end

function CheckrideCallbackRouter.onGameEvent(eventName, arg1, arg2, arg3, arg4, arg5, arg6, arg7)
    forwardToCheckride('onGameEvent', eventName, arg1, arg2, arg3, arg4, arg5, arg6, arg7)
end

function CheckrideCallbackRouter.onNetConnect(localPlayerID)
    forwardToCheckride('onNetConnect', localPlayerID)
end

function CheckrideCallbackRouter.onChatMessage(message, from)
    forwardToCheckride('onChatMessage', message, from)
end

local function logCallbackWiringStatus()
    local hasCheckride = type(Checkride) == 'table'
    local hasOnGameEvent = hasCheckride and type(Checkride.onGameEvent) == 'function'
    local hasOnPlayerConnect = hasCheckride and type(Checkride.onPlayerConnect) == 'function'
    local hasOnPlayerDisconnect = hasCheckride and type(Checkride.onPlayerDisconnect) == 'function'
    local hasOnSimulationFrame = hasCheckride and type(Checkride.onSimulationFrame) == 'function'
    local hasSendEncodedEvent = hasCheckride and type(Checkride.sendEncodedEvent) == 'function'
    local hasJsonDecodeForwardPath = hasCheckride and Checkride.JSON and type(Checkride.JSON.decode) == 'function' and type(Checkride.sendEvent) == 'function'

    checkrideLogInfo(
        'Callback wiring: owner=hook gamegui=' .. tostring(hasCheckride) ..
        ' onGameEvent=' .. tostring(hasOnGameEvent) ..
        ' onPlayerConnect=' .. tostring(hasOnPlayerConnect) ..
        ' onPlayerDisconnect=' .. tostring(hasOnPlayerDisconnect) ..
        ' onSimulationFrame=' .. tostring(hasOnSimulationFrame) ..
        ' missionBridgeEncoded=' .. tostring(hasSendEncodedEvent) ..
        ' missionBridgeDecoded=' .. tostring(hasJsonDecodeForwardPath) ..
        ' missionState=' .. tostring(CHECKRIDE_MISSION_STATE)
    )
end

logCallbackWiringStatus()

-- DCS uses one active user-callback table at a time (last set wins).
-- Keep this hook as the single owner, then forward into Checkride/GameGUI
-- callbacks and poll mission-only events so behavior stays deterministic.
DCS.setUserCallbacks(CheckrideCallbackRouter)

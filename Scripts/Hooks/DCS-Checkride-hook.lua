local log = require('log')

local function checkrideLogInfo(message)
    log.write('DCS-Checkride-Hook', log.INFO, tostring(message))
end

local function checkrideLogError(message)
    log.write('DCS-Checkride-Hook', log.ERROR, tostring(message))
end

local CHECKRIDE_HOOK_BUILD = '2026-02-26-server-only'
checkrideLogInfo('Hook build: ' .. CHECKRIDE_HOOK_BUILD)

_G.__DCS_CHECKRIDE_HOOK_MANAGED = true
local status, result = pcall(function() local dcsSr=require('lfs');dofile(dcsSr.writedir()..[[Mods\Services\DCS-Checkride\Scripts\DCS-CheckrideGameGUI.lua]]); end,nil)

if not status then
	checkrideLogError('Failed to load GameGUI: ' .. tostring(result))
else
    checkrideLogInfo('Loaded Checkride GameGUI hook entrypoint')
end

-- Inject mission script on mission load
local CheckrideMissionLoader = {}
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

function CheckrideMissionLoader.pollMissionEventBridge()
    local canForwardEncoded = Checkride and Checkride.sendEncodedEvent
    local canForwardDecoded = Checkride and Checkride.JSON and Checkride.JSON.decode and Checkride.sendEvent
    if not canForwardEncoded and not canForwardDecoded then
        return
    end

    local maxEventsPerFrame = 25

    for _ = 1, maxEventsPerFrame do
        local encodedEvent, ok = net.dostring_in(CHECKRIDE_MISSION_STATE, [[
            if CheckrideMissionPopEvent then
                return CheckrideMissionPopEvent()
            end
            return ''
        ]])

        if not ok then
            checkrideLogError('Mission bridge poll failed: ' .. tostring(encodedEvent))
            return
        end

        if not encodedEvent or encodedEvent == '' then
            return
        end

        if Checkride and Checkride.sendEncodedEvent then
            local forwardOk, forwardErr = pcall(Checkride.sendEncodedEvent, encodedEvent)
            if not forwardOk then
                checkrideLogError('Mission bridge sendEncodedEvent failed: ' .. tostring(forwardErr))
            end
        elseif Checkride and Checkride.JSON and Checkride.JSON.decode and Checkride.sendEvent then
            local decodedOk, decodedEvent = pcall(function() return Checkride.JSON:decode(encodedEvent) end)
            if decodedOk and decodedEvent then
                Checkride.sendEvent(decodedEvent)
            else
                checkrideLogError('Mission bridge JSON decode failed: ' .. tostring(decodedEvent))
            end
        else
            checkrideLogError('Mission bridge cannot forward event: Checkride JSON/socket sender unavailable')
            return
        end
    end
end

function CheckrideMissionLoader.onMissionLoadEnd()
    local ok, err = pcall(function()
        local dcsSr = require('lfs')
        local scriptPath = dcsSr.writedir() .. [[Mods\Services\DCS-Checkride\Scripts\DCS-CheckrideMission.lua]]

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
        CheckrideMissionLoader.syncAllPlayers()

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

return '__CHECKRIDE_MISSION_OK__:' .. tostring(CheckrideMission.version or 'unknown')]], scriptSource)

        local result, loadErr = net.dostring_in(CHECKRIDE_MISSION_STATE, code)
        local resultText = tostring(result)
        local loadErrText = tostring(loadErr)

        if string.find(resultText, '__CHECKRIDE_MISSION_OK__', 1, true) then
            checkrideLogInfo('Mission script injected successfully: ' .. resultText)
        else
            checkrideLogError('Mission script injection failed. result=' .. resultText .. ' loadErr=' .. loadErrText)
        end
    end)
    if not ok then
		checkrideLogError('Mission script injection skipped: ' .. tostring(err))
    end
end

function CheckrideMissionLoader.syncAllPlayers()
    local players = net.get_player_list()
    if not players then return end

    local entries = {}
    for _, id in ipairs(players) do
        local name = net.get_player_info(id, 'name')
        local ucid = net.get_player_info(id, 'ucid')
        if name and ucid and name ~= '' and ucid ~= '' then
            table.insert(entries, string.format('[%q]=%q', name, ucid))
        end
    end

    if #entries > 0 then
        net.dostring_in(CHECKRIDE_MISSION_STATE, 'CheckridePlayers={' .. table.concat(entries, ',') .. '}')
    end
end

function CheckrideMissionLoader.onPlayerConnect(id)
    local name = net.get_player_info(id, 'name')
    local ucid = net.get_player_info(id, 'ucid')
    if name and ucid and name ~= '' and ucid ~= '' then
        net.dostring_in(CHECKRIDE_MISSION_STATE, string.format('CheckridePlayers[%q]=%q', name, ucid))
    end

    forwardToCheckride('onPlayerConnect', id)
end

function CheckrideMissionLoader.onPlayerDisconnect(id)
    local name = net.get_player_info(id, 'name')
    if name and name ~= '' then
        net.dostring_in(CHECKRIDE_MISSION_STATE, string.format('CheckridePlayers[%q]=nil', name))
    end

    forwardToCheckride('onPlayerDisconnect', id)
end

CheckrideMissionLoader.MissionBridgePollInterval = 0.5
CheckrideMissionLoader._lastBridgePoll = 0

function CheckrideMissionLoader.onSimulationFrame()
    local now = DCS.getRealTime()
    if (now - CheckrideMissionLoader._lastBridgePoll) >= CheckrideMissionLoader.MissionBridgePollInterval then
        CheckrideMissionLoader._lastBridgePoll = now
        CheckrideMissionLoader.pollMissionEventBridge()
    end
    forwardToCheckride('onSimulationFrame')
end

function CheckrideMissionLoader.onGameEvent(eventName, arg1, arg2, arg3, arg4, arg5, arg6, arg7)
    forwardToCheckride('onGameEvent', eventName, arg1, arg2, arg3, arg4, arg5, arg6, arg7)
end

function CheckrideMissionLoader.onNetConnect(localPlayerID)
    forwardToCheckride('onNetConnect', localPlayerID)
end

function CheckrideMissionLoader.onChatMessage(message, from)
    forwardToCheckride('onChatMessage', message, from)
end

DCS.setUserCallbacks(CheckrideMissionLoader)

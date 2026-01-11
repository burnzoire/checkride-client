-- ============================================================================
-- DCS-Quoll Game Event Tracker
-- ============================================================================
Quoll = {}
Quoll.version = "2.1"
Quoll.clients = {}

net.log("Loading - DCS-Quoll v" .. Quoll.version)

-- ============================================================================
-- Logging
-- ============================================================================
Quoll.logFile = io.open(lfs.writedir() .. [[Logs\DCS-Quoll-GameGUI.log]], "w")

function Quoll.log(str)
    if Quoll.logFile then
        Quoll.logFile:write(str .. "\n")
        Quoll.logFile:flush()
    end
end

-- ============================================================================
-- UDP Setup
-- ============================================================================
package.path  = package.path .. ";.\\LuaSocket\\?.lua;"
package.cpath = package.cpath .. ";.\\LuaSocket\\?.dll;"

local JSON = loadfile("Scripts\\JSON.lua")()
local socket = require("socket")

Quoll.UPDHost = "127.0.0.1"
Quoll.UDPPort = 41234
Quoll.UDPSendSocket = socket.udp()
Quoll.UDPSendSocket:settimeout(0)


function Quoll.sendEvent(message)
    Quoll.log("send event: " .. message.type)
    socket.try(Quoll.UDPSendSocket:sendto(JSON:encode(message) .. " \n", Quoll.UPDHost, Quoll.UDPPort))
end

-- ============================================================================
-- Player Management
-- ============================================================================
function Quoll.findOrCreatePlayer(id)
    if Quoll.clients[id] == nil then
        Quoll.clients[id] = {
            id = id,
            name = "",
            ucid = "",
            slot = "",
            side = ""
        }
    end
    return Quoll.clients[id]
end

function Quoll.removePlayer(id)
    Quoll.clients[id] = nil
end


function Quoll.onPlayerConnect(id)
    local name = net.get_player_info(id, 'name')
    local ucid = net.get_player_info(id, 'ucid')
    local player = Quoll.findOrCreatePlayer(id)
    player.name = name
    player.ucid = ucid
    Quoll.log(name .. " connected, ucid: " .. ucid)
end

function Quoll.onPlayerDisconnect(id)
    local player = Quoll.findOrCreatePlayer(id)
    Quoll.log(player.name .. " disconnected, ucid: " .. player.ucid)
end

function Quoll.onNetConnect(localPlayerID)
    local name = net.get_player_info(localPlayerID, "name")
    Quoll.log("Welcome " .. name)
end

-- ============================================================================
-- Utility Functions
-- ============================================================================
local function buildEvent(eventType, time)
    return {
        time = time,
        type = eventType
    }
end

local function getPlayerOrAI(playerID)
    return Quoll.clients[playerID] or { name = "AI", ucid = "" }
end

-- ============================================================================
-- Event Handlers
-- ============================================================================

-- ============================================================================
-- Event Handlers
-- ============================================================================
function Quoll.onGameEvent(eventName, arg1, arg2, arg3, arg4, arg5, arg6, arg7)
    local now = DCS.getRealTime()
    Quoll.log("onGameEvent " .. eventName)
    
    if eventName == "kill" then
        Quoll.onKill(now, arg1, arg2, arg3, arg4, arg5, arg6, arg7)
    elseif eventName == "takeoff" then
        Quoll.onTakeoff(now, arg1, arg2, arg3)
    elseif eventName == "landing" then
        Quoll.onLanding(now, arg1, arg2, arg3)
    elseif eventName == "crash" then
        Quoll.onCrash(now, arg1, arg2)
    elseif eventName == "eject" then
        Quoll.onEject(now, arg1, arg2)
    elseif eventName == "pilot_death" then
        Quoll.onPilotDeath(now, arg1, arg2)
    elseif eventName == "self_kill" then
        Quoll.onSelfKill(now, arg1)
    elseif eventName == "friendly_fire" then
        Quoll.onFriendlyFire(now, arg1, arg2, arg3)
    elseif eventName == "connect" then
        Quoll.onConnect(now, arg1, arg2)
    elseif eventName == "disconnect" then
        Quoll.onDisconnect(now, arg1, arg2, arg3, arg4)
    elseif eventName == "change_slot" then
        Quoll.onChangeSlot(now, arg1, arg2, arg3)
    else
        Quoll.log("unknown event type: " .. eventName)
    end
end

function Quoll.onConnect(time, playerID, name)
    Quoll.log("onConnect " .. playerID .. " - " .. name)
    local player = Quoll.findOrCreatePlayer(playerID)
    player.name = name
    player.ucid = net.get_player_info(playerID, 'ucid')
    
    local event = buildEvent("connect", time)
    event.playerUcid = player.ucid
    event.playerName = player.name
    Quoll.sendEvent(event)
end

function Quoll.onDisconnect(time, playerID, name, playerSide, reason_code)
    Quoll.log("onDisconnect " .. playerID .. " - " .. name)
    local player = Quoll.findOrCreatePlayer(playerID)
    player.name = name
    player.side = playerSide
    
    local event = buildEvent("disconnect", time)
    event.playerUcid = player.ucid
    event.playerName = player.name
    event.playerSide = playerSide
    event.reasonCode = reason_code
    Quoll.sendEvent(event)
end

function Quoll.onChangeSlot(time, playerID, slotID, prevSide)
    Quoll.log("onChangeSlot " .. playerID .. " - " .. slotID)
    local player = Quoll.findOrCreatePlayer(playerID)
    Quoll.log(player.name .. " to slot " .. slotID)
    player.slot = slotID
    
    local event = buildEvent("change_slot", time)
    event.playerUcid = player.ucid
    event.playerName = player.name
    event.slotId = slotID
    event.prevSide = prevSide
    Quoll.sendEvent(event)
end

function Quoll.onKill(time, killerPlayerID, killerUnitType, killerSide, victimPlayerID, victimUnitType, victimSide, weaponName)
    local killer = getPlayerOrAI(killerPlayerID)
    local victim = getPlayerOrAI(victimPlayerID)

    -- Discard if no players involved or no victim unit
    if killer.name == "AI" and victim.name == "AI" then
        Quoll.log("non-player kill discarded")
        return
    end
    if not victimUnitType or victimUnitType == "" then
        Quoll.log("kill without victim unit discarded")
        return
    end

    Quoll.log(killer.name .. "(" .. killerUnitType .. ") destroyed " .. victim.name .. " (" .. victimUnitType .. ") with " .. weaponName)

    local event = buildEvent("kill", time)
    event.killerUcid = killer.ucid
    event.killerName = killer.name
    event.killerUnitType = killerUnitType
    event.killerSide = killerSide
    event.victimName = victim.name
    event.victimUcid = victim.ucid
    event.victimUnitType = victimUnitType
    event.victimSide = victimSide
    event.weaponName = weaponName
    Quoll.sendEvent(event)
end

function Quoll.onTakeoff(time, playerID, unit_missionID, airdromeName)
    local player = Quoll.clients[playerID]
    if not player then
        Quoll.log("non-player takeoff discarded")
        return
    end

    local event = buildEvent("takeoff", time)
    event.playerUcid = player.ucid
    event.playerName = player.name
    event.airdromeName = airdromeName
    
    local unitType = DCS.getUnitType(unit_missionID)
    if unitType then
        event.unitType = unitType
    end
    
    Quoll.sendEvent(event)
end

function Quoll.onLanding(time, playerID, unit_missionID, airdromeName)
    local player = Quoll.clients[playerID]
    if not player then
        Quoll.log("non-player landing discarded")
        return
    end

    local event = buildEvent("landing", time)
    event.playerUcid = player.ucid
    event.playerName = player.name
    event.airdromeName = airdromeName
    
    local unitType = DCS.getUnitType(unit_missionID)
    if unitType then
        event.unitType = unitType
    end
    
    Quoll.sendEvent(event)
end

function Quoll.onCrash(time, playerID, unit_missionID)
    local player = Quoll.clients[playerID]
    if not player then
        Quoll.log("non-player crash discarded")
        return
    end

    local event = buildEvent("crash", time)
    event.playerUcid = player.ucid
    event.playerName = player.name
    
    local unitType = DCS.getUnitType(unit_missionID)
    if unitType then
        event.unitType = unitType
    end
    
    Quoll.sendEvent(event)
end

function Quoll.onEject(time, playerID, unit_missionID)
    local player = Quoll.clients[playerID]
    if not player then
        Quoll.log("non-player eject discarded")
        return
    end

    local event = buildEvent("eject", time)
    event.playerUcid = player.ucid
    event.playerName = player.name
    
    local unitType = DCS.getUnitType(unit_missionID)
    if unitType then
        event.unitType = unitType
    end
    
    Quoll.sendEvent(event)
end

function Quoll.onPilotDeath(time, playerID, unit_missionID)
    local player = Quoll.clients[playerID]
    if not player then
        Quoll.log("non-player pilot death discarded")
        return
    end

    local event = buildEvent("pilot_death", time)
    event.playerUcid = player.ucid
    event.playerName = player.name
    
    local unitType = DCS.getUnitType(unit_missionID)
    if unitType then
        event.unitType = unitType
    end
    
    Quoll.sendEvent(event)
end

function Quoll.onSelfKill(time, playerID)
    local player = Quoll.clients[playerID]
    if not player then
        Quoll.log("non-player self-kill discarded")
        return
    end

    local event = buildEvent("self_kill", time)
    event.playerUcid = player.ucid
    event.playerName = player.name
    Quoll.sendEvent(event)
end

function Quoll.onFriendlyFire(time, playerID, weaponName, victimPlayerID)
    local player = Quoll.clients[playerID]
    if not player then
        Quoll.log("non-player friendly-fire discarded")
        return
    end

    local victim = getPlayerOrAI(victimPlayerID)
    Quoll.log("Friendly fire! " .. player.name .. " destroyed " .. victim.name .. " with " .. weaponName)
    
    local event = buildEvent("friendly_fire", time)
    event.playerUcid = player.ucid
    event.playerName = player.name
    event.victimName = victim.name
    event.victimUcid = victim.ucid
    event.weaponName = weaponName
    Quoll.sendEvent(event)
end

function Quoll.onChatMessage(message, from)
    local name = net.get_player_info(from, "name")
    Quoll.log("Message: [" .. from .. "] " .. name .. " - " .. message)
end

-- ============================================================================
-- Initialize
-- ============================================================================
DCS.setUserCallbacks(Quoll)
net.log("Loaded - DCS-Quoll GameGUI")
Quoll.log("Quoll loaded v" .. Quoll.version)

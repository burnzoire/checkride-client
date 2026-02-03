-- ============================================================================
-- DCS-Checkride Game Event Tracker
-- ============================================================================
Checkride = {}
Checkride.version = "0.4.0"
Checkride.clients = {}

net.log("Loading - DCS-Checkride v" .. Checkride.version)

-- ============================================================================
-- Logging
-- ============================================================================
Checkride.logFile = io.open(lfs.writedir() .. [[Logs\DCS-Checkride-GameGUI.log]], "w")

function Checkride.log(str)
    if Checkride.logFile then
        Checkride.logFile:write(str .. "\n")
        Checkride.logFile:flush()
    end
end
-- ============================================================================
package.path  = package.path .. ";.\\LuaSocket\\?.lua;"
package.cpath = package.cpath .. ";.\\LuaSocket\\?.dll;"

local JSON = loadfile("Scripts\\JSON.lua")()
local socket = require("socket")

Checkride.UPDHost = "127.0.0.1"
Checkride.UDPPort = 41234
Checkride.UDPSendSocket = socket.udp()
Checkride.UDPSendSocket:settimeout(0)

Checkride.UDPChatHost = "0.0.0.0"
Checkride.UDPChatPort = 41235
Checkride.UDPReceiveSocket = socket.udp()
Checkride.UDPReceiveSocket:settimeout(0)
local listen_ok, listen_err = Checkride.UDPReceiveSocket:setsockname(Checkride.UDPChatHost, Checkride.UDPChatPort)
if not listen_ok then
    Checkride.log("Failed to bind UDP chat listener: " .. tostring(listen_err))
else
    Checkride.log("Listening for chat messages on " .. Checkride.UDPChatHost .. ":" .. Checkride.UDPChatPort)
end


function Checkride.sendEvent(message)
    Checkride.log("send event: " .. message.type)
    socket.try(Checkride.UDPSendSocket:sendto(JSON:encode(message) .. " \n", Checkride.UPDHost, Checkride.UDPPort))
end

function Checkride.sendChatToAll(message)
    if not message or message == "" then
        net.send_chat_to_all(message)
        return
    end

    if net and net.send_chat then
        net.send_chat(message)
        return
    end

    Checkride.log("Chat send API not available")
end

function Checkride.pollChatSocket()
    if not Checkride.UDPReceiveSocket then
        return
    end

    while true do
        local payload = Checkride.UDPReceiveSocket:receivefrom()
        if not payload then
            break
        end

        local trimmed = string.gsub(payload, "^%s*(.-)%s*$", "%1")
        local message = trimmed
        local ok, decoded = pcall(function()
            return JSON:decode(trimmed)
        end)

        if ok and type(decoded) == "table" then
            if decoded.message and decoded.message ~= "" then
                message = decoded.message
            elseif decoded.text and decoded.text ~= "" then
                message = decoded.text
            end
        end

        if message and message ~= "" then
            Checkride.log("Received chat message: " .. message)
            Checkride.sendChatToAll(message)
        end
    end
end

function Checkride.startChatPoller()
    if timer and timer.scheduleFunction and timer.getTime then
        timer.scheduleFunction(function(_, time)
            Checkride.pollChatSocket()
            return time + 0.2
        end, nil, timer.getTime() + 0.2)
        Checkride.log("Chat poller scheduled via timer")
        return
    end

    Checkride.log("Chat poller could not be scheduled (timer API unavailable)")
end

-- ============================================================================
-- Player Management
-- ============================================================================
function Checkride.findOrCreatePlayer(id)
    if Checkride.clients[id] == nil then
        Checkride.clients[id] = {
            id = id,
            name = "",
            ucid = "",
            slot = "",
            side = ""
        }
    end
    return Checkride.clients[id]
end

function Checkride.removePlayer(id)
    Checkride.clients[id] = nil
end


function Checkride.onPlayerConnect(id)
    local name = net.get_player_info(id, 'name')
    local ucid = net.get_player_info(id, 'ucid')
    local player = Checkride.findOrCreatePlayer(id)
    player.name = name
    player.ucid = ucid
    Checkride.log(name .. " connected, ucid: " .. ucid)
end

function Checkride.onPlayerDisconnect(id)
    local player = Checkride.findOrCreatePlayer(id)
    Checkride.log(player.name .. " disconnected, ucid: " .. player.ucid)
end

function Checkride.onNetConnect(localPlayerID)
    local name = net.get_player_info(localPlayerID, "name")
    Checkride.log("Welcome " .. name)
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
    return Checkride.clients[playerID] or { name = "AI", ucid = "" }
end

function Checkride.getUnitAttributes(unitType)
    if not unitType or unitType == "" then
        return {}
    end

    local attributes = DCS.getUnitTypeAttribute(unitType, "attribute")
    if not attributes then
        return {}
    end

    -- Convert to array of attribute names for easier JSON handling
    local attrList = {}
    for key, value in pairs(attributes) do
        if value then
            table.insert(attrList, key)
        end
    end

    return attrList
end

-- ============================================================================
-- Event Handlers
-- ============================================================================

-- ============================================================================
-- Event Handlers
-- ============================================================================
function Checkride.onGameEvent(eventName, arg1, arg2, arg3, arg4, arg5, arg6, arg7)
    local now = DCS.getRealTime()
    Checkride.log("onGameEvent " .. eventName)

    if eventName == "kill" then
        Checkride.onKill(now, arg1, arg2, arg3, arg4, arg5, arg6, arg7)
    elseif eventName == "takeoff" then
        Checkride.onTakeoff(now, arg1, arg2, arg3)
    elseif eventName == "landing" then
        Checkride.onLanding(now, arg1, arg2, arg3)
    elseif eventName == "crash" then
        Checkride.onCrash(now, arg1, arg2)
    elseif eventName == "eject" then
        Checkride.onEject(now, arg1, arg2)
    elseif eventName == "pilot_death" then
        Checkride.onPilotDeath(now, arg1, arg2)
    elseif eventName == "self_kill" then
        Checkride.onSelfKill(now, arg1)
    elseif eventName == "friendly_fire" then
        Checkride.onFriendlyFire(now, arg1, arg2, arg3)
    elseif eventName == "connect" then
        Checkride.onConnect(now, arg1, arg2)
    elseif eventName == "disconnect" then
        Checkride.onDisconnect(now, arg1, arg2, arg3, arg4)
    elseif eventName == "change_slot" then
        Checkride.onChangeSlot(now, arg1, arg2, arg3)
    else
        Checkride.log("unknown event type: " .. eventName)
    end
end

function Checkride.onConnect(time, playerID, name)
    Checkride.log("onConnect " .. playerID .. " - " .. name)
    local player = Checkride.findOrCreatePlayer(playerID)
    player.name = name
    player.ucid = net.get_player_info(playerID, 'ucid')

    local event = buildEvent("connect", time)
    event.playerUcid = player.ucid
    event.playerName = player.name
    Checkride.sendEvent(event)
end

function Checkride.onDisconnect(time, playerID, name, playerSide, reason_code)
    Checkride.log("onDisconnect " .. playerID .. " - " .. name)
    local player = Checkride.findOrCreatePlayer(playerID)
    player.name = name
    player.side = playerSide

    local event = buildEvent("disconnect", time)
    event.playerUcid = player.ucid
    event.playerName = player.name
    event.playerSide = playerSide
    event.reasonCode = reason_code
    Checkride.sendEvent(event)
end

local function isFlyableSlot(side, slotID)
    -- could be a better way, like checking unit category
    if not slotID or slotID == "" then
        return false
    end

    local slotString = tostring(slotID)
    if slotString == "0" then
        return false
    end

    local lowerSlot = string.lower(slotString)
    if string.find(lowerSlot, "spectator") or string.find(lowerSlot, "observer") then
        return false
    end

    local numericSide = tonumber(side)
    if numericSide == nil then
        return false
    end

    return numericSide ~= 0
end

function Checkride.onChangeSlot(time, playerID, slotID, prevSide)
    Checkride.log("onChangeSlot " .. playerID .. " - " .. tostring(slotID))
    local player = Checkride.findOrCreatePlayer(playerID)
    local side = net.get_player_info(playerID, 'side')
    Checkride.log(player.name .. " to slot " .. tostring(slotID))
    player.slot = slotID
    player.side = side

    local event = buildEvent("change_slot", time)
    event.playerUcid = player.ucid
    event.playerName = player.name
    event.slotId = slotID
    event.prevSide = prevSide
    event.flyable = isFlyableSlot(side, slotID)
    Checkride.sendEvent(event)
end

function Checkride.onKill(time, killerPlayerID, killerUnitType, killerSide, victimPlayerID, victimUnitType, victimSide, weaponName)
    local killer = getPlayerOrAI(killerPlayerID)
    local victim = getPlayerOrAI(victimPlayerID)

    -- Discard if no players involved or no victim unit
    if killer.name == "AI" and victim.name == "AI" then
        Checkride.log("non-player kill discarded")
        return
    end
    if not victimUnitType or victimUnitType == "" then
        Checkride.log("kill without victim unit discarded")
        return
    end

    Checkride.log(killer.name .. "(" .. killerUnitType .. ") destroyed " .. victim.name .. " (" .. victimUnitType .. ") with " .. weaponName)

    local event = buildEvent("kill", time)
    event.killerUcid = killer.ucid
    event.killerName = killer.name
    event.killerUnitType = killerUnitType
    event.killerUnitAttributes = Checkride.getUnitAttributes(killerUnitType)
    event.killerSide = killerSide
    event.victimName = victim.name
    event.victimUcid = victim.ucid
    event.victimUnitType = victimUnitType
    event.victimUnitAttributes = Checkride.getUnitAttributes(victimUnitType)
    event.victimSide = victimSide
    event.weaponName = weaponName
    Checkride.sendEvent(event)
end

function Checkride.onTakeoff(time, playerID, unit_missionID, airdromeName)
    local player = Checkride.clients[playerID]
    if not player then
        Checkride.log("non-player takeoff discarded")
        return
    end

    local event = buildEvent("takeoff", time)
    event.playerUcid = player.ucid
    event.playerName = player.name
    event.airdromeName = airdromeName

    local unitType = DCS.getUnitType(unit_missionID)
    if unitType then
        event.unitType = unitType
        event.unitAttributes = Checkride.getUnitAttributes(unitType)
    end

    Checkride.sendEvent(event)
end

function Checkride.onLanding(time, playerID, unit_missionID, airdromeName)
    local player = Checkride.clients[playerID]
    if not player then
        Checkride.log("non-player landing discarded")
        return
    end

    local event = buildEvent("landing", time)
    event.playerUcid = player.ucid
    event.playerName = player.name
    event.airdromeName = airdromeName

    local unitType = DCS.getUnitType(unit_missionID)
    if unitType then
        event.unitType = unitType
        event.unitAttributes = Checkride.getUnitAttributes(unitType)
    end

    Checkride.sendEvent(event)
end

function Checkride.onCrash(time, playerID, unit_missionID)
    local player = Checkride.clients[playerID]
    if not player then
        Checkride.log("non-player crash discarded")
        return
    end

    local event = buildEvent("crash", time)
    event.playerUcid = player.ucid
    event.playerName = player.name

    local unitType = DCS.getUnitType(unit_missionID)
    if unitType then
        event.unitType = unitType
        event.unitAttributes = Checkride.getUnitAttributes(unitType)
    end

    Checkride.sendEvent(event)
end

function Checkride.onEject(time, playerID, unit_missionID)
    local player = Checkride.clients[playerID]
    if not player then
        Checkride.log("non-player eject discarded")
        return
    end

    local event = buildEvent("eject", time)
    event.playerUcid = player.ucid
    event.playerName = player.name

    local unitType = DCS.getUnitType(unit_missionID)
    if unitType then
        event.unitType = unitType
        event.unitAttributes = Checkride.getUnitAttributes(unitType)
    end

    Checkride.sendEvent(event)
end

function Checkride.onPilotDeath(time, playerID, unit_missionID)
    local player = Checkride.clients[playerID]
    if not player then
        Checkride.log("non-player pilot death discarded")
        return
    end

    local event = buildEvent("pilot_death", time)
    event.playerUcid = player.ucid
    event.playerName = player.name

    local unitType = DCS.getUnitType(unit_missionID)
    if unitType then
        event.unitType = unitType
        event.unitAttributes = Checkride.getUnitAttributes(unitType)
    end

    Checkride.sendEvent(event)
end

function Checkride.onSelfKill(time, playerID)
    local player = Checkride.clients[playerID]
    if not player then
        Checkride.log("non-player self-kill discarded")
        return
    end

    local event = buildEvent("self_kill", time)
    event.playerUcid = player.ucid
    event.playerName = player.name
    Checkride.sendEvent(event)
end

function Checkride.onFriendlyFire(time, playerID, weaponName, victimPlayerID)
    local player = Checkride.clients[playerID]
    if not player then
        Checkride.log("non-player friendly-fire discarded")
        return
    end

    local victim = getPlayerOrAI(victimPlayerID)
    Checkride.log("Friendly fire! " .. player.name .. " destroyed " .. victim.name .. " with " .. weaponName)

    local event = buildEvent("friendly_fire", time)
    event.playerUcid = player.ucid
    event.playerName = player.name
    event.victimName = victim.name
    event.victimUcid = victim.ucid
    event.weaponName = weaponName
    Checkride.sendEvent(event)
end

function Checkride.onChatMessage(message, from)
    local name = net.get_player_info(from, "name")
    Checkride.log("Message: [" .. from .. "] " .. name .. " - " .. message)
end

Checkride.startChatPoller()
DCS.setUserCallbacks(Checkride)
net.log("Loaded - DCS-Checkride GameGUI")
Checkride.log("Checkride loaded v" .. Checkride.version)


Quoll = {}
Quoll.version = "2.0.1"
net.log("Loading - DCS-Quoll v"..Quoll.version)

Quoll.dbg = {}
Quoll.logFile = io.open(lfs.writedir()..[[Logs\DCS-Quoll-GameGUI.log]], "w")
function Quoll.log(str)
    if Quoll.logFile then
        Quoll.logFile:write(str.."\n")
        Quoll.logFile:flush()
    end
end

package.path  = package.path..";.\\LuaSocket\\?.lua;"
package.cpath = package.cpath..";.\\LuaSocket\\?.dll;"


local JSON = loadfile("Scripts\\JSON.lua")()
Quoll.JSON = JSON

local socket = require("socket")

Quoll.UPDHost = "127.0.0.1"
Quoll.UDPPort = 41234
Quoll.UDPSendSocket = socket.udp()
Quoll.UDPSendSocket:settimeout(0)
Quoll.clients = {}

Quoll.sendEvent = function(message)
    Quoll.log("send event")
    socket.try(Quoll.UDPSendSocket:sendto(Quoll.JSON:encode(message).." \n", Quoll.UPDHost, Quoll.UDPPort))
end

Quoll.removePlayer = function(id)
    Quoll.clients[id] = nil
end

Quoll.findOrCreatePlayer = function(id)
    local player = {
        id=id,
        name="",
        ucid="",
        slot="",
        side=""
    }
    if(Quoll.clients[id] == nil) then
        Quoll.clients[id] = player
    else
        player = Quoll.clients[id]
    end
    return player
end

Quoll.onPlayerConnect = function(id)
    local name = net.get_player_info(id, 'name')
    local ucid = net.get_player_info(id, 'ucid')
    local player = Quoll.findOrCreatePlayer(id)
    player.name = name
    player.ucid = ucid

    Quoll.log(name.." connected, ucid: ".. ucid)
end

Quoll.onPlayerDisconnect = function(id)
    local player = Quoll.findOrCreatePlayer(id)
    Quoll.log(player.name.." disconnected, ucid: ".. player.ucid)
end

Quoll.onNetConnect = function(localPlayerID)
    local name = net.get_player_info(localPlayerID, "name" )
    Quoll.log("Welcome "..name)
end

Quoll.onGameEvent = function(eventName,arg1,arg2,arg3,arg4,arg5,arg6,arg7)
    local now = DCS.getRealTime()
    Quoll.log("onGameEvent "..eventName)
    if eventName == "kill" then
        Quoll.onKill(now, arg1, arg2, arg3, arg4, arg5, arg6, arg7)
    elseif eventName == "takeoff" then
        Quoll.onTakeoff(now, arg1, arg2, arg3)
    elseif eventName == "landing" then
        Quoll.onLanding(now, arg1, arg2, arg3)
    elseif eventName == "crash" then
        Quoll.onCrash(now, arg1, arg2, arg3)
    elseif eventName == "eject" then
        Quoll.onEject(now, arg1, arg2, arg3)
    elseif eventName == "pilot_death" then
        Quoll.onPilotDeath(now, arg1, arg2, arg3)
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
        Quoll.log("unknown event type: "..eventName)
    end
end

Quoll.onConnect = function(time, playerID, name)
    Quoll.log("onConnect "..playerID.." - "..name)
    local player = Quoll.findOrCreatePlayer(playerID)
    player.name = name
    player.ucid = net.get_player_info(playerID, 'ucid')
    local event = {}
    event.time = time
    event.type = "connect"
    event.playerUcid = player.ucid
    event.playerName = player.name
    Quoll.sendEvent(event)
end

Quoll.onDisconnect = function(time, playerID, name, playerSide, reason_code)
    Quoll.log("onDisconnect "..playerID.." - "..name.." - "..playerSide.." - "..reason_code)
    local player = Quoll.findOrCreatePlayer(playerID)
    player.name = name
    player.side = playerSide
    local event = {}
    event.time = time
    event.type = "disconnect"
    event.playerUcid = player.ucid
    event.playerName = player.name
    event.side = playerSide
    event.reasonCode = reason_code
    Quoll.sendEvent(event)
end

Quoll.onChangeSlot = function(time, playerID, slotID, prevSide)
    Quoll.log("onChangeSlot "..playerID.." - "..slotID.." - "..prevSide)
    local player = Quoll.findOrCreatePlayer(playerID)
    Quoll.log(player.name.." to slot "..slotID)
    player.slot = slotID
    local event = {}
    event.time = time
    event.type = "change_slot"
    event.playerUcid = player.ucid
    event.playerName = player.name
    event.slotId = slotID
    event.prevSide = prevSide
    Quoll.sendEvent(event)
end

Quoll.onKill = function(time, killerPlayerID, killerUnitType, killerSide, victimPlayerID, victimUnitType, victimSide, weaponName)
    local killer = Quoll.clients[killerPlayerID]
    local victim = Quoll.clients[victimPlayerID]

    if killer == nil and victim == nil then
        Quoll.log("non-player kill discarded")
        return
    end

    if victimUnitType == nil or victimUnitType == "" then
        Quoll.log("kill without victim unit discarded")
        return
    end

    if killer == nil then
        killer = {}
        killer.name = "AI"
        killer.ucid = ""
    end

    if victim == nil then
        victim = {}
        victim.name = "AI"
        victim.ucid = ""
    end

    Quoll.log(killer.name.."("..killerUnitType..") destroyed "..victim.name.." ("..victimUnitType..") with "..weaponName)
    local event = {}
    event.time = time
    event.type = "kill"
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

Quoll.onTakeoff = function(time, playerID, unit_missionID, airdromeName)
    local player = Quoll.clients[playerID]
    local unitType = DCS.getUnitType(unit_missionID)
    local event = {}

    if player == nil then
        Quoll.log("non-player takeoff discarded")
        return
    end
    if unitType ~= nil then
        event.unitType = unitType
    end

    event.time = time
    event.type = "takeoff"
    event.playerUcid = player.ucid
    event.playerName = player.name
    event.airdromeName = airdromeName
    Quoll.sendEvent(event)
end

Quoll.onLanding = function(time, playerID, unit_missionID, airdromeName)
    local player = Quoll.clients[playerID]
    local unitType = DCS.getUnitType(unit_missionID)
    local event = {}

    if player == nil then
        Quoll.log("non-player landing discarded")
        return
    end
    if unitType ~= nil then
        event.unitType = unitType
    end

    event.time = time
    event.type = "landing"
    event.playerUcid = player.ucid
    event.playerName = player.name
    event.airdromeName = airdromeName
    Quoll.sendEvent(event)
end

Quoll.onCrash = function(time, playerID, unit_missionID)
    local player = Quoll.clients[playerID]
    local unitType = DCS.getUnitType(unit_missionID)
    local event = {}

    if player == nil then
        Quoll.log("non-player crash discarded")
        return
    end
    if unitType ~= nil then
        event.unitType = unitType
    end

    event.time = time
    event.type = "crash"
    event.playerUcid = player.ucid
    event.playerName = player.name
    Quoll.sendEvent(event)
end

Quoll.onEject = function(time, playerID, unit_missionID)
    local player = Quoll.clients[playerID]
    local unitType = DCS.getUnitType(unit_missionID)
    local event = {}

    if player == nil then
        Quoll.log("non-player eject discarded")
        return
    end
    if unitType ~= nil then
        event.unitType = unitType
    end

    event.time = time
    event.type = "eject"
    event.playerUcid = player.ucid
    event.playerName = player.name
    Quoll.sendEvent(event)
end

Quoll.onPilotDeath = function(time, playerID, unit_missionID)
    local player = Quoll.clients[playerID]
    local unitType = DCS.getUnitType(unit_missionID)
    local event = {}

    if player == nil then
        Quoll.log("non-player pilot death discarded")
        return
    end
    if unitType ~= nil then
        event.unitType = unitType
    end

    event.time = time
    event.type = "pilot_death"
    event.playerUcid = player.ucid
    event.playerName = player.name
    Quoll.sendEvent(event)
end

Quoll.onSelfKill = function(time, playerID)
    local player = Quoll.clients[playerID]
    local event = {}

    if player == nil then
        Quoll.log("non-player self-kill discarded")
        return
    end

    event.time = time
    event.type = "self_kill"
    event.playerUcid = player.ucid
    event.playerName = player.name
    Quoll.sendEvent(event)
end

Quoll.onFriendlyFire = function(time, playerID, weaponName, victimPlayerID)
    local player = Quoll.clients[playerID]

    if player == nil then
        Quoll.log("non-player friendly-fire discarded")
        return
    end

    local victim = Quoll.clients[victimPlayerID]

    if victim == nil then
        victim = {}
        victim.name = "AI"
        victim.ucid = ""
    end

    Quoll.log("Friendly fire! "..player.name.." destroyed "..victim.name.." with "..weaponName)
    local event = {}
    event.time = time
    event.type = "friendly_fire"
    event.playerUcid = player.ucid
    event.playerName = player.name
    event.victimName = victim.name
    event.victimUcid = victim.ucid
    event.weaponName = weaponName
    Quoll.sendEvent(event)
end

Quoll.onChatMessage = function(message, from)
    local name = net.get_player_info(from, "name" )
    Quoll.log("Message: ["..from.."] "..name.." - "..message)
end

DCS.setUserCallbacks(Quoll)

net.log("Loaded - DCS-Quoll GameGUI")
Quoll.log("Quoll loaded v"..Quoll.version)


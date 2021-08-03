net.log("Loading - DCS-Quoll GameGUI")

Quoll = {}
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

Quoll.sendEvent = function(message)
    Quoll.log("send event")
    socket.try(Quoll.UDPSendSocket:sendto(Quoll.JSON:encode(message).." \n", Quoll.UPDHost, Quoll.UDPPort))
end

Quoll.onNetConnect = function(localPlayerID)
    local name = net.get_player_info(localPlayerID, "name" )
    Quoll.log("Hello "..name)
end

Quoll.onGameEvent = function(eventName,arg1,arg2,arg3,arg4,arg5,arg6,arg7)
    local now = DCS.getRealTime()
    Quoll.log("onGameEvent: "..eventName..", "..arg1..", "..arg2..", "..arg3..", "..arg4..", "..arg5..", "..arg6..", "..arg7)
    -- if eventName == "kill" then
    --     Quoll.log("eventName is kill")
    Quoll.onKill(now, arg1, arg2, arg3, arg4, arg5, arg6, arg7)
    -- end
end

Quoll.onKill = function(time, killerPlayerID, killerUnitType, killerSide, victimPlayerID, victimUnitType, victimSide, weaponName)
    local killerName = net.get_player_info(killerPlayerID, "name" )
    local killerUcid = net.get_player_info(killerPlayerID, "ucid" )
    if killerName == nil then
        killerName = ""
    end
    if killerUcid == nil then
        Quoll.log("non-player kill discarded")
        return
    end
    local victimName = net.get_player_info(victimPlayerID, "name" )
    local victimUcid = net.get_player_info(victimPlayerID, "ucid" )

    if victimName == nil then
        victimName = ""
    end
    
    Quoll.log(killerName.."("..killerUnitType..") destroyed "..victimName.." ("..victimUnitType..") with "..weaponName)
    local event = {}
    event.time = time
    event.type = "kill"
    event.killerUcid = killerUcid
    event.killerName = killerName
    event.killerUnitType = killerUnitType
    event.killerSide = killerSide
    event.victimName = victimName
    event.victimUcid = victimUcid
    event.victimUnitType = victimUnitType
    event.victimSide = victimSide
    event.weaponName = weaponName
    Quoll.sendEvent(event)
end


Quoll.onChatMessage = function(message, from)
    local name = net.get_player_info(from, "name" )
    Quoll.log("Message: ["..from.."] "..name.." - "..message)
end

DCS.setUserCallbacks(Quoll)

net.log("Loaded - DCS-Quoll GameGUI")
Quoll.log("Quoll loaded")


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

Quoll.onNetConnect = function(localPlayerID)
    local name = net.get_player_info(localPlayerID, "name" )
    Quoll.log("onNetConnect "..name)
end

Quoll.onGameEvent = function(eventName,arg1,arg2,arg3,arg4,arg5,arg6,arg7)
    Quoll.log("on game event: "..eventName..", "..arg1..", "..arg2..", "..arg3..", "..arg4..", "..arg5..", "..arg6..", "..arg7)
    
    if eventName == "kill" then
        local killerPlayerID = arg1
        local killerName = net.get_player_info(killerPlayerID, "name" )
        local killerUnitType = arg2
        local killerSide = arg3
        local victimPlayerID = arg4
        local victimUnitType = arg5
        local victimSide = arg6
        local weaponName = arg7
        Quoll.log(killerName.."("..killerUnitType..") destroyed "..victimUnitType.." with "..weaponName)
    end
end

Quoll.onChatMessage = function(message, from)
    local name = net.get_player_info(from, "name" )
    Quoll.log("Message: ["..from.."] "..name.." - "..message)
end

DCS.setUserCallbacks(Quoll)

net.log("Loaded - DCS-Quoll GameGUI")
Quoll.log("Quoll loaded")


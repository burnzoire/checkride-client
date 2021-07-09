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

Quoll.onGameEvent = function(eventName,arg1,arg2,arg3,arg4)
    Quoll.log("on game event: "..eventName..", "..arg1..", "..arg2..", "..arg3..", "..arg4)
end

DCS.setUserCallbacks(Quoll)

net.log("Loaded - DCS-Quoll GameGUI")
Quoll.log("Quoll loaded")


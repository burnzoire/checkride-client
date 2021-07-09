net.log("Loading - DCS-Quoll GameGUI")

userCallbacks = {}

userCallbacks.onGameEvent = function(_event)
    net.log("on game event: ".._event)
end

DCS.setUserCallbacks(userCallbacks)

net.log("Loaded - DCS-Quoll GameGUI")


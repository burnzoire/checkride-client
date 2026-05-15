-- lua/helpers/hook_loader.lua
--
-- Loads DCS-Checkride-hook.lua with all dependencies stubbed.
-- The hook tries to dofile GameGUI via lfs; that pcall will fail gracefully
-- because lfs.writedir() in real LuaFileSystem doesn't exist.  We pre-define
-- a minimal Checkride global so the router can be tested independently.

local stubs = require("stubs.dcs_globals")
local M = {}

local SCRIPT = CHECKRIDE_REPO_ROOT .. "Scripts/Hooks/DCS-Checkride-hook.lua"

--- Load (or reload) the hook script.
--- @param overrides table|nil  Optional stubs overrides and a `checkride` field
---   to pre-define the Checkride global (defaults to a minimal stub).
function M.load(overrides)
    overrides = overrides or {}
    stubs.setup(overrides)

    -- The hook script begins with  require('log') which expects the DCS hook
    -- environment's built-in log module.  Preload a stub so the require succeeds.
    package.preload["log"] = function()
        return {
            write   = function() end,
            INFO    = 1,
            ERROR   = 3,
            WARNING = 2,
            WARN    = 2,
        }
    end

    -- The hook script defines CheckrideCallbackRouter as a local and passes it to
    -- DCS.setUserCallbacks at the end.  Override setUserCallbacks to expose it as
    -- a global so spec files can call its methods directly.
    _G.DCS = {
        getRealTime          = function() return 0 end,
        getUnitType          = function(id) return nil end,
        getUnitTypeAttribute = function(unitType, attr) return {} end,
        setUserCallbacks     = function(t) _G.CheckrideCallbackRouter = t end,
    }
    local cr = overrides.checkride or {
        clientVersion         = "__CHECKRIDE_CLIENT_VERSION__",
        missionScriptingEnabled = true,
        sendEncodedEvent      = function(msg) end,
        sendEvent             = function(msg) end,
        JSON                  = { decode = function(self, s) return {} end },
        onGameEvent           = nil,
        onPlayerConnect       = nil,
        onPlayerDisconnect    = nil,
        onSimulationFrame     = nil,
        onChatMessage         = nil,
        onNetConnect          = nil,
    }
    _G.Checkride = cr

    local ok, err = pcall(dofile, SCRIPT)
    package.preload["log"] = nil
    if not ok then
        error("Failed to load hook script: " .. tostring(err))
    end
end

--- Reset mutable hook state between tests.
function M.reset_state()
    if CheckrideCallbackRouter then
        CheckrideCallbackRouter._lastBridgePoll = 0
    end
end

return M

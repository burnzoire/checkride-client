-- lua/stubs/dcs_globals.lua
--
-- Factory for the DCS World API globals that the Lua scripts depend on.
-- Call M.setup(overrides) before dofile-ing any of the three source scripts.
-- Individual fields can be replaced by passing an overrides table.

local M = {}

-- ---------------------------------------------------------------------------
-- Mock object constructors (shared by multiple spec files)
-- ---------------------------------------------------------------------------

--- Create a mock DCS unit / airbase object.
--- @param props table  e.g. { playerName="Maverick", typeName="F/A-18C", ... }
function M.make_unit(props)
    props = props or {}
    return {
        getPlayerName = function(self) return props.playerName end,
        getTypeName   = function(self) return props.typeName end,
        getVelocity   = function(self) return props.velocity end,
        getPoint      = function(self) return props.point end,
        getFuel       = function(self) return props.fuel end,
        inAir         = function(self) return props.inAir end,
        isExist       = function(self) return props.exists ~= false end,
        getDesc       = function(self) return props.desc end,
        getAmmo       = function(self) return props.ammo end,
        getCoalition  = function(self) return props.coalition end,
        getID         = function(self) return props.id end,
        getLife       = function(self) return props.life end,
        getName       = function(self) return props.name end,
        getCategory   = function(self) return props.category end,
    }
end

--- Create a mock DCS weapon object.
function M.make_weapon(props)
    props = props or {}
    return {
        getTypeName  = function(self) return props.typeName end,
        getDesc      = function(self) return props.desc end,
        getID        = function(self) return props.id end,
        getPoint     = function(self) return props.point end,
        getVelocity  = function(self) return props.velocity end,
        isExist      = function(self) return props.exists ~= false end,
        getCategory  = function(self) return props.category end,
    }
end

-- ---------------------------------------------------------------------------
-- Global setup
-- ---------------------------------------------------------------------------

--- Install all DCS globals needed by the Lua scripts.
--- Any key in `overrides` replaces the corresponding default stub.
function M.setup(overrides)
    overrides = overrides or {}

    _G.log = overrides.log or {
        write   = function() end,
        INFO    = 1,
        ERROR   = 3,
        WARNING = 2,
        WARN    = 2,
    }

    _G.DCS = overrides.DCS or {
        getRealTime          = function() return 0 end,
        getUnitType          = function(id) return nil end,
        getUnitTypeAttribute = function(unitType, attr) return {} end,
        setUserCallbacks     = function(t) end,
    }

    _G.net = overrides.net or {
        log             = function() end,
        get_player_info = function(id, key) return nil end,
        get_player_list = function() return {} end,
        send_chat       = function() end,
        send_chat_to    = function() end,
        dostring_in     = function(state, code) return '', true end,
    }

    _G.coalition = overrides.coalition or {
        side       = { RED = 1, BLUE = 2, NEUTRAL = 0 },
        getPlayers = function(side) return {} end,
    }

    _G.Unit = overrides.Unit or {
        Category = {
            AIRPLANE    = 1,
            HELICOPTER  = 2,
            GROUND_UNIT = 3,
            SHIP        = 4,
        },
        RefuelingSystem = {
            BOOM_AND_RECEPTACLE = 0,
            PROBE_AND_DROGUE    = 1,
        },
    }

    _G.Airbase = overrides.Airbase or {
        Category = { AIRDROME = 0, HELIPAD = 1, SHIP = 2 },
    }

    _G.Object = overrides.Object or {
        Category = { UNIT = 1, WEAPON = 2, STATIC = 3 },
    }

    -- world is nil by default so ensureWorldHandler returns WAIT without errors.
    _G.world = overrides.world

    _G.timer = overrides.timer or {
        getTime          = function() return 0 end,
        getAbsTime       = function() return 43200 end, -- noon (12:00 = 43200 s)
        scheduleFunction = function(fn, arg, time) end,
    }

    _G.atmosphere = overrides.atmosphere
    _G.land       = overrides.land

    _G.env = overrides.env or {
        info    = function() end,
        mission = nil,
    }

    -- lfs: real LuaFileSystem + DCS-specific writedir().
    local ok_lfs, real_lfs = pcall(require, 'lfs')
    _G.lfs = overrides.lfs or (ok_lfs and real_lfs or {})
    if not _G.lfs.writedir then
        _G.lfs.writedir = function() return '/tmp/' end
    end

    _G.trigger = overrides.trigger or {
        action = { outText = function() end },
    }

    -- Mission-scripting globals injected at runtime by the hook.
    _G.CheckrideLookupUCID = overrides.CheckrideLookupUCID
    _G.CheckridePlayers    = overrides.CheckridePlayers or {}

    -- Reset guard globals so ensureWorldHandler re-evaluates cleanly each load.
    _G.__CHECKRIDE_WORLD_HANDLER_ACTIVE   = nil
    _G.__CHECKRIDE_WORLD_HANDLER_WORLD_ID = nil
end

return M

-- lua/spec/mission/world_handler_spec.lua
-- Tests CheckrideMission.ensureWorldHandler and getCapabilityStatus.

local loader = require("helpers.mission_loader")

describe("CheckrideMission.ensureWorldHandler", function()
    -- Reload before each test so WorldHandlerRegistered is fresh and
    -- _G.__CHECKRIDE_WORLD_HANDLER_ACTIVE is nil.
    before_each(function()
        loader.load()
        loader.reset_state()
        _G.__CHECKRIDE_WORLD_HANDLER_ACTIVE   = nil
        _G.__CHECKRIDE_WORLD_HANDLER_WORLD_ID = nil
    end)

    it("returns WAIT when world is nil", function()
        _G.world = nil
        local result = CheckrideMission.ensureWorldHandler()
        assert.is_truthy(result:find("__CHECKRIDE_WORLD_WAIT__"))
    end)

    it("returns missing_world reason when world absent", function()
        _G.world = nil
        local result = CheckrideMission.ensureWorldHandler()
        assert.is_truthy(result:find("missing_world"))
    end)

    it("returns WAIT when world.event table is missing", function()
        _G.world = { addEventHandler = function() end }
        -- no world.event
        local result = CheckrideMission.ensureWorldHandler()
        assert.is_truthy(result:find("__CHECKRIDE_WORLD_WAIT__"))
    end)

    it("returns WAIT when S_EVENT_LANDING_QUALITY_MARK is absent", function()
        _G.world = {
            event           = {},  -- no S_EVENT_LANDING_QUALITY_MARK
            addEventHandler = function() end,
        }
        local result = CheckrideMission.ensureWorldHandler()
        assert.is_truthy(result:find("__CHECKRIDE_WORLD_WAIT__"))
    end)

    it("registers handler and returns READY when all capabilities present", function()
        local registered = false
        _G.world = {
            event = {
                S_EVENT_LANDING_QUALITY_MARK = 28,
                S_EVENT_TAKEOFF              = 3,
                S_EVENT_LAND                 = 4,
                S_EVENT_KILL                 = 8,
                S_EVENT_SHOT                 = 1,
                S_EVENT_HIT                  = 2,
                S_EVENT_SHOOTING_START       = 22,
                S_EVENT_SHOOTING_END         = 23,
            },
            addEventHandler = function(handler)
                registered = true
            end,
        }
        local result = CheckrideMission.ensureWorldHandler()
        assert.is_truthy(result:find("__CHECKRIDE_WORLD_READY__"))
        assert.is_true(registered)
    end)

    it("returns READY immediately when already registered", function()
        local calls = 0
        _G.world = {
            event = {
                S_EVENT_LANDING_QUALITY_MARK = 28,
                S_EVENT_TAKEOFF = 3, S_EVENT_LAND = 4, S_EVENT_KILL = 8,
                S_EVENT_SHOT = 1, S_EVENT_HIT = 2,
                S_EVENT_SHOOTING_START = 22, S_EVENT_SHOOTING_END = 23,
            },
            addEventHandler = function() calls = calls + 1 end,
        }
        CheckrideMission.ensureWorldHandler()
        local result = CheckrideMission.ensureWorldHandler()
        assert.is_truthy(result:find("__CHECKRIDE_WORLD_READY__"))
        -- addEventHandler should have been called exactly once
        assert.are.equal(1, calls)
    end)
end)

describe("CheckrideMission.getCapabilityStatus", function()
    setup(function()
        loader.load()
    end)

    before_each(function()
        loader.reset_state()
    end)

    it("reports hasWorld = false when world is nil", function()
        _G.world = nil
        local caps = CheckrideMission.getCapabilityStatus()
        assert.is_false(caps.hasWorld)
    end)

    it("reports hasLandingQualityEvent = false when event absent", function()
        _G.world = { event = {}, addEventHandler = function() end }
        local caps = CheckrideMission.getCapabilityStatus()
        assert.is_false(caps.hasLandingQualityEvent)
    end)

    it("reports all true when fully equipped", function()
        _G.world = {
            event = { S_EVENT_LANDING_QUALITY_MARK = 28 },
            addEventHandler = function() end,
        }
        local caps = CheckrideMission.getCapabilityStatus()
        assert.is_true(caps.hasWorld)
        assert.is_true(caps.hasWorldEventTable)
        assert.is_true(caps.hasLandingQualityEvent)
        assert.is_true(caps.hasWorldAddHandler)
    end)
end)

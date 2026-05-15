-- lua/spec/mission/telemetry_spec.lua
-- Tests CheckrideMission.sampleTelemetryTick and isNight.

local loader = require("helpers.mission_loader")
local stubs  = require("stubs.dcs_globals")

describe("CheckrideMission.isNight", function()
    setup(function()
        loader.load()
    end)

    before_each(function()
        loader.reset_state()
    end)

    it("returns false at noon (timer.getAbsTime = 43200)", function()
        _G.timer = { getAbsTime = function() return 43200 end }
        assert.is_false(CheckrideMission.isNight(0))
    end)

    it("returns false at 18:00 (64800 s)", function()
        _G.timer = { getAbsTime = function() return 64800 end }
        assert.is_false(CheckrideMission.isNight(0))
    end)

    it("returns true at 21:00 (75600 s) which is after 20:00", function()
        _G.timer = { getAbsTime = function() return 75600 end }
        assert.is_true(CheckrideMission.isNight(0))
    end)

    it("returns true at midnight (0 s)", function()
        _G.timer = { getAbsTime = function() return 0 end }
        assert.is_true(CheckrideMission.isNight(0))
    end)

    it("returns true at 03:00 (10800 s)", function()
        _G.timer = { getAbsTime = function() return 10800 end }
        assert.is_true(CheckrideMission.isNight(0))
    end)

    it("returns false at 06:00 (21600 s) exactly", function()
        -- 21600 < 21600 is false, so should be false
        _G.timer = { getAbsTime = function() return 21600 end }
        assert.is_false(CheckrideMission.isNight(0))
    end)

    it("returns true at 20:00 exactly (72000 s)", function()
        -- 72000 >= 72000 is true
        _G.timer = { getAbsTime = function() return 72000 end }
        assert.is_true(CheckrideMission.isNight(0))
    end)

    it("falls back to eventTime when timer unavailable", function()
        _G.timer = {}  -- no getAbsTime
        _G.env   = { mission = nil }
        -- eventTime = 3600 (01:00) → night
        assert.is_true(CheckrideMission.isNight(3600))
    end)

    it("uses env.mission.start_time when timer unavailable", function()
        _G.timer = {}
        _G.env   = { mission = { start_time = 36000 } }  -- 10:00 offset
        -- start_time(36000) + eventTime(0) = 36000 → 10:00, not night
        assert.is_false(CheckrideMission.isNight(0))
    end)

    it("returns false when no time source available", function()
        _G.timer = {}
        _G.env   = { mission = nil }
        assert.is_false(CheckrideMission.isNight(nil))
    end)
end)

describe("CheckrideMission.sampleTelemetryTick", function()
    setup(function()
        loader.load()
    end)

    before_each(function()
        loader.reset_state()
        _G.timer = {
            getTime          = function() return 0 end,
            getAbsTime       = function() return 43200 end,
            scheduleFunction = function() end,
        }
    end)

    it("returns a future time when roster is empty", function()
        local nextTime = CheckrideMission.sampleTelemetryTick(nil, 10)
        assert.is_truthy(nextTime > 10)
    end)

    it("returns now + minTick when enabled and roster empty", function()
        local minTick = CheckrideMission.FlightSample.minTickSeconds
        local nextTime = CheckrideMission.sampleTelemetryTick(nil, 100)
        -- Should be at least 100 + minTick
        assert.is_truthy(nextTime >= 100 + minTick)
    end)

    it("returns minTick advance when sampler is disabled", function()
        CheckrideMission.FlightSample.enabled = false
        local nextTime = CheckrideMission.sampleTelemetryTick(nil, 50)
        local minTick  = CheckrideMission.FlightSample.minTickSeconds
        assert.are.equal(50 + minTick, nextTime)
    end)

    it("emits a flight_sample_enrichment for a roster entry", function()
        local captured = loader.capture_events()

        -- Provide a mock unit visible to coalition.getPlayers so refreshRoster builds
        -- a real roster rather than overwriting our manual injection.
        local unit = stubs.make_unit({
            playerName = "Maverick",
            exists     = true,
            velocity   = { x = 200, y = 0, z = 0 },
            point      = { x = 1000, y = 3000, z = 2000 },
            fuel       = 0.8,
            inAir      = true,
            typeName   = "F/A-18C",
            desc       = { category = Unit.Category.AIRPLANE },
        })
        _G.coalition = {
            side       = { BLUE = 2, RED = 1, NEUTRAL = 0 },
            getPlayers = function(side)
                if side == 2 then return { unit } end
                return {}
            end,
        }
        _G.CheckrideLookupUCID = function(name)
            if name == "Maverick" then return "ucid-mav" end
        end

        CheckrideMission.sampleTelemetryTick(nil, 10)

        local enrichments = {}
        for _, c in ipairs(captured) do
            if c.type == "flight_sample_enrichment" then
                table.insert(enrichments, c)
            end
        end
        assert.are.equal(1, #enrichments)
        assert.are.equal("Maverick", enrichments[1].playerName)
        assert.are.equal("ucid-mav", enrichments[1].playerUcid)
    end)

    it("does not emit when the unit no longer exists", function()
        local captured = loader.capture_events()
        local unit = stubs.make_unit({ playerName = "Ghost", exists = false })
        -- Prevent roster refresh so manually-set roster is used.
        CheckrideMission.FlightSample.lastRosterRefreshAt = 10
        CheckrideMission.FlightSample.roster = {
            { unit = unit, playerName = "Ghost", playerUcid = "ucid-ghost" }
        }
        CheckrideMission.FlightSample.nextPilotIndex = 1

        CheckrideMission.sampleTelemetryTick(nil, 10)

        assert.are.equal(0, #captured)
    end)

    it("advances nextPilotIndex and wraps around", function()
        -- Prevent roster refresh so our manual roster is preserved.
        CheckrideMission.FlightSample.lastRosterRefreshAt = 10
        CheckrideMission.FlightSample.roster = {
            { unit = stubs.make_unit({ playerName = "A", exists = false }), playerName = "A" },
            { unit = stubs.make_unit({ playerName = "B", exists = false }), playerName = "B" },
        }
        CheckrideMission.FlightSample.nextPilotIndex = 1

        CheckrideMission.sampleTelemetryTick(nil, 10)
        assert.are.equal(2, CheckrideMission.FlightSample.nextPilotIndex)

        -- Prevent refresh on second tick too.
        CheckrideMission.FlightSample.lastRosterRefreshAt = 11
        CheckrideMission.sampleTelemetryTick(nil, 11)
        assert.are.equal(1, CheckrideMission.FlightSample.nextPilotIndex)
    end)
end)

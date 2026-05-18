-- lua/spec/mission/telemetry_spec.lua
-- Tests CheckrideMission.startPilotSampler, per-pilot tick behaviour, and isNight.

local loader = require("helpers.mission_loader")
local stubs  = require("stubs.dcs_globals")

-- Helper: mock timer and capture the closure scheduled by startPilotSampler.
-- Returns a fire() function that invokes the tick with the given `now` value.
local function capture_pilot_tick(overrides)
    local scheduledFn
    _G.timer = {
        getTime          = function() return overrides and overrides.getTime or 0 end,
        getAbsTime       = function() return 43200 end,
        scheduleFunction = function(fn, _, _) scheduledFn = fn end,
    }
    return function(now) return scheduledFn and scheduledFn(nil, now) end
end

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

describe("CheckrideMission.startPilotSampler", function()
    setup(function()
        loader.load()
    end)

    before_each(function()
        loader.reset_state()
    end)

    it("emits a flight_sample_enrichment when the tick fires", function()
        local captured = loader.capture_events()
        local fire = capture_pilot_tick()

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
        _G.CheckrideLookupUCID = function(name)
            if name == "Maverick" then return "ucid-mav" end
        end

        CheckrideMission.startPilotSampler(unit, "Maverick", "ucid-mav")
        local nextTime = fire(10)

        assert.is_truthy(nextTime > 10)
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

    it("returns nil and stops when the unit no longer exists", function()
        local fire = capture_pilot_tick()
        local unit = stubs.make_unit({ playerName = "Ghost", exists = false })

        CheckrideMission.startPilotSampler(unit, "Ghost", "ucid-ghost")
        local nextTime = fire(10)

        assert.is_nil(nextTime)
    end)

    it("keeps ticking even when getPlayerName returns nil (airborne unit)", function()
        local captured = loader.capture_events()
        local fire = capture_pilot_tick()
        local unit = stubs.make_unit({ playerName = nil, exists = true })

        CheckrideMission.startPilotSampler(unit, "Maverick", "ucid-mav")
        local nextTime = fire(10)

        assert.is_truthy(nextTime and nextTime > 10)
        local enrichments = {}
        for _, c in ipairs(captured) do
            if c.type == "flight_sample_enrichment" then
                table.insert(enrichments, c)
            end
        end
        assert.are.equal(1, #enrichments)
    end)

    it("old tick returns nil after a new sampler is started for the same pilot key", function()
        local fire1 = capture_pilot_tick()
        local unit = stubs.make_unit({ playerName = "Maverick", exists = true })

        CheckrideMission.startPilotSampler(unit, "Maverick", "ucid-mav")
        -- Immediately start a second sampler (slot change), which bumps the generation.
        local fire2 = capture_pilot_tick()
        CheckrideMission.startPilotSampler(unit, "Maverick", "ucid-mav")

        -- fire1 belongs to gen=1, generation is now 2 → must self-terminate.
        local nextTime1 = fire1(10)
        assert.is_nil(nextTime1)

        -- fire2 belongs to gen=2 → still alive.
        local nextTime2 = fire2(10)
        assert.is_truthy(nextTime2 and nextTime2 > 10)
    end)

    it("keeps scheduling when emitFlightSampleForEntry raises an error", function()
        local fire = capture_pilot_tick()
        local unit = stubs.make_unit({ playerName = "Viper", exists = true })

        local original = CheckrideMission.emitFlightSampleForEntry
        CheckrideMission.emitFlightSampleForEntry = function() error("emit failure") end

        CheckrideMission.startPilotSampler(unit, "Viper", "ucid-viper")
        local nextTime = fire(10)
        CheckrideMission.emitFlightSampleForEntry = original

        assert.is_truthy(nextTime and nextTime > 10)
    end)

    it("does nothing when FlightSample is disabled", function()
        CheckrideMission.FlightSample.enabled = false
        local scheduled = false
        _G.timer = {
            getTime          = function() return 0 end,
            scheduleFunction = function() scheduled = true end,
        }
        local unit = stubs.make_unit({ playerName = "Ace", exists = true })

        CheckrideMission.startPilotSampler(unit, "Ace", "ucid-ace")

        assert.is_false(scheduled)
    end)

    it("increments PilotGenerations each time called for the same key", function()
        local fire = capture_pilot_tick()
        local unit = stubs.make_unit({ playerName = "Slider", exists = true })

        CheckrideMission.startPilotSampler(unit, "Slider", "ucid-slider")
        assert.are.equal(1, CheckrideMission.PilotGenerations["ucid-slider"])

        local fire2 = capture_pilot_tick()
        CheckrideMission.startPilotSampler(unit, "Slider", "ucid-slider")
        assert.are.equal(2, CheckrideMission.PilotGenerations["ucid-slider"])
        -- Suppress unused variable warning by referencing fire/fire2
        assert.is_truthy(fire ~= nil and fire2 ~= nil)
    end)

    it("TAKEOFF event starts a pilot sampler for the initiator", function()
        local scheduled = false
        _G.timer = {
            getTime          = function() return 0 end,
            scheduleFunction = function() scheduled = true end,
        }
        _G.Airbase = { Category = { SHIP = 2 } }

        local unit = stubs.make_unit({ playerName = "Goose", exists = true })
        local place = { getDesc = function() return { category = 0 } end, getName = function() return "Airbase" end }
        CheckrideMission.TakeoffEventId = 99
        CheckrideMission.EventHandler:onEvent({ id = 99, initiator = unit, place = place })

        assert.is_true(scheduled)
        assert.are.equal(1, CheckrideMission.PilotGenerations["Goose"])
    end)

    it("allows queue growth under sustained telemetry enqueue without consumer", function()
        for i = 1, 200 do
            CheckrideMission.sendEnrichmentEvent({
                type = "flight_sample_enrichment",
                playerName = "P" .. tostring(i),
                missionTime = i,
            })
        end

        assert.are.equal(200, #CheckrideMission.EventQueue)
        local first = CheckrideMission.PopEvent()
        local second = CheckrideMission.PopEvent()
        assert.is_truthy(string.find(first, '"playerName":"P1"', 1, true) ~= nil)
        assert.is_truthy(string.find(second, '"playerName":"P2"', 1, true) ~= nil)
    end)
end)

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

    it("keeps ticking when now is nil and timer.getTime fails", function()
        _G.timer = {
            getTime = function() error("clock unavailable") end,
            getAbsTime = function() return 43200 end,
            scheduleFunction = function() end,
        }

        local nextTime = CheckrideMission.sampleTelemetryTick(nil, nil)
        assert.is_truthy(type(nextTime) == "number")
        assert.is_truthy(nextTime > 0)
    end)

    it("reuses stale roster when mission time goes backward", function()
        local captured = loader.capture_events()

        local staleUnit = stubs.make_unit({ playerName = "Ghost", exists = false })
        CheckrideMission.FlightSample.lastRosterRefreshAt = 100
        CheckrideMission.FlightSample.roster = {
            { unit = staleUnit, playerName = "Ghost", playerUcid = "ucid-ghost" },
        }
        CheckrideMission.FlightSample.nextPilotIndex = 1

        local freshUnit = stubs.make_unit({
            playerName = "Fresh",
            exists = true,
            velocity = { x = 200, y = 0, z = 0 },
            point = { x = 1000, y = 2000, z = 3000 },
        })
        _G.coalition = {
            side = { BLUE = 2, RED = 1, NEUTRAL = 0 },
            getPlayers = function(side)
                if side == 2 then return { freshUnit } end
                return {}
            end,
        }

        CheckrideMission.sampleTelemetryTick(nil, 10)
        assert.are.equal(0, #captured)
        assert.are.equal(100, CheckrideMission.FlightSample.lastRosterRefreshAt)
    end)

    it("continues sampling from cached roster during rapid roster churn between refreshes", function()
        local captured = loader.capture_events()
        local unit = stubs.make_unit({
            playerName = "ChurnPilot",
            exists = true,
            velocity = { x = 210, y = 0, z = 0 },
            point = { x = 1, y = 3000, z = 2 },
        })

        _G.coalition = {
            side = { BLUE = 2, RED = 1, NEUTRAL = 0 },
            getPlayers = function(side)
                if side == 2 then return { unit } end
                return {}
            end,
        }

        CheckrideMission.sampleTelemetryTick(nil, 10)

        _G.coalition.getPlayers = function() return {} end
        CheckrideMission.sampleTelemetryTick(nil, 10.2)

        local enrichments = {}
        for _, c in ipairs(captured) do
            if c.type == "flight_sample_enrichment" then
                table.insert(enrichments, c)
            end
        end
        assert.are.equal(2, #enrichments)
    end)

    it("keeps previous roster when buildTelemetryRoster fails and still ticks", function()
        local captured = loader.capture_events()
        local unit = stubs.make_unit({
            playerName = "Fallback",
            exists = true,
            velocity = { x = 250, y = 0, z = 0 },
            point = { x = 1, y = 4000, z = 2 },
        })
        CheckrideMission.FlightSample.roster = {
            { unit = unit, playerName = "Fallback", playerUcid = "ucid-fallback" },
        }
        CheckrideMission.FlightSample.lastRosterRefreshAt = 0

        _G.coalition = {
            side = { BLUE = 2, RED = 1, NEUTRAL = 0 },
            getPlayers = function() error("coalition unavailable") end,
        }

        local nextTime = CheckrideMission.sampleTelemetryTick(nil, 10)
        assert.is_truthy(nextTime > 10)

        local enrichments = {}
        for _, c in ipairs(captured) do
            if c.type == "flight_sample_enrichment" then
                table.insert(enrichments, c)
            end
        end
        assert.are.equal(1, #enrichments)
    end)

    it("deduplicates same-name players when UCID is unavailable", function()
        local unitA = stubs.make_unit({ playerName = "DuplicateName", exists = true })
        local unitB = stubs.make_unit({ playerName = "DuplicateName", exists = true })
        _G.coalition = {
            side = { BLUE = 2, RED = 1, NEUTRAL = 0 },
            getPlayers = function(side)
                if side == 2 then return { unitA, unitB } end
                return {}
            end,
        }
        _G.CheckrideLookupUCID = nil

        CheckrideMission.sampleTelemetryTick(nil, 10)
        assert.are.equal(1, #(CheckrideMission.FlightSample.roster or {}))
    end)

    it("excludes units with blank or missing playerName from telemetry roster", function()
        local good = stubs.make_unit({ playerName = "GoodPilot", exists = true })
        local blank = stubs.make_unit({ playerName = "", exists = true })
        local missing = stubs.make_unit({ exists = true })

        _G.coalition = {
            side = { BLUE = 2, RED = 1, NEUTRAL = 0 },
            getPlayers = function(side)
                if side == 2 then return { good, blank, missing } end
                return {}
            end,
        }
        _G.CheckrideLookupUCID = nil

        CheckrideMission.sampleTelemetryTick(nil, 10)
        local roster = CheckrideMission.FlightSample.roster or {}
        assert.are.equal(1, #roster)
        assert.are.equal("GoodPilot", roster[1].playerName)
    end)

    it("caps roster size to maxTrackedPilots when more than 64 pilots are present", function()
        local many = {}
        for i = 1, 70 do
            many[i] = stubs.make_unit({ playerName = "Pilot-" .. tostring(i), exists = true })
        end
        _G.coalition = {
            side = { BLUE = 2, RED = 1, NEUTRAL = 0 },
            getPlayers = function(side)
                if side == 2 then return many end
                return {}
            end,
        }
        _G.CheckrideLookupUCID = function(name) return "ucid-" .. tostring(name) end

        CheckrideMission.sampleTelemetryTick(nil, 10)
        assert.are.equal(64, #(CheckrideMission.FlightSample.roster or {}))
    end)

    it("applies minTick floor for large rosters instead of shrinking below 0.25s", function()
        local roster = {}
        for i = 1, 64 do
            roster[i] = {
                unit = stubs.make_unit({ playerName = "P" .. tostring(i), exists = false }),
                playerName = "P" .. tostring(i),
                playerUcid = "ucid-" .. tostring(i),
            }
        end

        CheckrideMission.FlightSample.lastRosterRefreshAt = 10
        CheckrideMission.FlightSample.roster = roster
        CheckrideMission.FlightSample.nextPilotIndex = 1

        local nextTime = CheckrideMission.sampleTelemetryTick(nil, 10)
        assert.are.equal(10.25, nextTime)
    end)

    it("continues scheduling when emitFlightSampleForEntry raises an error", function()
        local originalEmit = CheckrideMission.emitFlightSampleForEntry
        CheckrideMission.emitFlightSampleForEntry = function()
            error("emit failure")
        end

        CheckrideMission.FlightSample.lastRosterRefreshAt = 10
        CheckrideMission.FlightSample.roster = {
            { unit = stubs.make_unit({ playerName = "A", exists = true }), playerName = "A", playerUcid = "ucid-a" },
        }
        CheckrideMission.FlightSample.nextPilotIndex = 1

        local nextTime = CheckrideMission.sampleTelemetryTick(nil, 10)
        assert.is_truthy(nextTime > 10)
        assert.are.equal(1, CheckrideMission.FlightSample.nextPilotIndex)

        CheckrideMission.emitFlightSampleForEntry = originalEmit
    end)

    it("does not halt future samples when one pilot entry is malformed", function()
        local captured = loader.capture_events()
        local badUnit = stubs.make_unit({
            playerName = "Bad",
            exists = true,
            velocity = { x = 100, y = 0, z = 0 },
            point = { x = 1, y = 1000, z = 2 },
            ammo = "not-a-table",
        })
        local goodUnit = stubs.make_unit({
            playerName = "Good",
            exists = true,
            velocity = { x = 120, y = 0, z = 0 },
            point = { x = 1, y = 1200, z = 2 },
        })

        CheckrideMission.FlightSample.lastRosterRefreshAt = 10
        CheckrideMission.FlightSample.roster = {
            { unit = badUnit, playerName = "Bad", playerUcid = "ucid-bad" },
            { unit = goodUnit, playerName = "Good", playerUcid = "ucid-good" },
        }
        CheckrideMission.FlightSample.nextPilotIndex = 1

        CheckrideMission.sampleTelemetryTick(nil, 10)
        CheckrideMission.FlightSample.lastRosterRefreshAt = 11
        CheckrideMission.sampleTelemetryTick(nil, 11)

        local enrichments = {}
        for _, c in ipairs(captured) do
            if c.type == "flight_sample_enrichment" then
                table.insert(enrichments, c)
            end
        end
        assert.are.equal(1, #enrichments)
        assert.are.equal("Good", enrichments[1].playerName)
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
    end)
end)

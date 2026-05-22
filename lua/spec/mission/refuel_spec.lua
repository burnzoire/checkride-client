-- lua/spec/mission/refuel_spec.lua
-- Tests CheckrideMission.trackRefuelFromFuelSample refuel-state-machine.

local loader = require("helpers.mission_loader")
local stubs  = require("stubs.dcs_globals")

-- Build a fresh roster entry with optional unit props.
local function make_entry(props)
    props = props or {}
    local unit = stubs.make_unit({
        exists  = true,
        fuel    = props.fuel,
        desc    = { tankerType = nil },
    })
    return {
        unit       = unit,
        playerName = props.playerName or "Maverick",
        playerUcid = props.playerUcid or "ucid-mav",
    }
end

describe("CheckrideMission.trackRefuelFromFuelSample", function()
    setup(function()
        loader.load()
    end)

    before_each(function()
        loader.reset_state()
        _G.timer = { getAbsTime = function() return 43200 end }
        _G.env   = { info = function() end }
    end)

    it("creates an initial session on first in-air sample", function()
        local entry = make_entry({ playerName = "Maverick", playerUcid = "ucid-mav" })
        CheckrideMission.trackRefuelFromFuelSample(entry, "F/A-18C", 0.5, true, 100)
        assert.is_not_nil(CheckrideMission.activeRefuelByPilot["ucid-mav"])
    end)

    it("does not emit an event on the first sample", function()
        local captured = loader.capture_events()
        local entry = make_entry()
        CheckrideMission.trackRefuelFromFuelSample(entry, "F/A-18C", 0.5, true, 100)
        assert.are.equal(0, #captured)
    end)

    it("emits refuel_enrichment 'started' when fuel increases above minStep", function()
        local captured = loader.capture_events()
        local entry = make_entry()
        local key = "ucid-mav"

        -- First sample establishes baseline.
        CheckrideMission.trackRefuelFromFuelSample(entry, "F/A-18C", 0.5, true, 100)
        -- Second sample: fuel increased by 0.01 (> minFuelGainStep 0.0005)
        CheckrideMission.trackRefuelFromFuelSample(entry, "F/A-18C", 0.51, true, 104)

        local started = nil
        for _, c in ipairs(captured) do
            if c.type == "refuel_enrichment" and c.refuelStatus == "started" then
                started = c
            end
        end
        assert.is_not_nil(started)
        assert.are.equal("Maverick", started.playerName)
    end)

    it("accumulates fuel gain over multiple samples", function()
        local entry = make_entry()
        local key = "ucid-mav"

        CheckrideMission.trackRefuelFromFuelSample(entry, "F/A-18C", 0.5, true, 100)
        CheckrideMission.trackRefuelFromFuelSample(entry, "F/A-18C", 0.52, true, 104)
        CheckrideMission.trackRefuelFromFuelSample(entry, "F/A-18C", 0.54, true, 108)

        local session = CheckrideMission.activeRefuelByPilot[key]
        assert.is_not_nil(session)
        assert.is_truthy(session.accumulatedFuelGain > 0)
    end)

    it("emits aar 'completed' event when fuel stops increasing", function()
        local captured = loader.capture_events()
        local entry = make_entry()
        local key = "ucid-mav"

        -- Build up a refuel session.
        CheckrideMission.trackRefuelFromFuelSample(entry, "F/A-18C", 0.5,  true, 100)
        CheckrideMission.trackRefuelFromFuelSample(entry, "F/A-18C", 0.58, true, 104)
        CheckrideMission.trackRefuelFromFuelSample(entry, "F/A-18C", 0.66, true, 108)
        -- Fuel now flat → finalize.
        CheckrideMission.trackRefuelFromFuelSample(entry, "F/A-18C", 0.66, true, 112)

        local aar_ev = nil
        for _, c in ipairs(captured) do
            if c.type == "aar" then aar_ev = c end
        end
        assert.is_not_nil(aar_ev)
        assert.are.equal("completed", aar_ev.refuelStatus)
        assert.are.equal("Maverick",  aar_ev.playerName)
    end)

    it("finalizes session when pilot lands (inAir = false)", function()
        local captured = loader.capture_events()
        local entry = make_entry()
        local key = "ucid-mav"

        CheckrideMission.trackRefuelFromFuelSample(entry, "F/A-18C", 0.5,  true,  100)
        CheckrideMission.trackRefuelFromFuelSample(entry, "F/A-18C", 0.58, true,  104)
        CheckrideMission.trackRefuelFromFuelSample(entry, "F/A-18C", 0.66, true,  108)
        -- Pilot lands.
        CheckrideMission.trackRefuelFromFuelSample(entry, "F/A-18C", 0.66, false, 200)

        assert.is_nil(CheckrideMission.activeRefuelByPilot[key])

        local aar_ev = nil
        for _, c in ipairs(captured) do
            if c.type == "aar" then aar_ev = c end
        end
        assert.is_not_nil(aar_ev)
    end)

    it("does not emit aar on a single-sample fuel spike (glitch suppression)", function()
        local captured = loader.capture_events()
        local entry = make_entry()

        CheckrideMission.trackRefuelFromFuelSample(entry, "F/A-18C", 0.5,  true, 100)
        -- One sample with fuel gain (glitch).
        CheckrideMission.trackRefuelFromFuelSample(entry, "F/A-18C", 0.52, true, 104)
        -- Fuel flat → would finalize with only 1 gain sample.
        CheckrideMission.trackRefuelFromFuelSample(entry, "F/A-18C", 0.52, true, 108)

        local aar_ev = nil
        for _, c in ipairs(captured) do
            if c.type == "aar" then aar_ev = c end
        end
        assert.is_nil(aar_ev)
    end)

    it("does not emit aar when accumulated gain is below minAccumulatedGain threshold", function()
        local captured = loader.capture_events()
        local entry = make_entry()

        CheckrideMission.trackRefuelFromFuelSample(entry, "F/A-18C", 0.50, true, 100)
        -- Two gain samples totalling 0.14 < 0.15 threshold.
        CheckrideMission.trackRefuelFromFuelSample(entry, "F/A-18C", 0.57, true, 104)
        CheckrideMission.trackRefuelFromFuelSample(entry, "F/A-18C", 0.64, true, 108)
        -- Flat → finalize.
        CheckrideMission.trackRefuelFromFuelSample(entry, "F/A-18C", 0.64, true, 112)

        local aar_ev = nil
        for _, c in ipairs(captured) do
            if c.type == "aar" then aar_ev = c end
        end
        assert.is_nil(aar_ev)
    end)

    it("ignores nil entry", function()
        -- Should not throw.
        assert.has_no.errors(function()
            CheckrideMission.trackRefuelFromFuelSample(nil, "F/A-18C", 0.5, true, 100)
        end)
    end)

    it("ignores entry without playerName", function()
        assert.has_no.errors(function()
            local entry = { unit = stubs.make_unit({}), playerName = nil, playerUcid = nil }
            CheckrideMission.trackRefuelFromFuelSample(entry, "F/A-18C", 0.5, true, 100)
        end)
    end)
end)

-- lua/spec/mission/handlers_spec.lua
-- Tests mission-level event handlers: onLandingQualityMark, onTakeoff, onLand, onKill.

local loader = require("helpers.mission_loader")
local stubs  = require("stubs.dcs_globals")

-- ---------------------------------------------------------------------------
-- Helper to build a typical player unit mock.
-- ---------------------------------------------------------------------------
local function player_unit(name, ucid, typeName)
    return stubs.make_unit({
        playerName = name,
        typeName   = typeName or "F/A-18C",
        coalition  = 2,
        id         = 1,
        desc       = { category = Unit.Category and Unit.Category.AIRPLANE or 1, attributes = {} },
        fuel       = 0.75,
    })
end

-- ---------------------------------------------------------------------------
describe("CheckrideMission.onLandingQualityMark", function()
    setup(function()
        loader.load()
    end)

    before_each(function()
        loader.reset_state()
        _G.CheckrideLookupUCID = function(name)
            if name == "Maverick" then return "ucid-mav" end
        end
        _G.timer = { getAbsTime = function() return 43200 end }
    end)

    it("emits a grading event for a valid pass", function()
        local captured = loader.capture_events()
        local initiator = player_unit("Maverick", "ucid-mav")
        initiator.getFuel = function() return 0.6 end

        local place = stubs.make_unit({ name = "CVN-71" })

        CheckrideMission.onLandingQualityMark({
            initiator = initiator,
            comment   = "LSO: GRADE:_OK_ : WIRE# 3",
            time      = 1000,
            place     = place,
        })

        assert.are.equal(1, #captured)
        local msg = captured[1]
        assert.are.equal("grading",   msg.type)
        assert.are.equal("_OK_",      msg.lsoGrade)
        assert.are.equal(3,           msg.wire)
        assert.are.equal("Maverick",  msg.playerName)
        assert.are.equal("ucid-mav",  msg.playerUcid)
    end)

    it("discards event when initiator is nil", function()
        local captured = loader.capture_events()
        CheckrideMission.onLandingQualityMark({ initiator = nil, comment = "GRADE:OK", time = 0 })
        assert.are.equal(0, #captured)
    end)

    it("discards event when initiator is an AI unit", function()
        local captured = loader.capture_events()
        local ai_unit = stubs.make_unit({ playerName = nil })
        CheckrideMission.onLandingQualityMark({
            initiator = ai_unit,
            comment   = "GRADE:OK",
            time      = 0,
        })
        assert.are.equal(0, #captured)
    end)

    it("discards event when comment has no parseable grade", function()
        local captured = loader.capture_events()
        local initiator = player_unit("Maverick")
        CheckrideMission.onLandingQualityMark({
            initiator = initiator,
            comment   = "no grade at all",
            time      = 0,
        })
        assert.are.equal(0, #captured)
    end)

    it("marks pass as night when time-of-day is after 20:00", function()
        _G.timer = { getAbsTime = function() return 75600 end }  -- 21:00
        local captured = loader.capture_events()
        local initiator = player_unit("Maverick")
        initiator.getFuel = function() return 0.5 end
        CheckrideMission.onLandingQualityMark({
            initiator = initiator,
            comment   = "GRADE:OK",
            time      = 0,
        })
        assert.are.equal(1, #captured)
        assert.is_true(captured[1].night)
    end)
end)

-- ---------------------------------------------------------------------------
describe("CheckrideMission.onTakeoff", function()
    setup(function()
        loader.load()
    end)

    before_each(function()
        loader.reset_state()
        _G.CheckrideLookupUCID = function(name)
            if name == "Maverick" then return "ucid-mav" end
        end
    end)

    it("discards event for AI initiator", function()
        local captured = loader.capture_events()
        local ai = stubs.make_unit({ playerName = nil })
        local place = stubs.make_unit({ name = "Tbilisi" })
        CheckrideMission.onTakeoff({ initiator = ai, place = place, time = 0 })
        assert.are.equal(0, #captured)
    end)

    it("discards event when no place", function()
        local captured = loader.capture_events()
        local initiator = player_unit("Maverick")
        CheckrideMission.onTakeoff({ initiator = initiator, place = nil, time = 0 })
        assert.are.equal(0, #captured)
    end)

    it("emits takeoff_enrichment with launchedFromCarrier = false for an airbase", function()
        local captured = loader.capture_events()
        local initiator = player_unit("Maverick")
        local airbase = stubs.make_unit({
            name = "Kutaisi",
            desc = { category = Airbase.Category.AIRDROME },
        })
        CheckrideMission.onTakeoff({ initiator = initiator, place = airbase, time = 100 })

        assert.are.equal(1, #captured)
        assert.are.equal("takeoff_enrichment", captured[1].type)
        assert.is_false(captured[1].launchedFromCarrier)
    end)

    it("emits takeoff_enrichment with launchedFromCarrier = true for a carrier", function()
        local captured = loader.capture_events()
        local initiator = player_unit("Maverick")
        local carrier = stubs.make_unit({
            name = "CVN-71",
            desc = { category = Airbase.Category.SHIP },
        })
        CheckrideMission.onTakeoff({ initiator = initiator, place = carrier, time = 100 })

        assert.are.equal(1, #captured)
        assert.are.equal("takeoff_enrichment", captured[1].type)
        assert.is_true(captured[1].launchedFromCarrier)
    end)

    it("stores carrier reference in pilotCarrierByUcid on carrier takeoff", function()
        local initiator = player_unit("Maverick")
        local carrier = stubs.make_unit({
            name = "CVN-71",
            desc = { category = Airbase.Category.SHIP },
        })
        CheckrideMission.onTakeoff({ initiator = initiator, place = carrier, time = 100 })
        -- ucid-mav via CheckrideLookupUCID
        assert.is_not_nil(CheckrideMission.pilotCarrierByUcid["ucid-mav"])
    end)

    it("clears carrier reference on airbase takeoff", function()
        local initiator = player_unit("Maverick")
        CheckrideMission.pilotCarrierByUcid["ucid-mav"] = stubs.make_unit({})
        local airbase = stubs.make_unit({ name = "Kutaisi", desc = { category = Airbase.Category.AIRDROME } })
        CheckrideMission.onTakeoff({ initiator = initiator, place = airbase, time = 100 })
        assert.is_nil(CheckrideMission.pilotCarrierByUcid["ucid-mav"])
    end)
end)

-- ---------------------------------------------------------------------------
describe("CheckrideMission.onLand", function()
    setup(function()
        loader.load()
    end)

    before_each(function()
        loader.reset_state()
        _G.CheckrideLookupUCID = function(name)
            if name == "Maverick" then return "ucid-mav" end
        end
    end)

    it("discards event for AI initiator", function()
        local captured = loader.capture_events()
        local ai = stubs.make_unit({ playerName = nil })
        CheckrideMission.onLand({ initiator = ai, place = nil, time = 0 })
        assert.are.equal(0, #captured)
    end)

    it("emits landing_enrichment with landedAtAirbase = false for open-field landing", function()
        local captured = loader.capture_events()
        local initiator = player_unit("Maverick")
        initiator.getFuel = function() return 0.3 end
        CheckrideMission.onLand({ initiator = initiator, place = nil, time = 200 })

        assert.are.equal(1, #captured)
        local msg = captured[1]
        assert.are.equal("landing_enrichment", msg.type)
        assert.is_false(msg.landedAtAirbase)
    end)

    it("emits landing_enrichment with landedAtFriendlyBase = true", function()
        local captured = loader.capture_events()
        local initiator = player_unit("Maverick")
        initiator.getCoalition = function() return 2 end
        initiator.getFuel      = function() return 0.4 end
        local base = stubs.make_unit({
            name      = "Batumi",
            coalition = 2,  -- same as pilot
        })
        CheckrideMission.onLand({ initiator = initiator, place = base, time = 300 })

        assert.are.equal(1, #captured)
        assert.is_true(captured[1].landedAtFriendlyBase)
        assert.is_true(captured[1].landedAtAirbase)
    end)
end)

-- ---------------------------------------------------------------------------
describe("CheckrideMission.onKill", function()
    setup(function()
        loader.load()
    end)

    before_each(function()
        loader.reset_state()
        _G.CheckrideLookupUCID = function(name)
            if name == "Maverick" then return "ucid-mav" end
            if name == "Viper"    then return "ucid-viper" end
        end
        _G.coalition = {
            side       = { RED = 1, BLUE = 2, NEUTRAL = 0 },
            getPlayers = function() return {} end,
        }
        _G.Unit = {
            Category = { AIRPLANE = 1, HELICOPTER = 2, GROUND_UNIT = 3, SHIP = 4 },
            RefuelingSystem = { BOOM_AND_RECEPTACLE = 0, PROBE_AND_DROGUE = 1 },
        }
    end)

    it("discards when initiator is nil", function()
        local captured = loader.capture_events()
        local target = stubs.make_unit({ playerName = nil, id = 10, desc = { category = 1 } })
        CheckrideMission.onKill({ initiator = nil, target = target, time = 0 })
        assert.are.equal(0, #captured)
    end)

    it("discards when target is nil", function()
        local captured = loader.capture_events()
        local initiator = player_unit("Maverick")
        CheckrideMission.onKill({ initiator = initiator, target = nil, time = 0 })
        assert.are.equal(0, #captured)
    end)

    it("discards kill_enrichment for AI initiator", function()
        local captured = loader.capture_events()
        local ai = stubs.make_unit({ playerName = nil, coalition = 1 })
        local target = stubs.make_unit({
            playerName = nil,
            coalition  = 2,
            id         = 99,
            desc       = { category = Unit.Category.AIRPLANE, attributes = {} },
        })
        -- For friendly_killed_enrichment check we also need isEnemy=false
        ai.getCoalition = function() return 1 end
        target.getCoalition = function() return 1 end  -- same coalition → friendly

        CheckrideMission.onKill({ initiator = ai, target = target, weapon = nil, time = 0 })

        -- No kill_enrichment since AI initiated
        for _, c in ipairs(captured) do
            assert.are_not.equal("kill_enrichment", c.type)
        end
    end)

    it("emits kill_enrichment for player kill of air unit", function()
        local captured = loader.capture_events()
        local initiator = player_unit("Maverick")
        initiator.getCoalition = function() return 2 end

        local target = stubs.make_unit({
            playerName = nil,
            coalition  = 1,
            id         = 42,
            desc       = { category = Unit.Category.AIRPLANE, attributes = {} },
        })

        CheckrideMission.onKill({ initiator = initiator, target = target, weapon = nil, time = 500 })

        local kill_ev = nil
        for _, c in ipairs(captured) do
            if c.type == "kill_enrichment" then kill_ev = c end
        end
        assert.is_not_nil(kill_ev)
        assert.are.equal("Maverick",  kill_ev.playerName)
        assert.are.equal("ucid-mav",  kill_ev.playerUcid)
        assert.are.equal("air",       kill_ev.victimUnitCategory)
    end)

    it("emits kill_enrichment with victimUnitCategory = ground for a ground unit", function()
        local captured = loader.capture_events()
        local initiator = player_unit("Maverick")
        initiator.getCoalition = function() return 2 end

        local target = stubs.make_unit({
            coalition = 1,
            id        = 55,
            desc      = { category = Unit.Category.GROUND_UNIT, attributes = {} },
        })

        CheckrideMission.onKill({ initiator = initiator, target = target, weapon = nil, time = 0 })

        local kill_ev = nil
        for _, c in ipairs(captured) do
            if c.type == "kill_enrichment" then kill_ev = c end
        end
        assert.is_not_nil(kill_ev)
        assert.are.equal("ground", kill_ev.victimUnitCategory)
    end)

    it("uses pendingKillsByObjectId data when available", function()
        local captured = loader.capture_events()
        local initiator = player_unit("Maverick")
        initiator.getCoalition = function() return 2 end

        local target = stubs.make_unit({
            coalition = 1,
            id        = 77,
            desc      = { category = Unit.Category.AIRPLANE, attributes = {} },
        })

        -- Pre-populate pending kill data
        CheckrideMission.pendingKillsByObjectId[77] = {
            killedAtMs     = 450,
            victimRoles    = { "SAM launcher" },
            weaponGuidance = "RADAR_ACTIVE",
            weaponClass    = "AAM",
            victimPositionX = 100,
            victimPositionY = 200,
            night          = false,
            victimTypeName = "MiG-29",
        }

        CheckrideMission.onKill({ initiator = initiator, target = target, weapon = nil, time = 500 })

        local kill_ev = nil
        for _, c in ipairs(captured) do
            if c.type == "kill_enrichment" then kill_ev = c end
        end
        assert.is_not_nil(kill_ev)
        assert.are.equal("RADAR_ACTIVE", kill_ev.weaponGuidance)
        assert.are.equal("AAM",          kill_ev.weaponClass)
        -- Pending data should be consumed
        assert.is_nil(CheckrideMission.pendingKillsByObjectId[77])
    end)

    it("fills missing pending weapon metadata from latest matching active shot", function()
        local captured = loader.capture_events()
        local initiator = player_unit("Maverick")
        initiator.getCoalition = function() return 2 end

        local target = stubs.make_unit({
            coalition = 1,
            id        = 88,
            desc      = { category = Unit.Category.AIRPLANE, attributes = {} },
        })

        -- Pending kill exists but misses class/guidance (common lethal-hit edge case).
        CheckrideMission.pendingKillsByObjectId[88] = {
            killedAtMs      = 450,
            victimRoles     = { "Fighters" },
            victimPositionX = 100,
            victimPositionY = 200,
            night           = false,
            victimTypeName  = "MiG-29S",
        }

        CheckrideMission.activeWeaponShots["older"] = {
            weaponKey      = "older",
            weaponClass    = "AAM",
            weaponGuidance = "IR",
            targetObjectId = 88,
            playerUcid     = "ucid-mav",
            playerName     = "Maverick",
            inFlight       = true,
            firedAt        = 100,
            lastDataAt     = 101,
        }

        CheckrideMission.activeWeaponShots["newer"] = {
            weaponKey      = "newer",
            weaponClass    = "AAM",
            weaponGuidance = "RADAR_SEMI_ACTIVE",
            targetObjectId = 88,
            playerUcid     = "ucid-mav",
            playerName     = "Maverick",
            inFlight       = true,
            firedAt        = 200,
            lastDataAt     = 201,
        }

        CheckrideMission.onKill({ initiator = initiator, target = target, weapon = nil, time = 500 })

        local kill_ev = nil
        for _, c in ipairs(captured) do
            if c.type == "kill_enrichment" then kill_ev = c end
        end

        assert.is_not_nil(kill_ev)
        assert.are.equal("RADAR_SEMI_ACTIVE", kill_ev.weaponGuidance)
        assert.are.equal("AAM", kill_ev.weaponClass)
        -- pending exists → killing shot was already consumed by onHit; the fallback
        -- candidate is a different in-flight missile and must NOT be deleted.
        assert.is_not_nil(CheckrideMission.activeWeaponShots["newer"])
        assert.is_not_nil(CheckrideMission.activeWeaponShots["older"])
    end)

    it("consumes fallback shot only when pending is nil (proximity-fuse case)", function()
        local captured = loader.capture_events()
        local initiator = player_unit("Maverick")
        initiator.getCoalition = function() return 2 end

        local target = stubs.make_unit({
            coalition = 1,
            id        = 91,
            desc      = { category = Unit.Category.AIRPLANE, attributes = {} },
        })

        -- No pending entry: onHit never fired (proximity fuse detonation).
        -- The shot is still live in activeWeaponShots and must be consumed.
        CheckrideMission.activeWeaponShots["phoenix"] = {
            weaponKey      = "phoenix",
            weaponClass    = "AAM",
            weaponGuidance = "RADAR_ACTIVE",
            targetObjectId = 91,
            playerUcid     = "ucid-mav",
            playerName     = "Maverick",
            inFlight       = true,
            firedAt        = 100,
            lastDataAt     = 101,
        }

        CheckrideMission.onKill({ initiator = initiator, target = target, weapon = nil, time = 400 })

        local kill_ev = nil
        for _, c in ipairs(captured) do
            if c.type == "kill_enrichment" then kill_ev = c end
        end

        assert.is_not_nil(kill_ev)
        assert.are.equal("RADAR_ACTIVE", kill_ev.weaponGuidance)
        assert.are.equal("AAM", kill_ev.weaponClass)
        -- pending was nil → this was the killing shot; it should be consumed.
        assert.is_nil(CheckrideMission.activeWeaponShots["phoenix"])
    end)

    it("attributes a gun kill from the shooter's active burst when the weapon is empty", function()
        local captured = loader.capture_events()
        local initiator = player_unit("Maverick")
        initiator.getCoalition = function() return 2 end
        local target = stubs.make_unit({
            coalition = 1, id = 71,
            desc = { category = Unit.Category.AIRPLANE, attributes = {} },
        })

        -- Shooter opens up with the gun, then kills with no weapon object.
        local gun = stubs.make_weapon({ typeName = "weapons.guns.M_61" })
        CheckrideMission.onShootingStart({ initiator = initiator, weapon = gun, time = 498 })
        CheckrideMission.onKill({ initiator = initiator, target = target, weapon = nil, time = 500 })

        local kill_ev = nil
        for _, c in ipairs(captured) do
            if c.type == "kill_enrichment" then kill_ev = c end
        end
        assert.is_not_nil(kill_ev)
        assert.is_true(kill_ev.gunKill)
        assert.are.equal("weapons.guns.M_61", kill_ev.gunWeaponName)
    end)

    it("does not mark a gun kill without a recent burst", function()
        local captured = loader.capture_events()
        local initiator = player_unit("Maverick")
        initiator.getCoalition = function() return 2 end
        local target = stubs.make_unit({
            coalition = 1, id = 72,
            desc = { category = Unit.Category.AIRPLANE, attributes = {} },
        })
        CheckrideMission.onKill({ initiator = initiator, target = target, weapon = nil, time = 500 })

        local kill_ev = nil
        for _, c in ipairs(captured) do
            if c.type == "kill_enrichment" then kill_ev = c end
        end
        assert.is_not_nil(kill_ev)
        assert.is_nil(kill_ev.gunKill)
    end)
end)

describe("CheckrideMission.onShootingStart / onShootingEnd", function()
    setup(function()
        loader.load()
    end)

    before_each(function()
        loader.reset_state()
        _G.CheckrideLookupUCID = function(name)
            if name == "Maverick" then return "ucid-mav" end
        end
    end)

    it("records the shooter's gun burst with the resolved weapon name", function()
        local captured = loader.capture_events()
        local initiator = player_unit("Maverick")
        local gun = stubs.make_weapon({ typeName = "weapons.guns.GSh_301" })
        CheckrideMission.onShootingStart({ initiator = initiator, weapon = gun, time = 100 })

        local burst = CheckrideMission.gunBurstByUcid["ucid-mav"]
        assert.is_not_nil(burst)
        assert.are.equal("weapons.guns.GSh_301", burst.weaponName)
        assert.are.equal(100, burst.startAtMs)
        assert.is_nil(burst.endedAtMs)

        local start_ev = nil
        for _, c in ipairs(captured) do
            if c.type == "gun_burst_start" then start_ev = c end
        end
        assert.is_not_nil(start_ev)
        assert.are.equal("weapons.guns.GSh_301", start_ev.weaponName)
    end)

    it("falls back to event.weapon_name when there is no weapon object", function()
        local initiator = player_unit("Maverick")
        CheckrideMission.onShootingStart({ initiator = initiator, weapon = nil, weapon_name = "M_61", time = 100 })
        local burst = CheckrideMission.gunBurstByUcid["ucid-mav"]
        assert.is_not_nil(burst)
        assert.are.equal("M_61", burst.weaponName)
    end)

    it("records burst end with ammo consumption", function()
        local captured = loader.capture_events()
        local initiator = player_unit("Maverick")
        CheckrideMission.onShootingStart({ initiator = initiator, weapon_name = "M_61", time = 100 })
        CheckrideMission.onShootingEnd({ initiator = initiator, weapon_name = "M_61", ammo_consumption = 42, time = 102 })

        local burst = CheckrideMission.gunBurstByUcid["ucid-mav"]
        assert.is_not_nil(burst)
        assert.are.equal(102, burst.endedAtMs)

        local end_ev = nil
        for _, c in ipairs(captured) do
            if c.type == "gun_burst_end" then end_ev = c end
        end
        assert.is_not_nil(end_ev)
        assert.are.equal(42, end_ev.ammoConsumption)
        assert.are.equal("M_61", end_ev.weaponName)
    end)
end)

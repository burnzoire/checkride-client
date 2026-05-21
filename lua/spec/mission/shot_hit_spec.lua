-- lua/spec/mission/shot_hit_spec.lua
-- Tests CheckrideMission.onShot and CheckrideMission.onHit weapon-tracking logic.

local loader = require("helpers.mission_loader")
local stubs  = require("stubs.dcs_globals")

-- Helper: make a player unit mock.
local function player_unit(name, ucid)
    local unit = stubs.make_unit({
        playerName = name,
        typeName   = "F/A-18C",
        coalition  = 2,
        id         = 1,
    })
    _G.CheckrideLookupUCID = function(n)
        if n == name then return ucid or ("ucid-" .. name) end
    end
    return unit
end

-- Helper: make a weapon mock.
local function make_weapon(props)
    return stubs.make_weapon(props)
end

-- ---------------------------------------------------------------------------
describe("CheckrideMission.onShot", function()
    setup(function()
        loader.load()
    end)

    before_each(function()
        loader.reset_state()
        _G.Unit = {
            Category = { AIRPLANE=1, HELICOPTER=2, GROUND_UNIT=3, SHIP=4 },
            RefuelingSystem = { BOOM_AND_RECEPTACLE=0, PROBE_AND_DROGUE=1 },
        }
        _G.Object = { Category = { UNIT=1, WEAPON=2 } }
    end)

    it("discards when no initiator", function()
        local captured = loader.capture_events()
        CheckrideMission.onShot({ initiator = nil, weapon = make_weapon({}), time = 0 })
        assert.are.equal(0, #captured)
    end)

    it("discards when no weapon", function()
        local captured = loader.capture_events()
        local initiator = player_unit("Maverick")
        CheckrideMission.onShot({ initiator = initiator, weapon = nil, time = 0 })
        assert.are.equal(0, #captured)
    end)

    it("tracks player shot and emits shot_enrichment", function()
        local captured = loader.capture_events()
        local initiator = player_unit("Maverick")

        local weapon = make_weapon({
            id       = 201,
            typeName = "AIM-120C",
            point    = { x = 100, y = 1000, z = 200 },
            desc     = {
                category        = 1,  -- MISSILE
                missileCategory = 1,  -- AAM
                displayName     = "AMRAAM",
                guidance        = 4,  -- RADAR_ACTIVE
            },
        })
        -- Weapon needs a start point (getPoint on the weapon returns coordinates)
        -- Also it needs to be identified by tostring key.

        CheckrideMission.onShot({
            initiator = initiator,
            weapon    = weapon,
            target    = nil,
            time      = 100,
        })

        local shot_ev = nil
        for _, c in ipairs(captured) do
            if c.type == "shot_enrichment" then shot_ev = c end
        end
        assert.is_not_nil(shot_ev)
        assert.are.equal("Maverick", shot_ev.playerName)
    end)

    it("tracks AI shot of guided missile at player as inbound missile", function()
        local captured = loader.capture_events()

        _G.CheckrideLookupUCID = function(name)
            if name == "Maverick" then return "ucid-mav" end
        end

        local ai_initiator = stubs.make_unit({
            playerName = nil,  -- AI
            desc       = {
                category   = 1,  -- AIRPLANE
                attributes = { Fighters = true },
            },
            coalition = 1,
        })

        local player_target = stubs.make_unit({ playerName = "Maverick" })

        local guided_weapon = make_weapon({
            desc = {
                category        = 1,  -- MISSILE
                missileCategory = 1,  -- AAM
                guidance        = 4,  -- RADAR_ACTIVE (non-zero)
            },
        })

        CheckrideMission.onShot({
            initiator = ai_initiator,
            weapon    = guided_weapon,
            target    = player_target,
            time      = 200,
        })

        -- Should have emitted an inbound_missile event
        local inbound_ev = nil
        for _, c in ipairs(captured) do
            if c.type == "inbound_missile" then inbound_ev = c end
        end
        assert.is_not_nil(inbound_ev)
        assert.are.equal("Maverick",  inbound_ev.playerName)
        assert.are.equal("ucid-mav",  inbound_ev.playerUcid)
    end)
end)

-- ---------------------------------------------------------------------------
describe("CheckrideMission.onHit", function()
    setup(function()
        loader.load()
    end)

    before_each(function()
        loader.reset_state()
        _G.Unit = {
            Category = { AIRPLANE=1, HELICOPTER=2, GROUND_UNIT=3, SHIP=4 },
        }
        _G.Object = { Category = { UNIT=1, WEAPON=2 } }
        _G.CheckrideLookupUCID = function(name)
            if name == "Maverick" then return "ucid-mav" end
        end
    end)

    it("emits hit_enrichment with distance when tracked shot hits a target", function()
        local captured = loader.capture_events()

        local initiator = player_unit("Maverick")
        local wkey = "test-weapon-key"

        -- Pre-populate an active weapon shot.
        CheckrideMission.activeWeaponShots[wkey] = {
            weaponKey        = wkey,
            weaponClass      = "AAM",
            startX           = 0,
            startY           = 0,
            startAlt         = 1000,
            weaponName       = "AIM-120C",
            weaponDisplayName = "AMRAAM",
            weaponObjectId   = 201,
            targetObjectId   = 99,
            inFlight         = true,
            playerUcid       = "ucid-mav",
            playerName       = "Maverick",
        }

        local weapon = make_weapon({ id = 201 })
        local target = stubs.make_unit({
            id    = 99,
            desc  = { category = 1, attributes = {} },
            point = { x = 1000, y = 900, z = 1000 },  -- ~1414m horizontal from (0,0)
            life  = 5.0,
        })

        CheckrideMission.onHit({
            initiator = initiator,
            weapon    = weapon,
            target    = target,
            time      = 300,
        })

        local hit_ev = nil
        for _, c in ipairs(captured) do
            if c.type == "hit_enrichment" and c.weaponKey == wkey then
                hit_ev = c
            end
        end
        assert.is_not_nil(hit_ev)
        assert.is_not_nil(hit_ev.distanceNm)
        assert.is_truthy(hit_ev.distanceNm > 0)
        -- Shot should be removed from tracking
        assert.is_nil(CheckrideMission.activeWeaponShots[wkey])
    end)

    it("prefers most recent in-flight shot when only targetObjectId matches", function()
        local captured = loader.capture_events()

        local initiator = player_unit("Maverick")
        local farKey = "far-shot"
        local closeKey = "close-shot"

        CheckrideMission.activeWeaponShots[farKey] = {
            weaponKey         = farKey,
            weaponClass       = "AAM",
            startX            = 0,
            startY            = 0,
            startAlt          = 1000,
            weaponName        = "AIM-54C",
            weaponDisplayName = "Phoenix",
            targetObjectId    = 99,
            inFlight          = true,
            playerUcid        = "ucid-mav",
            playerName        = "Maverick",
            firedAt           = 100,
            lastDataAt        = 101,
        }

        CheckrideMission.activeWeaponShots[closeKey] = {
            weaponKey         = closeKey,
            weaponClass       = "AAM",
            startX            = 0,
            startY            = 0,
            startAlt          = 1000,
            weaponName        = "AIM-7M",
            weaponDisplayName = "Sparrow",
            targetObjectId    = 99,
            inFlight          = true,
            playerUcid        = "ucid-mav",
            playerName        = "Maverick",
            firedAt           = 200,
            lastDataAt        = 201,
        }

        local target = stubs.make_unit({
            id    = 99,
            desc  = { category = Unit.Category.AIRPLANE, attributes = {} },
            point = { x = 4630, y = 1000, z = 0 }, -- ~2.5nm from close shot origin
            life  = 5.0,
        })

        CheckrideMission.onHit({
            initiator = initiator,
            weapon    = nil,
            target    = target,
            time      = 300,
        })

        local hit_ev = nil
        for _, c in ipairs(captured) do
            if c.type == "hit_enrichment" then
                hit_ev = c
            end
        end

        assert.is_not_nil(hit_ev)
        assert.are.equal(closeKey, hit_ev.weaponKey)
        assert.is_true(hit_ev.distanceNm > 2.0 and hit_ev.distanceNm < 3.0)
        assert.is_nil(CheckrideMission.activeWeaponShots[closeKey])
        assert.is_not_nil(CheckrideMission.activeWeaponShots[farKey])
    end)
end)

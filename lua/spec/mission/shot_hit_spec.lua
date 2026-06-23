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

        local initiator = player_unit("Maverick", "ucid-mav")
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

        local initiator = player_unit("Maverick", "ucid-mav")
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

    it("keeps attribution stable when a later-launched short shot hits before an earlier long shot", function()
        local captured = loader.capture_events()
        local initiator = player_unit("Maverick", "ucid-mav")

        local longKey = "long-shot"
        local shortKey = "short-shot"

        CheckrideMission.activeWeaponShots[longKey] = {
            weaponKey         = longKey,
            weaponClass       = "AAM",
            startX            = 0,
            startY            = 0,
            startAlt          = 1000,
            targetObjectId    = 201,
            inFlight          = true,
            playerUcid        = "ucid-mav",
            playerName        = "Maverick",
            firedAt           = 100,
            lastDataAt        = 101,
        }

        CheckrideMission.activeWeaponShots[shortKey] = {
            weaponKey         = shortKey,
            weaponClass       = "AAM",
            startX            = 0,
            startY            = 0,
            startAlt          = 1000,
            targetObjectId    = 202,
            inFlight          = true,
            playerUcid        = "ucid-mav",
            playerName        = "Maverick",
            firedAt           = 200,
            lastDataAt        = 201,
        }

        local shortTarget = stubs.make_unit({
            id    = 202,
            desc  = { category = Unit.Category.AIRPLANE, attributes = {} },
            point = { x = 3704, y = 1000, z = 0 }, -- ~2.0nm
            life  = 5.0,
        })

        local longTarget = stubs.make_unit({
            id    = 201,
            desc  = { category = Unit.Category.AIRPLANE, attributes = {} },
            point = { x = 18520, y = 1000, z = 0 }, -- ~10.0nm
            life  = 5.0,
        })

        -- Later-launched short shot hits first.
        CheckrideMission.onHit({
            initiator = initiator,
            weapon    = nil,
            target    = shortTarget,
            time      = 300,
        })

        -- Earlier-launched long shot hits later.
        CheckrideMission.onHit({
            initiator = initiator,
            weapon    = nil,
            target    = longTarget,
            time      = 350,
        })

        local hit_events = {}
        for _, c in ipairs(captured) do
            if c.type == "hit_enrichment" then
                table.insert(hit_events, c)
            end
        end

        assert.are.equal(2, #hit_events)
        assert.are.equal(shortKey, hit_events[1].weaponKey)
        assert.are.equal(longKey, hit_events[2].weaponKey)
        assert.is_true(hit_events[1].distanceNm > 1.5 and hit_events[1].distanceNm < 2.5)
        assert.is_true(hit_events[2].distanceNm > 9.0 and hit_events[2].distanceNm < 11.0)
        assert.is_nil(CheckrideMission.activeWeaponShots[shortKey])
        assert.is_nil(CheckrideMission.activeWeaponShots[longKey])
    end)

    it("breaks shot-selection timestamp ties deterministically", function()
        local captured = loader.capture_events()
        local initiator = player_unit("Maverick", "ucid-mav")

        CheckrideMission.activeWeaponShots["tie-a"] = {
            weaponKey         = "tie-a",
            weaponClass       = "AAM",
            startX            = 0,
            startY            = 0,
            startAlt          = 1000,
            targetObjectId    = 109,
            inFlight          = true,
            playerUcid        = "ucid-mav",
            playerName        = "Maverick",
            firedAt           = 400,
            lastDataAt        = 405,
        }

        CheckrideMission.activeWeaponShots["tie-b"] = {
            weaponKey         = "tie-b",
            weaponClass       = "AAM",
            startX            = 0,
            startY            = 0,
            startAlt          = 1000,
            targetObjectId    = 109,
            inFlight          = true,
            playerUcid        = "ucid-mav",
            playerName        = "Maverick",
            firedAt           = 400,
            lastDataAt        = 405,
        }

        local target = stubs.make_unit({
            id    = 109,
            desc  = { category = Unit.Category.AIRPLANE, attributes = {} },
            point = { x = 3704, y = 1000, z = 0 },
            life  = 5.0,
        })

        CheckrideMission.onHit({
            initiator = initiator,
            weapon    = nil,
            target    = target,
            time      = 410,
        })

        local hit_ev = nil
        for _, c in ipairs(captured) do
            if c.type == "hit_enrichment" then
                hit_ev = c
            end
        end

        assert.is_not_nil(hit_ev)
        assert.are.equal("tie-b", hit_ev.weaponKey)
        assert.is_nil(CheckrideMission.activeWeaponShots["tie-b"])
        assert.is_not_nil(CheckrideMission.activeWeaponShots["tie-a"])
    end)
end)

-- ---------------------------------------------------------------------------
-- Victim attributes are forwarded verbatim: the full DCS getDesc().attributes set,
-- with no allow-list, so the backend interprets them and nothing is dropped. (The
-- non-lethal getRoleCoalition path still classifies a curated subset — covered below.)
describe("CheckrideMission victim role detection", function()
    setup(function()
        loader.load()
    end)

    before_each(function()
        loader.reset_state()
        _G.Unit = {
            Category = { AIRPLANE=1, HELICOPTER=2, GROUND_UNIT=3, SHIP=4 },
        }
        _G.Object = { Category = { UNIT=1, WEAPON=2 } }
        _G.coalition = { side = { RED=1, BLUE=2, NEUTRAL=0 } }
        _G.CheckrideLookupUCID = function(name)
            if name == "Maverick" then return "ucid-mav" end
        end
    end)

    -- Lethal hit stashes victim roles for onKill; assert the real attributes land.
    local function lethal_roles_for(attributes)
        loader.capture_events()
        local initiator = player_unit("Maverick", "ucid-mav")
        local target = stubs.make_unit({
            id   = 77,
            desc = { category = Unit.Category.GROUND_UNIT, attributes = attributes },
            life = 1.0, -- lethal
        })
        CheckrideMission.onHit({ initiator = initiator, weapon = nil, target = target, time = 500 })
        local pending = CheckrideMission.pendingKillsByObjectId[77]
        assert.is_not_nil(pending)
        return pending.victimRoles
    end

    local function has(list, value)
        for _, v in ipairs(list) do if v == value then return true end end
        return false
    end

    it("captures Modern Tanks / Old Tanks on a lethal armour kill", function()
        assert.is_true(has(lethal_roles_for({ ["Modern Tanks"] = true }), "Modern Tanks"))
        assert.is_true(has(lethal_roles_for({ ["Old Tanks"] = true }), "Old Tanks"))
    end)

    it("captures SAM LL (the real attr for the dead 'SAM launcher')", function()
        assert.is_true(has(lethal_roles_for({ ["SAM LL"] = true }), "SAM LL"))
    end)

    it("captures Static/Mobile AAA", function()
        assert.is_true(has(lethal_roles_for({ ["Static AAA"] = true }), "Static AAA"))
        assert.is_true(has(lethal_roles_for({ ["Mobile AAA"] = true }), "Mobile AAA"))
    end)

    it("forwards the full attribute set verbatim, with no allow-list", function()
        local roles = lethal_roles_for({
            ["Modern Tanks"] = true,
            ["Tanks"] = true,
            ["Ground vehicles"] = true, -- not in any old curated list
            ["Vehicles"] = true,
        })
        assert.are.equal(4, #roles)
        assert.is_true(has(roles, "Modern Tanks"))
        assert.is_true(has(roles, "Ground vehicles")) -- previously dropped by the allow-list
        assert.is_true(has(roles, "Vehicles"))
    end)

    it("stashes the raw weapon descriptor snapshot at the killing hit", function()
        loader.capture_events()
        local initiator = player_unit("Maverick", "ucid-mav")
        -- AGM-114K-like: category MISSILE(1), missileCategory OTHER(6), guidance 7.
        local weapon = stubs.make_weapon({
            desc = { category = 1, missileCategory = 6, guidance = 7, warhead = { mass = 8 } },
        })
        local target = stubs.make_unit({
            id   = 78,
            desc = { category = Unit.Category.GROUND_UNIT, attributes = { ["Tanks"] = true } },
            life = 1.0,
        })
        CheckrideMission.onHit({ initiator = initiator, weapon = weapon, target = target, time = 500 })
        local pending = CheckrideMission.pendingKillsByObjectId[78]
        assert.is_not_nil(pending)
        assert.is_not_nil(pending.weaponDescRaw)
        assert.are.equal(1, pending.weaponDescRaw.category)
        assert.are.equal(6, pending.weaponDescRaw.missileCategory)
        assert.are.equal(7, pending.weaponDescRaw.guidance)
        assert.are.equal(8, pending.weaponDescRaw.warheadMass)
    end)

    it("backfills pending weapon data from the launch shot record when onHit lacks the weapon", function()
        loader.capture_events()
        local initiator = player_unit("Maverick", "ucid-mav")
        -- Launch-captured shot record (the only place the weapon was alive).
        CheckrideMission.activeWeaponShots["wk"] = {
            weaponKey = "wk",
            weaponClass = "OTHER",
            weaponGuidance = "IR",
            weaponDescRaw = { category = 1, missileCategory = 6, guidance = 7 },
            startX = 0, startY = 0, startAlt = 1000,
            targetObjectId = 91, inFlight = true,
            playerUcid = "ucid-mav", playerName = "Maverick",
            firedAt = 100, lastDataAt = 101,
        }
        local target = stubs.make_unit({
            id    = 91,
            desc  = { category = Unit.Category.GROUND_UNIT, attributes = { ["Tanks"] = true } },
            point = { x = 1000, y = 900, z = 1000 },
            life  = 1.0,
        })
        -- weapon = nil: onHit can't read it, so the desc must come from the shot record
        -- before the outbound tracking consumes it.
        CheckrideMission.onHit({ initiator = initiator, weapon = nil, target = target, time = 300 })
        local pending = CheckrideMission.pendingKillsByObjectId[91]
        assert.is_not_nil(pending)
        assert.is_not_nil(pending.weaponDescRaw)
        assert.are.equal(7, pending.weaponDescRaw.guidance)
        assert.are.equal("OTHER", pending.weaponClass)
    end)

    -- Non-lethal hit runs getRoleCoalition; assert it classifies real attrs.
    local function role_coalition_for(attributes)
        local captured = loader.capture_events()
        local initiator = player_unit("Maverick", "ucid-mav")
        local target = stubs.make_unit({
            id        = 88,
            desc      = { category = Unit.Category.GROUND_UNIT, attributes = attributes },
            life      = 5.0, -- non-lethal
            coalition = 1,   -- enemy of the BLUE(2) initiator
        })
        CheckrideMission.onHit({ initiator = initiator, weapon = nil, target = target, time = 600 })
        for _, c in ipairs(captured) do
            if c.type == "hit_enrichment" and c.roleCoalition then return c.roleCoalition end
        end
        return nil
    end

    it("classifies Modern Tanks as armour", function()
        assert.are.equal("armour_enemy", role_coalition_for({ ["Modern Tanks"] = true }))
    end)

    it("classifies SAM LL as sam", function()
        assert.are.equal("sam_enemy", role_coalition_for({ ["SAM LL"] = true }))
    end)

    it("classifies Static AAA as aaa", function()
        assert.are.equal("aaa_enemy", role_coalition_for({ ["Static AAA"] = true }))
    end)
end)

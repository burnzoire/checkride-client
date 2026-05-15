-- lua/spec/gamegui/events_spec.lua
-- Tests GameGUI game-event handlers: onConnect, onDisconnect, onChangeSlot,
-- onKill (AI filter, missing-victim guard), onTakeoff, onCrash, onSelfKill,
-- onFriendlyFire, onGameEvent dispatch.

local loader = require("helpers.gamegui_loader")

-- Shortcut: make a net stub with configurable player info.
local function net_stub(players)
    players = players or {}
    return {
        log             = function() end,
        send_chat       = function() end,
        send_chat_to    = function() end,
        get_player_list = function() return {} end,
        get_player_info = function(id, key)
            local p = players[id]
            if p then return p[key] end
            return nil
        end,
        dostring_in = function(state, code) return '', true end,
    }
end

describe("Checkride game events (GameGUI)", function()
    setup(function()
        loader.load()
    end)

    before_each(function()
        loader.reset_state()
    end)

    -- -------------------------------------------------------------------------
    describe("onConnect", function()
        it("sends a connect event with playerUcid and playerName", function()
            local captured = loader.capture_events()
            _G.net = net_stub({ [3] = { name = "Maverick", ucid = "ucid-mav", side = 2 } })

            Checkride.onConnect(100, 3, "Maverick")

            assert.are.equal(1, #captured)
            assert.are.equal("connect",   captured[1].type)
            assert.are.equal("Maverick",  captured[1].playerName)
            assert.are.equal("ucid-mav",  captured[1].playerUcid)
        end)

        it("includes playerCount", function()
            local captured = loader.capture_events()
            _G.net = net_stub({ [3] = { name = "Maverick", ucid = "ucid-mav" } })
            Checkride.onConnect(100, 3, "Maverick")
            assert.is_number(captured[1].playerCount)
        end)
    end)

    -- -------------------------------------------------------------------------
    describe("onDisconnect", function()
        it("sends a disconnect event", function()
            local captured = loader.capture_events()
            _G.net = net_stub({ [4] = { name = "Goose", ucid = "ucid-goose", side = 2 } })
            -- Pre-populate player so ucid is known.
            local p = Checkride.findOrCreatePlayer(4)
            p.ucid = "ucid-goose"
            p.name = "Goose"

            Checkride.onDisconnect(200, 4, "Goose", 2, 0)

            assert.are.equal(1, #captured)
            assert.are.equal("disconnect", captured[1].type)
            assert.are.equal("Goose",      captured[1].playerName)
        end)

        it("removes the player from the clients table", function()
            _G.net = net_stub()
            Checkride.findOrCreatePlayer(7)
            Checkride.onDisconnect(0, 7, "Ghost", 2, 0)
            -- findOrCreatePlayer will recreate a fresh (empty) record.
            local p = Checkride.findOrCreatePlayer(7)
            assert.are.equal("", p.name)
        end)
    end)

    -- -------------------------------------------------------------------------
    describe("onChangeSlot", function()
        it("sends change_slot event with flyable = true for side=2, slot=1", function()
            local captured = loader.capture_events()
            _G.net = net_stub({ [1] = { name = "Maverick", ucid = "ucid-mav", side = 2 } })

            Checkride.onChangeSlot(300, 1, 1, 0)

            assert.are.equal(1, #captured)
            assert.are.equal("change_slot", captured[1].type)
            assert.is_true(captured[1].flyable)
        end)

        it("sends change_slot event with flyable = false for slot 0 (observer)", function()
            local captured = loader.capture_events()
            _G.net = net_stub({ [1] = { name = "Maverick", ucid = "ucid-mav", side = 0 } })

            Checkride.onChangeSlot(300, 1, 0, 0)

            assert.are.equal(1, #captured)
            assert.is_false(captured[1].flyable)
        end)

        it("discards change_slot with blank player identity", function()
            local captured = loader.capture_events()
            -- net returns nil for both name and ucid.
            _G.net = net_stub()
            Checkride.onChangeSlot(300, 1, 1, 0)
            assert.are.equal(0, #captured)
        end)

        it("marks spectator slot as not flyable", function()
            local captured = loader.capture_events()
            _G.net = net_stub({ [2] = { name = "Ice", ucid = "ucid-ice", side = 2 } })
            Checkride.onChangeSlot(0, 2, "spectator1", 0)
            assert.are.equal(1, #captured)
            assert.is_false(captured[1].flyable)
        end)
    end)

    -- -------------------------------------------------------------------------
    describe("onKill", function()
        before_each(function()
            -- Pre-populate two players.
            local p1 = Checkride.findOrCreatePlayer(1)
            p1.name = "Maverick"; p1.ucid = "ucid-mav"
            local p2 = Checkride.findOrCreatePlayer(2)
            p2.name = "Viper";    p2.ucid = "ucid-viper"

            _G.DCS = {
                getRealTime          = function() return 0 end,
                getUnitType          = function(id) return "F-14A" end,
                getUnitTypeAttribute = function(unitType, attr) return {} end,
                setUserCallbacks     = function() end,
            }
        end)

        it("discards when both killer and victim are AI", function()
            local captured = loader.capture_events()
            -- Neither playerID 10 nor 20 is in clients table.
            Checkride.onKill(0, 10, "F-14A", 1, 20, "MiG-21", 2, "AIM-9")
            assert.are.equal(0, #captured)
        end)

        it("discards when victim unit type is blank", function()
            local captured = loader.capture_events()
            Checkride.onKill(0, 1, "F/A-18C", 2, 2, "", 1, "AIM-120")
            assert.are.equal(0, #captured)
        end)

        it("sends kill event when player kills another player", function()
            local captured = loader.capture_events()
            Checkride.onKill(0, 1, "F/A-18C", 2, 2, "F-14A", 1, "AIM-120")

            assert.are.equal(1, #captured)
            assert.are.equal("kill",      captured[1].type)
            assert.are.equal("Maverick",  captured[1].killerName)
            assert.are.equal("Viper",     captured[1].victimName)
        end)

        it("sends kill event when player kills AI unit", function()
            local captured = loader.capture_events()
            -- victimPlayerID 99 not in clients → AI victim
            Checkride.onKill(0, 1, "F/A-18C", 2, 99, "MiG-29", 1, "AIM-9")
            assert.are.equal(1, #captured)
            assert.are.equal("kill", captured[1].type)
        end)
    end)

    -- -------------------------------------------------------------------------
    describe("onTakeoff", function()
        it("discards when player not in clients table", function()
            local captured = loader.capture_events()
            _G.DCS = {
                getRealTime  = function() return 0 end,
                getUnitType  = function() return "F/A-18C" end,
                getUnitTypeAttribute = function() return {} end,
                setUserCallbacks = function() end,
            }
            Checkride.onTakeoff(0, 99, 1, "Batumi")
            assert.are.equal(0, #captured)
        end)

        it("sends takeoff event for known player", function()
            local captured = loader.capture_events()
            local p = Checkride.findOrCreatePlayer(1)
            p.name = "Maverick"; p.ucid = "ucid-mav"
            _G.DCS = {
                getRealTime  = function() return 0 end,
                getUnitType  = function() return "F/A-18C" end,
                getUnitTypeAttribute = function() return {} end,
                setUserCallbacks = function() end,
            }
            Checkride.onTakeoff(0, 1, 1, "Batumi")
            assert.are.equal(1, #captured)
            assert.are.equal("takeoff",   captured[1].type)
            assert.are.equal("Maverick",  captured[1].playerName)
        end)
    end)

    -- -------------------------------------------------------------------------
    describe("onSelfKill", function()
        it("sends self_kill event for known player", function()
            local captured = loader.capture_events()
            local p = Checkride.findOrCreatePlayer(3)
            p.name = "Hollywood"; p.ucid = "ucid-hw"
            Checkride.onSelfKill(0, 3)
            assert.are.equal(1, #captured)
            assert.are.equal("self_kill",  captured[1].type)
            assert.are.equal("Hollywood", captured[1].playerName)
        end)

        it("discards for unknown player", function()
            local captured = loader.capture_events()
            Checkride.onSelfKill(0, 77)
            assert.are.equal(0, #captured)
        end)
    end)

    -- -------------------------------------------------------------------------
    describe("onFriendlyFire", function()
        it("sends friendly_fire event", function()
            local captured = loader.capture_events()
            local p = Checkride.findOrCreatePlayer(1)
            p.name = "Maverick"; p.ucid = "ucid-mav"
            local p2 = Checkride.findOrCreatePlayer(2)
            p2.name = "Viper"; p2.ucid = "ucid-viper"

            Checkride.onFriendlyFire(0, 1, "cannon", 2)

            assert.are.equal(1, #captured)
            assert.are.equal("friendly_fire", captured[1].type)
            assert.are.equal("Maverick",      captured[1].playerName)
            assert.are.equal("Viper",         captured[1].victimName)
        end)
    end)

    -- -------------------------------------------------------------------------
    describe("onGameEvent dispatch", function()
        it("routes kill to onKill", function()
            local called = false
            local orig = Checkride.onKill
            Checkride.onKill = function(...) called = true; orig(...) end
            _G.DCS = {
                getRealTime = function() return 0 end,
                getUnitType = function() return nil end,
                getUnitTypeAttribute = function() return {} end,
                setUserCallbacks = function() end,
            }
            Checkride.onGameEvent("kill", 1,"F/A-18C",2, 2,"MiG-29",1,"AIM-9")
            assert.is_true(called)
            Checkride.onKill = orig
        end)

        it("logs unknown event types", function()
            assert.has_no.errors(function()
                Checkride.onGameEvent("unknown_event_xyz")
            end)
        end)
    end)
end)

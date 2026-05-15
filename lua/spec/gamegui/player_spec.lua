-- lua/spec/gamegui/player_spec.lua
-- Tests Checkride player-management helpers: findOrCreatePlayer, removePlayer.

local loader = require("helpers.gamegui_loader")

describe("Checkride player management", function()
    setup(function()
        loader.load()
    end)

    before_each(function()
        loader.reset_state()
    end)

    describe("findOrCreatePlayer", function()
        it("creates a new player record on first call", function()
            local p = Checkride.findOrCreatePlayer(1)
            assert.is_not_nil(p)
            assert.are.equal(1, p.id)
        end)

        it("returns the same object on subsequent calls", function()
            local p1 = Checkride.findOrCreatePlayer(2)
            p1.name = "Maverick"
            local p2 = Checkride.findOrCreatePlayer(2)
            assert.are.equal("Maverick", p2.name)
        end)

        it("creates independent records for different IDs", function()
            local a = Checkride.findOrCreatePlayer(10)
            local b = Checkride.findOrCreatePlayer(11)
            a.name = "Maverick"
            b.name = "Goose"
            assert.are_not.equal(a.name, b.name)
        end)

        it("initialises player fields to empty strings", function()
            local p = Checkride.findOrCreatePlayer(99)
            assert.are.equal("", p.name)
            assert.are.equal("", p.ucid)
            assert.are.equal("", p.slot)
            assert.are.equal("", p.side)
        end)
    end)

    describe("removePlayer", function()
        it("removes an existing player", function()
            Checkride.findOrCreatePlayer(5)
            Checkride.removePlayer(5)
            -- After removal findOrCreatePlayer creates a fresh record.
            local p = Checkride.findOrCreatePlayer(5)
            assert.are.equal("", p.name)
        end)

        it("silently handles removing a non-existent player", function()
            assert.has_no.errors(function()
                Checkride.removePlayer(999)
            end)
        end)
    end)
end)

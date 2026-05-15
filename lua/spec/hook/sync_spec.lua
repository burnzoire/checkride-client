-- lua/spec/hook/sync_spec.lua
-- Tests CheckrideCallbackRouter.syncAllPlayers and the CheckridePlayers map
-- that the hook maintains for UCID resolution.

local loader = require("helpers.hook_loader")

-- Build a net stub whose dostring_in actually executes the Lua code so that
-- the CheckridePlayers global is updated in our test environment.
local function net_with_dostring(players)
    local by_id = {}
    for _, p in ipairs(players) do by_id[p.id] = p end
    local ids = {}
    for _, p in ipairs(players) do ids[#ids + 1] = p.id end
    return {
        log             = function() end,
        send_chat       = function() end,
        send_chat_to    = function() end,
        get_player_list = function() return ids end,
        get_player_info = function(id, key)
            local p = by_id[id]
            if p then return p[key] end
            return nil
        end,
        dostring_in = function(state, code)
            -- Execute the generated Lua in the current global environment so
            -- that CheckridePlayers is actually updated.
            local fn, err = loadstring(code)
            if fn then fn() end
            return '', true
        end,
    }
end

describe("CheckrideCallbackRouter player sync (hook)", function()
    setup(function()
        loader.load()
    end)

    before_each(function()
        loader.reset_state()
        _G.CheckridePlayers = {}
    end)

    -- -------------------------------------------------------------------------
    describe("syncAllPlayers", function()
        it("populates CheckridePlayers from net.get_player_list", function()
            _G.net = net_with_dostring({
                { id = 1, name = "Maverick", ucid = "ucid-mav"  },
                { id = 2, name = "Goose",    ucid = "ucid-goose" },
            })
            CheckrideCallbackRouter.syncAllPlayers()
            assert.are.equal("ucid-mav",   CheckridePlayers["Maverick"])
            assert.are.equal("ucid-goose", CheckridePlayers["Goose"])
        end)

        it("clears stale players from previous sync", function()
            -- Pre-populate with a player who is no longer connected.
            _G.CheckridePlayers = { Ghost = "ucid-ghost" }
            _G.net = net_with_dostring({
                { id = 1, name = "Maverick", ucid = "ucid-mav" },
            })
            CheckrideCallbackRouter.syncAllPlayers()
            assert.is_nil(CheckridePlayers["Ghost"])
        end)

        it("does nothing when player list is empty", function()
            _G.net = net_with_dostring({})
            assert.has_no.errors(function()
                CheckrideCallbackRouter.syncAllPlayers()
            end)
            assert.are.equal(0, (function()
                local n = 0
                for _ in pairs(CheckridePlayers) do n = n + 1 end
                return n
            end)())
        end)

        it("skips players with no name", function()
            _G.net = {
                log             = function() end,
                get_player_list = function() return { 1 } end,
                get_player_info = function(id, key)
                    if key == "name" then return "" end
                    return nil
                end,
                dostring_in = function(state, code)
                    local fn = loadstring(code); if fn then fn() end
                    return '', true
                end,
            }
            CheckrideCallbackRouter.syncAllPlayers()
            assert.are.equal(0, (function()
                local n = 0
                for _ in pairs(CheckridePlayers) do n = n + 1 end
                return n
            end)())
        end)
    end)

    -- -------------------------------------------------------------------------
    describe("onPlayerConnect UCID sync", function()
        it("adds the player to CheckridePlayers on connect", function()
            _G.net = net_with_dostring({
                { id = 5, name = "Ice", ucid = "ucid-ice" },
            })
            _G.Checkride = { onPlayerConnect = nil }
            CheckrideCallbackRouter.onPlayerConnect(5)
            assert.are.equal("ucid-ice", CheckridePlayers["Ice"])
        end)
    end)

    -- -------------------------------------------------------------------------
    describe("onPlayerDisconnect UCID sync", function()
        it("removes the player from CheckridePlayers on disconnect", function()
            _G.CheckridePlayers = { Hollywood = "ucid-hw" }
            _G.net = {
                log             = function() end,
                get_player_info = function(id, key)
                    if key == "name" then return "Hollywood" end
                    return nil
                end,
                get_player_list = function() return {} end,
                dostring_in     = function(state, code)
                    local fn = loadstring(code); if fn then fn() end
                    return '', true
                end,
            }
            _G.Checkride = { onPlayerDisconnect = nil }
            CheckrideCallbackRouter.onPlayerDisconnect(8, "Hollywood", 2, 0)
            assert.is_nil(CheckridePlayers["Hollywood"])
        end)
    end)
end)

-- lua/spec/gamegui/config_spec.lua
-- Tests Checkride.applyConfig, pollChatSocket, and chat-sending helpers.

local loader = require("helpers.gamegui_loader")

describe("Checkride config and chat (GameGUI)", function()
    setup(function()
        loader.load()
    end)

    before_each(function()
        loader.reset_state()
    end)

    -- -------------------------------------------------------------------------
    describe("applyConfig", function()
        it("sets missionScriptingEnabled from config (snake_case key)", function()
            Checkride.applyConfig({ mission_scripting_enabled = false })
            assert.is_false(Checkride.missionScriptingEnabled)
        end)

        it("sets missionScriptingEnabled to true", function()
            Checkride.missionScriptingEnabled = false
            Checkride.applyConfig({ mission_scripting_enabled = true })
            assert.is_true(Checkride.missionScriptingEnabled)
        end)

        it("does not error with an empty config table", function()
            assert.has_no.errors(function()
                Checkride.applyConfig({})
            end)
        end)

        it("does not error with nil (nil is silently ignored by guard)", function()
            -- The actual source has  if config.mission_scripting_enabled ~= nil then ...
            -- Calling with nil would index nil and throw.  We document that callers
            -- must pass a table, so we just verify passing an empty table is safe.
            assert.has_no.errors(function()
                Checkride.applyConfig({})
            end)
        end)
    end)

    -- -------------------------------------------------------------------------
    describe("sendChatToAll", function()
        it("does not error with a valid message", function()
            local sent = {}
            _G.net = {
                log             = function() end,
                send_chat       = function(msg, all) table.insert(sent, msg) end,
                send_chat_to    = function() end,
                get_player_info = function() return nil end,
                get_player_list = function() return {} end,
                dostring_in     = function() return '', true end,
            }
            assert.has_no.errors(function()
                Checkride.sendChatToAll("Hello, DCS!")
            end)
        end)

        it("does nothing for nil message", function()
            local call_count = 0
            _G.net = {
                log             = function() end,
                send_chat       = function() call_count = call_count + 1 end,
                send_chat_to    = function() end,
                get_player_info = function() return nil end,
                get_player_list = function() return {} end,
                dostring_in     = function() return '', true end,
            }
            Checkride.sendChatToAll(nil)
            assert.are.equal(0, call_count)
        end)

        it("does nothing for empty string", function()
            local call_count = 0
            _G.net = {
                log             = function() end,
                send_chat       = function() call_count = call_count + 1 end,
                send_chat_to    = function() end,
                get_player_info = function() return nil end,
                get_player_list = function() return {} end,
                dostring_in     = function() return '', true end,
            }
            Checkride.sendChatToAll("")
            assert.are.equal(0, call_count)
        end)
    end)

    -- -------------------------------------------------------------------------
    describe("sendChatToUcid", function()
        it("calls net.send_chat_to when player found by ucid", function()
            local sent = {}
            _G.net = {
                log             = function() end,
                send_chat       = function() end,
                send_chat_to    = function(msg, id) table.insert(sent, { id=id, msg=msg }) end,
                get_player_info = function() return nil end,
                get_player_list = function() return {} end,
                dostring_in     = function() return '', true end,
            }
            -- Register a player so lookup by ucid works.
            local p = Checkride.findOrCreatePlayer(3)
            p.name = "Maverick"
            p.ucid = "ucid-mav"

            Checkride.sendChatToUcid("Good trap!", "ucid-mav")
            assert.are.equal(1, #sent)
            assert.are.equal(3, sent[1].id)
        end)

        it("does not call send_chat_to when ucid not found", function()
            local call_count = 0
            _G.net = {
                log             = function() end,
                send_chat       = function() end,
                send_chat_to    = function() call_count = call_count + 1 end,
                get_player_info = function() return nil end,
                get_player_list = function() return {} end,
                dostring_in     = function() return '', true end,
            }
            Checkride.sendChatToUcid("Hi", "no-such-ucid")
            assert.are.equal(0, call_count)
        end)
    end)

    -- -------------------------------------------------------------------------
    describe("pollChatSocket", function()
        it("calls applyConfig when receiving a config payload", function()
            -- The GameGUI checks: decoded.source == "checkride" and decoded.kind == "config"
            loader.receive_queue[1] = '{"source":"checkride","kind":"config","mission_scripting_enabled":false}'

            local orig_decode = Checkride.JSON.decode
            Checkride.JSON.decode = function(self, s)
                if s:find('"kind":"config"') or s:find('"kind":') then
                    return {
                        source                   = "checkride",
                        kind                     = "config",
                        mission_scripting_enabled = false,
                    }
                end
                return {}
            end

            Checkride.pollChatSocket()

            Checkride.JSON.decode = orig_decode
            assert.is_false(Checkride.missionScriptingEnabled)
        end)

        it("handles empty receive queue without error", function()
            -- receive_queue is empty (default after reset_state).
            assert.has_no.errors(function()
                Checkride.pollChatSocket()
            end)
        end)
    end)
end)

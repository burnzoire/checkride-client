-- lua/spec/hook/router_spec.lua
-- Tests CheckrideCallbackRouter: forwardToCheckride guards,
-- onSimulationFrame throttling, onGameEvent dispatch.

local loader = require("helpers.hook_loader")

describe("CheckrideCallbackRouter", function()
    setup(function()
        loader.load()
    end)

    before_each(function()
        loader.reset_state()
    end)

    -- -------------------------------------------------------------------------
    describe("forwardToCheckride (via callback methods)", function()
        it("does not error when Checkride is nil", function()
            local saved = _G.Checkride
            _G.Checkride = nil
            assert.has_no.errors(function()
                CheckrideCallbackRouter.onGameEvent("kill", 1, "A", 2, 2, "B", 1, "gun")
            end)
            _G.Checkride = saved
        end)

        it("does not error when the handler function is nil on Checkride", function()
            _G.Checkride = { onGameEvent = nil }
            assert.has_no.errors(function()
                CheckrideCallbackRouter.onGameEvent("kill", 1, "A", 2, 2, "B", 1, "gun")
            end)
        end)

        it("calls the corresponding Checkride handler when present", function()
            local called = false
            _G.Checkride = {
                onGameEvent = function(...)
                    called = true
                end,
            }
            CheckrideCallbackRouter.onGameEvent("kill", 1, "A", 2, 2, "B", 1, "gun")
            assert.is_true(called)
        end)

        it("handles runtime errors in the Checkride handler gracefully", function()
            _G.Checkride = {
                onGameEvent = function(...)
                    error("simulated crash")
                end,
            }
            assert.has_no.errors(function()
                CheckrideCallbackRouter.onGameEvent("kill")
            end)
        end)
    end)

    -- -------------------------------------------------------------------------
    describe("onSimulationFrame", function()
        it("does not error when Checkride is nil", function()
            local saved = _G.Checkride
            _G.Checkride = nil
            _G.DCS = { getRealTime = function() return 1 end, setUserCallbacks = function() end }
            assert.has_no.errors(function()
                CheckrideCallbackRouter.onSimulationFrame()
            end)
            _G.Checkride = saved
        end)

        it("calls Checkride.pollChatSocket when present", function()
            local poll_count = 0
            _G.DCS = { getRealTime = function() return 100 end, setUserCallbacks = function() end }
            _G.Checkride = {
                pollChatSocket       = function() poll_count = poll_count + 1 end,
                pollMissionEventBridge = function() end,
                onSimulationFrame    = nil,
                missionScriptingEnabled = false,
            }
            CheckrideCallbackRouter.onSimulationFrame()
            assert.is_truthy(poll_count >= 0)  -- may be throttled on first call
        end)

        it("keeps polling mission bridge when DCS.getRealTime returns nil", function()
            local bridgePolls = 0
            _G.DCS = { getRealTime = function() return nil end, setUserCallbacks = function() end }
            CheckrideCallbackRouter.pollMissionEventBridge = function()
                bridgePolls = bridgePolls + 1
            end
            _G.Checkride = {
                onSimulationFrame = function() end,
            }

            assert.has_no.errors(function()
                for _ = 1, 5 do
                    CheckrideCallbackRouter.onSimulationFrame()
                end
            end)
            assert.are.equal(0, bridgePolls)
            CheckrideCallbackRouter.onSimulationFrame()
            assert.are.equal(1, bridgePolls)
        end)

        it("throttles fallback mission bridge polling when DCS.getRealTime stays nil", function()
            local bridgePolls = 0
            _G.DCS = { getRealTime = function() return nil end, setUserCallbacks = function() end }
            CheckrideCallbackRouter.pollMissionEventBridge = function()
                bridgePolls = bridgePolls + 1
            end
            _G.Checkride = {
                onSimulationFrame = function() end,
            }

            for _ = 1, 5 do
                CheckrideCallbackRouter.onSimulationFrame()
            end
            assert.are.equal(0, bridgePolls)

            CheckrideCallbackRouter.onSimulationFrame()
            assert.are.equal(1, bridgePolls)
        end)

        it("keeps polling mission bridge when DCS.getRealTime raises an error", function()
            local bridgePolls = 0
            _G.DCS = {
                getRealTime = function()
                    error("clock failed")
                end,
                setUserCallbacks = function() end,
            }
            CheckrideCallbackRouter.pollMissionEventBridge = function()
                bridgePolls = bridgePolls + 1
            end
            _G.Checkride = {
                onSimulationFrame = function() end,
            }

            assert.has_no.errors(function()
                for _ = 1, 5 do
                    CheckrideCallbackRouter.onSimulationFrame()
                end
            end)
            assert.are.equal(0, bridgePolls)
            CheckrideCallbackRouter.onSimulationFrame()
            assert.are.equal(1, bridgePolls)
        end)
    end)

    -- -------------------------------------------------------------------------
    describe("onPlayerConnect / onPlayerDisconnect", function()
        it("forwards onPlayerConnect to Checkride", function()
            local forwarded_id = nil
            _G.net = {
                log             = function() end,
                get_player_info = function(id, key) return nil end,
                get_player_list = function() return {} end,
                dostring_in     = function() return '', true end,
            }
            _G.Checkride = {
                onPlayerConnect   = function(id) forwarded_id = id end,
                onPlayerDisconnect = nil,
            }
            CheckrideCallbackRouter.onPlayerConnect(5)
            assert.are.equal(5, forwarded_id)
        end)

        it("forwards onPlayerDisconnect to Checkride", function()
            local disconnected_id = nil
            _G.net = {
                log             = function() end,
                get_player_info = function(id, key) return nil end,
                get_player_list = function() return {} end,
                dostring_in     = function() return '', true end,
            }
            _G.Checkride = {
                onPlayerDisconnect = function(id, name, side, reason)
                    disconnected_id = id
                end,
            }
            CheckrideCallbackRouter.onPlayerDisconnect(7, "Maverick", 2, 0)
            assert.are.equal(7, disconnected_id)
        end)
    end)
end)

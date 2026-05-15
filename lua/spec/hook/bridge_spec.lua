-- lua/spec/hook/bridge_spec.lua
-- Tests CheckrideCallbackRouter.pollMissionEventBridge (DCS mission → GameGUI bridge).

local loader = require("helpers.hook_loader")

describe("CheckrideCallbackRouter.pollMissionEventBridge", function()
    setup(function()
        loader.load()
    end)

    before_each(function()
        loader.reset_state()
        -- Provide a minimal DCS stub.
        _G.DCS = { getRealTime = function() return 100 end, setUserCallbacks = function() end }
    end)

    it("does nothing when missionScriptingEnabled is false", function()
        local dostring_calls = 0
        _G.net = {
            log             = function() end,
            get_player_info = function() return nil end,
            get_player_list = function() return {} end,
            dostring_in     = function(state, code)
                dostring_calls = dostring_calls + 1
                return '', true
            end,
        }
        _G.Checkride = {
            missionScriptingEnabled = false,
            sendEncodedEvent        = function() end,
        }
        CheckrideCallbackRouter.pollMissionEventBridge()
        assert.are.equal(0, dostring_calls)
    end)

    it("does nothing when Checkride is nil", function()
        local saved = _G.Checkride
        _G.Checkride = nil
        _G.net = {
            log = function() end,
            get_player_info = function() return nil end,
            get_player_list = function() return {} end,
            dostring_in = function() return '', true end,
        }
        assert.has_no.errors(function()
            CheckrideCallbackRouter.pollMissionEventBridge()
        end)
        _G.Checkride = saved
    end)

    it("forwards a non-empty event string to Checkride.sendEncodedEvent", function()
        local forwarded = {}
        local event_queue = { '{"type":"grading"}', '' }
        local call_index  = 0

        _G.net = {
            log             = function() end,
            get_player_info = function() return nil end,
            get_player_list = function() return {} end,
            dostring_in     = function(state, code)
                call_index = call_index + 1
                return event_queue[call_index] or '', true
            end,
        }
        _G.Checkride = {
            missionScriptingEnabled = true,
            sendEncodedEvent        = function(msg) table.insert(forwarded, msg) end,
        }
        CheckrideCallbackRouter.pollMissionEventBridge()
        assert.is_truthy(#forwarded >= 1)
        assert.are.equal('{"type":"grading"}', forwarded[1])
    end)

    it("treats a missing mission-side CheckrideMission table as an empty queue", function()
        local bridgeOk = nil
        local bridgeResult = nil
        local forwardedCount = 0

        _G.net = {
            log             = function() end,
            get_player_info = function() return nil end,
            get_player_list = function() return {} end,
            dostring_in     = function(state, code)
                local savedMission = _G.CheckrideMission
                _G.CheckrideMission = nil

                local loader = loadstring or load
                local chunk, err = loader(code)
                if not chunk then
                    _G.CheckrideMission = savedMission
                    return err, false
                end

                local ok, result = pcall(chunk)
                _G.CheckrideMission = savedMission
                bridgeOk = ok
                bridgeResult = result
                return ok and result or result, ok
            end,
        }
        _G.Checkride = {
            missionScriptingEnabled = true,
            sendEncodedEvent        = function()
                forwardedCount = forwardedCount + 1
            end,
        }

        CheckrideCallbackRouter.pollMissionEventBridge()

        assert.is_true(bridgeOk)
        assert.are.equal('', bridgeResult)
        assert.are.equal(0, forwardedCount)
    end)

    it("stops polling after receiving an empty event string", function()
        local poll_count = 0
        _G.net = {
            log             = function() end,
            get_player_info = function() return nil end,
            get_player_list = function() return {} end,
            dostring_in     = function(state, code)
                poll_count = poll_count + 1
                return '', true  -- always empty
            end,
        }
        _G.Checkride = {
            missionScriptingEnabled = true,
            sendEncodedEvent        = function() end,
        }
        CheckrideCallbackRouter.pollMissionEventBridge()
        -- Should call dostring_in only once before stopping.
        assert.are.equal(1, poll_count)
    end)

    it("respects the max-events-per-poll cap", function()
        -- Return 100 non-empty events; bridge should cap at its internal limit.
        local forwarded = {}
        _G.net = {
            log             = function() end,
            get_player_info = function() return nil end,
            get_player_list = function() return {} end,
            dostring_in     = function(state, code)
                return '{"type":"test"}', true
            end,
        }
        _G.Checkride = {
            missionScriptingEnabled = true,
            sendEncodedEvent        = function(msg) table.insert(forwarded, msg) end,
        }
        CheckrideCallbackRouter.pollMissionEventBridge()
        -- Should not loop forever; cap is typically 50 or similar.
        assert.is_truthy(#forwarded < 200)
        assert.is_truthy(#forwarded > 0)
    end)
end)

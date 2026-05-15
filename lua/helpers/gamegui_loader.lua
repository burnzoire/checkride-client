-- lua/helpers/gamegui_loader.lua
--
-- Loads DCS-CheckrideGameGUI.lua with all external dependencies stubbed:
--   • io.open  – returns a no-op handle for log files
--   • lfs.writedir – returns /tmp/
--   • loadfile (for Scripts\JSON.lua) – returns a minimal JSON encoder
--   • require("socket") – returns a stub UDP socket factory

local stubs = require("stubs.dcs_globals")
local M = {}

local SCRIPT = CHECKRIDE_REPO_ROOT .. "DCS-Checkride/Scripts/DCS-CheckrideGameGUI.lua"

-- ---------------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------------

local function make_no_op_file_handle()
    return { write = function() end, flush = function() end, close = function() end }
end

local function make_udp_socket(sent_log)
    return {
        settimeout  = function() end,
        setsockname = function() return true, nil end,
        sendto      = function(self, data, host, port)
            table.insert(sent_log, { data = data, host = host, port = port })
            return 1, nil
        end,
        receivefrom = function(self)
            if M.receive_queue and #M.receive_queue > 0 then
                local item = table.remove(M.receive_queue, 1)
                return item, "127.0.0.1", 41235
            end
            return nil
        end,
    }
end

local function make_json_stub()
    local function escape(s)
        s = tostring(s)
        s = s:gsub('\\', '\\\\')
        s = s:gsub('"',  '\\"')
        s = s:gsub('\n', '\\n')
        s = s:gsub('\r', '\\r')
        s = s:gsub('\t', '\\t')
        return s
    end

    local function enc(v)
        local t = type(v)
        if t == "nil"     then return "null"
        elseif t == "boolean" then return tostring(v)
        elseif t == "number"  then return tostring(v)
        elseif t == "string"  then return '"' .. escape(v) .. '"'
        elseif t == "table"   then
            local n, is_arr = 0, true
            for k in pairs(v) do
                if type(k) ~= "number" then is_arr = false; break end
                n = n + 1
            end
            if is_arr then
                for i = 1, n do
                    if v[i] == nil then is_arr = false; break end
                end
            end
            if is_arr then
                local parts = {}
                for i = 1, #v do parts[#parts + 1] = enc(v[i]) end
                return "[" .. table.concat(parts, ",") .. "]"
            else
                local parts = {}
                for k, val in pairs(v) do
                    parts[#parts + 1] = '"' .. escape(tostring(k)) .. '":' .. enc(val)
                end
                return "{" .. table.concat(parts, ",") .. "}"
            end
        end
        return '"' .. escape(tostring(v)) .. '"'
    end

    return {
        encode = function(self, v) return enc(v) end,
        decode = function(self, s) return {} end,
    }
end

-- ---------------------------------------------------------------------------
-- State exposed for tests
-- ---------------------------------------------------------------------------

M.sent          = {}   -- datagrams recorded by the send socket
M.receive_queue = {}   -- payloads to be returned by receivefrom

-- Original senders saved after load for restore in reset_state.
local _orig_sendEvent

-- ---------------------------------------------------------------------------
-- Loader
-- ---------------------------------------------------------------------------

--- Load (or reload) the GameGUI script with all stubs active.
function M.load(overrides)
    stubs.setup(overrides)

    M.sent          = {}
    M.receive_queue = {}

    -- Build socket stub; each udp() call gets a fresh socket sharing M.sent.
    local json_stub    = make_json_stub()
    local sent_ref     = M.sent
    local socket_stub  = {
        udp = function()
            return make_udp_socket(sent_ref)
        end,
        try = function(v) return v end,
    }

    -- Preload socket so require("socket") inside GameGUI returns our stub.
    package.preload["socket"] = function() return socket_stub end

    -- Override loadfile to return the JSON stub when Scripts\JSON.lua is requested.
    local orig_loadfile = loadfile
    _G.loadfile = function(path)
        if path and tostring(path):find("JSON") then
            return function() return json_stub end
        end
        return orig_loadfile(path)
    end

    -- Override io.open so the log file creation is a no-op.
    local orig_io_open = io.open
    io.open = function(path, mode)
        if path and tostring(path):find("%.log") then
            return make_no_op_file_handle()
        end
        return orig_io_open(path, mode)
    end

    local ok, err = pcall(dofile, SCRIPT)

    -- Restore overridden globals regardless of success.
    _G.loadfile = orig_loadfile
    io.open     = orig_io_open
    package.preload["socket"] = nil

    if not ok then
        error("Failed to load GameGUI script: " .. tostring(err))
    end

    _orig_sendEvent = Checkride.sendEvent
end

--- Reset Checkride mutable state between tests.
function M.reset_state()
    if not Checkride then return end
    Checkride.clients                 = {}
    Checkride.missionScriptingEnabled = true
    Checkride.LastChatPollAt          = 0
    M.sent                            = {}
    M.receive_queue                   = {}
    Checkride.sendEvent               = _orig_sendEvent
end

--- Install a capturing wrapper around Checkride.sendEvent.
--- Returns a table that accumulates the raw message tables sent.
function M.capture_events()
    local captured = {}
    Checkride.sendEvent = function(msg)
        table.insert(captured, msg)
        _orig_sendEvent(msg)
    end
    return captured
end

return M

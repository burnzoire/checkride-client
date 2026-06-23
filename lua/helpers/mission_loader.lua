-- lua/helpers/mission_loader.lua
--
-- Loads DCS-CheckrideMission.lua in an environment with DCS stubs set up.
-- Provides helpers for resetting state between tests and capturing events.

local stubs = require("stubs.dcs_globals")
local M = {}

local SCRIPT = CHECKRIDE_REPO_ROOT .. "DCS-Checkride/Scripts/DCS-CheckrideMission.lua"

-- References saved after the first load so capture/restore works.
local _orig_sendEvent, _orig_sendEnrichmentEvent

--- Load (or reload) the mission script with DCS stubs.
--- @param overrides table|nil  Optional overrides passed to stubs.setup().
function M.load(overrides)
    stubs.setup(overrides)
    dofile(SCRIPT)
    _orig_sendEvent          = CheckrideMission.sendEvent
    _orig_sendEnrichmentEvent = CheckrideMission.sendEnrichmentEvent
end

--- Reset CheckrideMission mutable state between tests.
--- Also restores any captured send functions to originals.
function M.reset_state()
    if not CheckrideMission then return end
    CheckrideMission.EventQueue             = {}
    CheckrideMission.activeWeaponShots      = {}
    CheckrideMission.activeRefuelByPilot    = {}
    CheckrideMission.pendingKillsByObjectId = {}
    CheckrideMission.activeInboundMissiles  = {}
    CheckrideMission.gunBurstByUcid         = {}
    CheckrideMission.pilotCarrierByUcid     = {}
    CheckrideMission.WorldHandlerRegistered = false
    local fs = CheckrideMission.FlightSample
    if fs then
        fs.enabled = true
    end
    CheckrideMission.PilotGenerations = {}
    -- Restore original senders (undone any per-test capture).
    if _orig_sendEvent then
        CheckrideMission.sendEvent          = _orig_sendEvent
    end
    if _orig_sendEnrichmentEvent then
        CheckrideMission.sendEnrichmentEvent = _orig_sendEnrichmentEvent
    end
end

--- Override sendEvent to capture all outgoing messages (enrichments go through
--- sendEvent too, since sendEnrichmentEvent calls sendEvent internally).
--- Returns a list of raw message tables.  Call reset_state() in before_each to
--- restore the original between tests.
function M.capture_events()
    local captured = {}

    CheckrideMission.sendEvent = function(msg)
        table.insert(captured, msg)
        _orig_sendEvent(msg)
    end

    return captured
end

return M

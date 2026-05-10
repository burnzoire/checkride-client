-- DCS-CheckrideEnricher.lua  (static hook — copy to <Saved Games>\DCS\Scripts\Hooks\)
--
-- Lifecycle only. Delegates all enrichment to checkride-enricher-mission.lua
-- which runs in the Mission Scripting Environment where Unit/Weapon APIs live.
--
-- Pair with: <Saved Games>\DCS\checkride-enricher-mission.lua  (generated)
--
-- NOTE: Stop the Checkride app before using this hook — it replaces its callbacks.
-- Remove both files and restart DCS to restore normal operation.

local lfs = require('lfs')
local log = require('log')

local function enrichLog(msg)
    log.write('CheckrideEnricher', log.INFO, tostring(msg))
end

local EnrichCallbacks = {}

function EnrichCallbacks.onMissionLoadEnd()
    enrichLog('onMissionLoadEnd — injecting enricher into mission scripting env')

    local missionFile = lfs.writedir() .. 'checkride-enricher-mission.lua'

    -- Read source here in the hook env (io is available; dofile is NOT in MSE)
    local f = io.open(missionFile, 'r')
    if not f then
        enrichLog('Cannot open mission file: ' .. missionFile)
        return
    end
    local src = f:read('*a')
    f:close()

    if not src or src == '' then
        enrichLog('Mission file is empty: ' .. missionFile)
        return
    end

    -- Compile and run the source inside the MSE via loadstring,
    -- same pattern used by DCS-Checkride-hook.lua for mission injection.
    local code = string.format([[
local __src = %q
local __chunk, __err = loadstring(__src, '@checkride-enricher-mission.lua')
if not __chunk then return 'COMPILE_ERROR:' .. tostring(__err) end
local __ok, __result = pcall(__chunk)
if not __ok then return 'RUNTIME_ERROR:' .. tostring(__result) end
return tostring(__result)
]], src)

    local result, ok = net.dostring_in('server', code)
    if ok then
        enrichLog('Enricher result: ' .. tostring(result))
    else
        enrichLog('Enricher FAILED: ' .. tostring(result))
    end
end

DCS.setUserCallbacks(EnrichCallbacks)
enrichLog('CheckrideEnricher hook loaded — waiting for mission load')

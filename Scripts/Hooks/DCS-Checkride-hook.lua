local status, result = pcall(function() local dcsSr=require('lfs');dofile(dcsSr.writedir()..[[Mods\Services\DCS-Checkride\Scripts\DCS-CheckrideGameGUI.lua]]); end,nil)

if not status then
    net.log(result)
end

-- Inject mission script on mission load
local CheckrideMissionLoader = {}

function CheckrideMissionLoader.onMissionLoadEnd()
    local ok, err = pcall(function()
        local dcsSr = require('lfs')
        local scriptPath = dcsSr.writedir() .. [[Mods\Services\DCS-Checkride\Scripts\DCS-CheckrideMission.lua]]
        local code = string.format('dofile(%q)', scriptPath)
        local result, loadErr = net.dostring_in('mission', code)
        if not result then
            net.log('[DCS-Checkride] Mission script not loaded (MissionScripting may be sanitized): ' .. tostring(loadErr))
        else
            net.log('[DCS-Checkride] Mission script injected')
        end
    end)
    if not ok then
        net.log('[DCS-Checkride] Mission script injection skipped: ' .. tostring(err))
    end
end

DCS.setUserCallbacks(CheckrideMissionLoader)

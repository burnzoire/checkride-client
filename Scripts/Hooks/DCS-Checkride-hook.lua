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

        -- Export a UCID resolver into the mission env.
        -- Mission scripting cannot access net.*, so we maintain a
        -- name→UCID table synced on player connect/disconnect.
        net.dostring_in('mission', [[
            CheckridePlayers = CheckridePlayers or {}
            function CheckrideLookupUCID(playerName)
                return CheckridePlayers[playerName]
            end
        ]])

        -- Seed with any players already connected
        CheckrideMissionLoader.syncAllPlayers()

        local code = string.format([[
            local ok, err = pcall(dofile, %q)
            if ok then
                return 'OK'
            else
                return 'FAIL:' .. tostring(err)
            end
        ]], scriptPath)
        local result = net.dostring_in('mission', code)
        if result and result:sub(1, 2) == 'OK' then
            net.log('[DCS-Checkride] Mission script injected')
        else
            net.log('[DCS-Checkride] Mission script failed to load: ' .. tostring(result))
        end
    end)
    if not ok then
        net.log('[DCS-Checkride] Mission script injection skipped: ' .. tostring(err))
    end
end

function CheckrideMissionLoader.syncAllPlayers()
    local players = net.get_player_list()
    if not players then return end

    local entries = {}
    for _, id in ipairs(players) do
        local name = net.get_player_info(id, 'name')
        local ucid = net.get_player_info(id, 'ucid')
        if name and ucid and name ~= '' and ucid ~= '' then
            table.insert(entries, string.format('[%q]=%q', name, ucid))
        end
    end

    if #entries > 0 then
        net.dostring_in('mission', 'CheckridePlayers={' .. table.concat(entries, ',') .. '}')
    end
end

function CheckrideMissionLoader.onPlayerConnect(id)
    local name = net.get_player_info(id, 'name')
    local ucid = net.get_player_info(id, 'ucid')
    if name and ucid and name ~= '' and ucid ~= '' then
        net.dostring_in('mission', string.format('CheckridePlayers[%q]=%q', name, ucid))
    end
end

function CheckrideMissionLoader.onPlayerDisconnect(id)
    local name = net.get_player_info(id, 'name')
    if name and name ~= '' then
        net.dostring_in('mission', string.format('CheckridePlayers[%q]=nil', name))
    end
end

DCS.setUserCallbacks(CheckrideMissionLoader)
